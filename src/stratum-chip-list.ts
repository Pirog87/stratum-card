// Popup z listą encji pasujących do chipa.
//
// Klik w chip nagłówka otwiera ten panel. Pokazuje encje z per-domain
// akcjami:
// - light: toggle + brightness slider + master "wyłącz wszystkie"
// - switch: toggle + master off
// - cover: open/close per item + master
// - binary_sensor (motion/window/door/occupancy): read-only badge
//
// Zamykany: klik w backdrop, ×, Escape.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ChipConfig, HomeAssistant } from './types.js';

interface AreaGroup {
  /** Area ID albo pusty string dla „Bez pomieszczenia". */
  area_id: string;
  area_name: string;
  entity_ids: string[];
}

@customElement('stratum-chip-list')
export class StratumChipList extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public chip?: ChipConfig;

  /** Lista entity_id do pokazania. Rozwiązana przez wywołującego. */
  @property({ attribute: false }) public entityIds: string[] = [];

  /** Tytuł (np. „Włączone światła"). */
  @property({ type: String }) public label = '';

  /** Ikona MDI nagłówka. */
  @property({ type: String }) public icon = 'mdi:label-outline';

  /** Kolor akcentu nagłówka (CSS color). */
  @property({ type: String }) public color = 'var(--primary-color, #ff9b42)';

  private _close(): void {
    this.dispatchEvent(
      new CustomEvent('close', { bubbles: true, composed: true }),
    );
  }

  private _onBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this._close();
  }

  private _onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      this._close();
    }
  };

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeydown);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
  }

  /** Grupy encji wg area — każda sekcja to jeden pokój. */
  private _groupByArea(): AreaGroup[] {
    const groups = new Map<string, AreaGroup>();
    for (const id of this.entityIds) {
      const entry = this.hass?.entities?.[id];
      let areaId = entry?.area_id ?? undefined;
      if (!areaId && entry?.device_id) {
        areaId = this.hass?.devices?.[entry.device_id]?.area_id ?? undefined;
      }
      const key = areaId ?? '__none__';
      const areaName = areaId
        ? this.hass?.areas?.[areaId]?.name ?? areaId
        : 'Bez pomieszczenia';
      if (!groups.has(key)) {
        groups.set(key, { area_id: key, area_name: areaName, entity_ids: [] });
      }
      groups.get(key)!.entity_ids.push(id);
    }
    // Sortuj: named areas alfabetycznie, „Bez pomieszczenia" na końcu.
    return Array.from(groups.values()).sort((a, b) => {
      if (a.area_id === '__none__') return 1;
      if (b.area_id === '__none__') return -1;
      return a.area_name.localeCompare(b.area_name, 'pl');
    });
  }

  private _canControl(domain: string): boolean {
    return domain === 'light' || domain === 'switch' || domain === 'cover';
  }

  /** Zwraca mapę domain → ids dla zbioru encji — do per-grupowego master off. */
  private _splitByDomain(ids: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const id of ids) {
      const domain = id.split('.')[0] ?? '';
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain)!.push(id);
    }
    return map;
  }

  /** Master off dla zbioru encji — iteruje po domenach. */
  private _masterOffAll(ids: string[]): void {
    if (!this.hass) return;
    const byDomain = this._splitByDomain(ids);
    for (const [domain, list] of byDomain) {
      if (!this._canControl(domain)) continue;
      const service = domain === 'cover' ? 'close_cover' : 'turn_off';
      void this.hass.callService(domain, service, { entity_id: list });
    }
  }

  /** Czy jakiekolwiek encje w grupie są kontrolowalne i ON — pokazuje master btn. */
  private _groupHasControllableOn(ids: string[]): boolean {
    return ids.some((id) => {
      const domain = id.split('.')[0] ?? '';
      if (!this._canControl(domain)) return false;
      return this.hass?.states?.[id]?.state === 'on';
    });
  }

  private _toggle(entity_id: string): void {
    if (!this.hass) return;
    const domain = entity_id.split('.')[0] ?? '';
    if (!this._canControl(domain)) return;
    void this.hass.callService(domain, 'toggle', { entity_id });
  }

  private _setBrightness(entity_id: string, ev: Event): void {
    if (!this.hass) return;
    const pct = parseInt((ev.target as HTMLInputElement).value, 10);
    void this.hass.callService('light', 'turn_on', {
      entity_id,
      brightness_pct: pct,
    });
  }

  private _setCoverPosition(entity_id: string, ev: Event): void {
    if (!this.hass) return;
    const pos = parseInt((ev.target as HTMLInputElement).value, 10);
    void this.hass.callService('cover', 'set_cover_position', {
      entity_id,
      position: pos,
    });
  }

  private _moreInfo(entity_id: string): void {
    const event = new CustomEvent('hass-more-info', {
      detail: { entityId: entity_id },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _friendlyName(entity_id: string): string {
    return (
      (this.hass?.states?.[entity_id]?.attributes?.friendly_name as
        | string
        | undefined) ?? entity_id
    );
  }

  protected render(): TemplateResult {
    const groups = this._groupByArea();
    const total = this.entityIds.length;
    const globalHasControllableOn = this._groupHasControllableOn(this.entityIds);
    return html`
      <div
        class="backdrop"
        part="chip-list-popup"
        @click=${this._onBackdropClick}
      >
        <div class="panel" role="dialog" aria-modal="true" aria-label=${this.label}>
          <div class="head" style="--accent:${this.color};">
            <span class="avatar">
              <ha-icon .icon=${this.icon}></ha-icon>
            </span>
            <div class="head-body">
              <div class="head-title">${this.label}</div>
              <div class="head-count">
                ${total} ${total === 1 ? 'pozycja' : 'pozycji'} ·
                ${groups.length} ${groups.length === 1 ? 'pokój' : 'pokoi'}
              </div>
            </div>
            ${globalHasControllableOn
              ? html`<button
                  class="master-global"
                  title="Wyłącz wszystkie we wszystkich pokojach"
                  @click=${() => this._masterOffAll(this.entityIds)}
                >
                  <ha-icon .icon=${'mdi:power'}></ha-icon>
                  <span>Wyłącz wszystkie</span>
                </button>`
              : nothing}
            <button class="close" title="Zamknij" @click=${this._close}>
              <ha-icon .icon=${'mdi:close'}></ha-icon>
            </button>
          </div>

          ${total === 0
            ? html`<div class="empty">
                <ha-icon .icon=${'mdi:check-circle-outline'}></ha-icon>
                <span>Nic aktywnego — wszystko pod kontrolą.</span>
              </div>`
            : html`<div class="list">
                ${groups.map((g) => this._renderGroup(g))}
              </div>`}
        </div>
      </div>
    `;
  }

  private _renderGroup(group: AreaGroup): TemplateResult {
    const hasControllableOn = this._groupHasControllableOn(group.entity_ids);
    return html`
      <div class="group">
        <div class="group-head">
          <span class="group-area">
            <ha-icon .icon=${'mdi:floor-plan'}></ha-icon>
            <span class="group-area-name">${group.area_name}</span>
            <span class="group-area-count">${group.entity_ids.length}</span>
          </span>
          ${hasControllableOn
            ? html`<button
                class="master-btn"
                title="Wyłącz wszystkie w tym pokoju"
                @click=${() => this._masterOffAll(group.entity_ids)}
              >
                <ha-icon .icon=${'mdi:power'}></ha-icon>
                <span>Wyłącz</span>
              </button>`
            : nothing}
        </div>
        <div class="group-body">
          ${group.entity_ids.map((id) =>
            this._renderItem(id, id.split('.')[0] ?? ''),
          )}
        </div>
      </div>
    `;
  }

  private _renderItem(entity_id: string, domain: string): TemplateResult {
    const state = this.hass?.states?.[entity_id];
    const isOn = state?.state === 'on';
    const name = this._friendlyName(entity_id);
    const icon =
      (state?.attributes?.icon as string | undefined) ?? this._defaultIcon(domain, isOn);
    const supportsDim =
      domain === 'light' &&
      typeof state?.attributes?.brightness === 'number';
    const brightnessPct = supportsDim
      ? Math.round(((state?.attributes?.brightness as number) / 255) * 100)
      : 0;
    const coverPosRaw = state?.attributes?.current_position;
    const coverPos =
      domain === 'cover' && typeof coverPosRaw === 'number'
        ? Math.round(coverPosRaw)
        : undefined;

    const controllable = this._canControl(domain);
    const iconColor =
      domain === 'light' && isOn
        ? this._lightColor(state?.attributes as Record<string, unknown> | undefined)
        : undefined;
    const hint = this._stateHint(state, domain);

    return html`
      <div class="item ${isOn ? 'active' : ''}">
        <button
          class="item-icon"
          style=${iconColor ? `--icon-color:${iconColor};` : ''}
          @click=${() => this._moreInfo(entity_id)}
          title="Więcej info"
        >
          <ha-icon .icon=${icon}></ha-icon>
        </button>
        <div class="item-body">
          <div class="item-row">
            <span class="item-name">${name}</span>
            ${hint ? html`<span class="item-hint">${hint}</span>` : nothing}
          </div>
          ${supportsDim && isOn
            ? html`<input
                type="range"
                class="bri-slider"
                min="1"
                max="100"
                step="1"
                .value=${String(brightnessPct)}
                @change=${(ev: Event) => this._setBrightness(entity_id, ev)}
                @click=${(ev: Event) => ev.stopPropagation()}
              />`
            : nothing}
          ${domain === 'cover' && coverPos !== undefined
            ? html`<input
                type="range"
                class="bri-slider"
                min="0"
                max="100"
                step="1"
                .value=${String(coverPos)}
                @change=${(ev: Event) => this._setCoverPosition(entity_id, ev)}
                @click=${(ev: Event) => ev.stopPropagation()}
              />`
            : nothing}
        </div>
        ${controllable
          ? html`<button
              class="toggle ${isOn ? 'on' : ''}"
              @click=${() => this._toggle(entity_id)}
              role="switch"
              aria-checked=${isOn}
              title=${isOn ? 'Wyłącz' : 'Włącz'}
            >
              <span class="toggle-knob"></span>
            </button>`
          : html`<span class="state-badge ${isOn ? 'on' : ''}">
              ${this._statusText(state, domain)}
            </span>`}
      </div>
    `;
  }

  private _defaultIcon(domain: string, on: boolean): string {
    if (domain === 'light') return on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline';
    if (domain === 'switch') return on ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off-outline';
    if (domain === 'cover') return 'mdi:window-shutter';
    if (domain === 'binary_sensor') return 'mdi:motion-sensor';
    return 'mdi:label-outline';
  }

  private _lightColor(attrs: Record<string, unknown> | undefined): string | undefined {
    if (!attrs) return undefined;
    const rgb = attrs.rgb_color as [number, number, number] | undefined;
    if (rgb) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    return undefined;
  }

  private _stateHint(
    state: { attributes?: Record<string, unknown> } | undefined,
    domain: string,
  ): string {
    if (!state) return '';
    const attrs = state.attributes ?? {};
    if (domain === 'light' && typeof attrs.brightness === 'number') {
      const pct = Math.round(((attrs.brightness as number) / 255) * 100);
      return `${pct}%`;
    }
    if (domain === 'cover' && typeof attrs.current_position === 'number') {
      return `${attrs.current_position}%`;
    }
    return '';
  }

  private _statusText(
    state: { state?: string } | undefined,
    domain: string,
  ): string {
    if (!state) return '—';
    const isOn = state.state === 'on';
    if (domain === 'binary_sensor') {
      const cls =
        ((state as { attributes?: Record<string, unknown> }).attributes?.device_class as
          | string
          | undefined) ?? '';
      if (cls === 'motion' || cls === 'occupancy') return isOn ? 'obecność' : 'brak';
      if (cls === 'window') return isOn ? 'otwarte' : 'zamknięte';
      if (cls === 'door') return isOn ? 'otwarte' : 'zamknięte';
      return isOn ? 'aktywne' : 'nieaktywne';
    }
    return state.state ?? '—';
  }

  static styles = css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fade-in 0.15s ease-out;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .panel {
      position: relative;
      max-width: min(480px, 92vw);
      width: 100%;
      max-height: 82vh;
      display: flex;
      flex-direction: column;
      border-radius: var(--ha-card-border-radius, 14px);
      background: var(--ha-card-background, var(--card-background-color, #1e1f22));
      color: var(--primary-text-color);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      animation: pop-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes pop-in {
      from { transform: scale(0.94); opacity: 0.5; }
      to { transform: scale(1); opacity: 1; }
    }

    .head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 16%, transparent),
        transparent
      );
    }

    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color, #ff9b42)) 22%,
        transparent
      );
      color: var(--accent, var(--primary-color, #ff9b42));
    }

    .avatar ha-icon {
      --mdc-icon-size: 22px;
    }

    .head-body {
      flex: 1;
      min-width: 0;
    }

    .head-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .head-count {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
    }

    .close {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 0;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      color: var(--primary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s ease, transform 0.08s ease;
    }
    .close:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 22%, transparent);
      color: var(--error-color, #e53935);
    }
    .close:active {
      transform: scale(0.95);
    }

    .empty {
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--secondary-text-color);
      font-size: 14px;
      text-align: center;
    }
    .empty ha-icon {
      --mdc-icon-size: 36px;
      color: var(--success-color, #4caf50);
    }

    .list {
      overflow-y: auto;
      padding: 6px 0 10px;
    }

    .master-global {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--divider-color);
      background: transparent;
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      flex-shrink: 0;
    }
    .master-global ha-icon { --mdc-icon-size: 16px; }
    .master-global:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 14%, transparent);
      border-color: var(--error-color, #e53935);
      color: var(--error-color, #e53935);
    }

    .group {
      padding: 0 14px;
    }

    .group + .group {
      margin-top: 8px;
      padding-top: 6px;
    }

    .group-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 6px;
      padding: 0 2px;
    }

    .group-area {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .group-area ha-icon {
      --mdc-icon-size: 14px;
      color: var(--secondary-text-color);
    }
    .group-area-name {
      font-weight: 600;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-size: 11px;
    }
    .group-area-count {
      font-variant-numeric: tabular-nums;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--divider-color, rgba(255, 255, 255, 0.08));
      font-size: 10px;
      font-weight: 700;
    }

    .master-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid var(--divider-color);
      background: transparent;
      color: var(--secondary-text-color);
      font-size: 11px;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      flex-shrink: 0;
    }
    .master-btn ha-icon { --mdc-icon-size: 13px; }
    .master-btn:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 12%, transparent);
      border-color: var(--error-color, #e53935);
      color: var(--error-color, #e53935);
    }

    .group-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border-radius: 10px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.03));
      border: 1px solid transparent;
      transition: border-color 0.12s ease, background 0.12s ease;
    }

    .item.active {
      border-color: color-mix(
        in srgb,
        var(--icon-color, var(--accent, var(--primary-color, #ff9b42))) 30%,
        transparent
      );
    }

    .item-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 0;
      background: color-mix(
        in srgb,
        var(--icon-color, var(--secondary-text-color)) 18%,
        transparent
      );
      color: var(--icon-color, var(--secondary-text-color));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.08s ease;
    }
    .item.active .item-icon {
      background: color-mix(in srgb, var(--icon-color, #ffc107) 24%, transparent);
      color: var(--icon-color, #ffc107);
    }
    .item-icon:hover { transform: scale(1.06); }
    .item-icon:active { transform: scale(0.94); }
    .item-icon ha-icon { --mdc-icon-size: 16px; }

    .item-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .item-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }

    .item-name {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-hint {
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }

    .bri-slider {
      width: 100%;
      height: 4px;
      accent-color: var(--icon-color, var(--primary-color, #ff9b42));
      cursor: pointer;
    }

    .toggle {
      position: relative;
      width: 36px;
      height: 20px;
      border-radius: 999px;
      border: 0;
      background: var(--divider-color, rgba(255, 255, 255, 0.2));
      cursor: pointer;
      padding: 0;
      transition: background 0.15s ease;
      flex-shrink: 0;
    }

    .toggle.on {
      background: var(--primary-color, #ff9b42);
    }

    .toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .toggle.on .toggle-knob {
      transform: translateX(16px);
    }

    .state-badge {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--divider-color, rgba(255, 255, 255, 0.08));
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }

    .state-badge.on {
      background: color-mix(in srgb, var(--primary-color, #ff9b42) 25%, transparent);
      color: var(--primary-color, #ff9b42);
    }

    @media (prefers-reduced-motion: reduce) {
      .backdrop,
      .panel,
      .toggle-knob {
        animation: none;
        transition: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-chip-list': StratumChipList;
  }
}
