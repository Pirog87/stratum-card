// Popup z listą encji pasujących do chipa.
//
// Klik w chip nagłówka otwiera ten panel. Układ (wariant C):
// - zakładki pokojów ("Wszystkie · N" + per pokój) filtrują listę,
// - light/switch/cover: duży wiersz z kolorową ikoną, toggle i grubym
//   suwakiem jasności/pozycji, sticky stopka "Wyłącz wszystkie",
// - czujki (motion/occupancy/drzwi/okna/...): prosty wiersz — ikona,
//   nazwa + pokój, po prawej czas od zmiany stanu (16s / 4min / 2h).
//   Klik = more-info. Lista zawiera tylko aktywne encje.
//
// Zamykany: klik w backdrop, ×, Escape, Android wstecz.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ChipConfig, HomeAssistant } from './types.js';
import { ago } from './chip-defaults.js';
import { lightColorOf } from './tile-data.js';

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

  /** Aktywna zakładka pokoju — null = „Wszystkie". */
  @state() private _areaFilter: string | null = null;

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

  private _areaOf(id: string): { key: string; name: string } {
    const entry = this.hass?.entities?.[id];
    let areaId = entry?.area_id ?? undefined;
    if (!areaId && entry?.device_id) {
      areaId = this.hass?.devices?.[entry.device_id]?.area_id ?? undefined;
    }
    if (!areaId) return { key: '__none__', name: 'Bez pomieszczenia' };
    return { key: areaId, name: this.hass?.areas?.[areaId]?.name ?? areaId };
  }

  /** Grupy encji wg area — do zakładek. */
  private _groupByArea(): AreaGroup[] {
    const groups = new Map<string, AreaGroup>();
    for (const id of this.entityIds) {
      const { key, name } = this._areaOf(id);
      if (!groups.has(key)) {
        groups.set(key, { area_id: key, area_name: name, entity_ids: [] });
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

  /** Zwraca mapę domain → ids dla zbioru encji — do master off. */
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

  /** Czy jakiekolwiek encje w zbiorze są kontrolowalne i ON. */
  private _hasControllableOn(ids: string[]): boolean {
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
    // Zakładka może wskazywać pokój, który właśnie zniknął z listy
    // (ostatnia encja zgasła) — wtedy wracamy na „Wszystkie".
    const filter =
      this._areaFilter && groups.some((g) => g.area_id === this._areaFilter)
        ? this._areaFilter
        : null;
    // „Wszystkie" — posortowane pomieszczeniami (kolejność jak zakładki).
    const visible = filter
      ? groups.find((g) => g.area_id === filter)!.entity_ids
      : groups.flatMap((g) => g.entity_ids);
    const showFooter = this._hasControllableOn(visible);
    return html`
      <div
        class="backdrop"
        part="chip-list-popup"
        @click=${this._onBackdropClick}
      >
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-label=${this.label}
          style="--accent:${this.color};"
        >
          <div class="head">
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
            <button class="close" title="Zamknij" @click=${this._close}>
              <ha-icon .icon=${'mdi:close'}></ha-icon>
            </button>
          </div>

          ${groups.length > 1
            ? html`<div class="tabs">
                <button
                  class="tab ${filter === null ? 'on' : ''}"
                  @click=${() => (this._areaFilter = null)}
                >
                  Wszystkie · ${total}
                </button>
                ${groups.map(
                  (g) => html`<button
                    class="tab ${filter === g.area_id ? 'on' : ''}"
                    @click=${() => (this._areaFilter = g.area_id)}
                  >
                    ${g.area_name} · ${g.entity_ids.length}
                  </button>`,
                )}
              </div>`
            : nothing}

          ${total === 0
            ? html`<div class="empty">
                <ha-icon .icon=${'mdi:check-circle-outline'}></ha-icon>
                <span>Nic aktywnego — wszystko pod kontrolą.</span>
              </div>`
            : html`<div class="list">
                ${visible.map((id) => this._renderRow(id))}
              </div>`}
          ${showFooter
            ? html`<div class="foot">
                <button
                  class="master"
                  @click=${() => this._masterOffAll(visible)}
                >
                  <ha-icon .icon=${'mdi:power'}></ha-icon>
                  <span>Wyłącz wszystkie (${visible.length})</span>
                </button>
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderRow(entity_id: string): TemplateResult {
    const domain = entity_id.split('.')[0] ?? '';
    return this._canControl(domain)
      ? this._renderControlRow(entity_id, domain)
      : this._renderSensorRow(entity_id);
  }

  /** Duży wiersz sterowalny: ikona + pokój/urządzenie + toggle + gruby suwak. */
  private _renderControlRow(
    entity_id: string,
    domain: string,
  ): TemplateResult {
    const state = this.hass?.states?.[entity_id];
    const isOn = state?.state === 'on';
    const name = this._friendlyName(entity_id);
    const icon =
      (state?.attributes?.icon as string | undefined) ??
      this._defaultIcon(domain, isOn);
    const supportsDim =
      domain === 'light' && typeof state?.attributes?.brightness === 'number';
    const brightnessPct = supportsDim
      ? Math.round(((state?.attributes?.brightness as number) / 255) * 100)
      : 0;
    const coverPosRaw = state?.attributes?.current_position;
    const coverPos =
      domain === 'cover' && typeof coverPosRaw === 'number'
        ? Math.round(coverPosRaw)
        : undefined;
    const lightColor =
      domain === 'light' && isOn ? lightColorOf(state) : undefined;
    // Pokój wyboldowany u góry, pod spodem urządzenie (+ % gdy jest).
    const area = this._areaOf(entity_id).name;
    const hintParts: string[] = [name];
    if (supportsDim && isOn) hintParts.push(`${brightnessPct}%`);
    if (coverPos !== undefined) hintParts.push(`${coverPos}%`);
    const sub = hintParts.join(' · ');

    return html`
      <div
        class="crow ${isOn ? 'active' : ''}"
        style=${lightColor ? `--c:${lightColor};` : ''}
      >
        <div class="crow-top">
          <button
            class="bub"
            @click=${() => this._moreInfo(entity_id)}
            title="Więcej info"
          >
            <ha-icon .icon=${icon}></ha-icon>
          </button>
          <div class="mid">
            <span class="nm">${area}</span>
            ${sub ? html`<span class="sub">${sub}</span>` : nothing}
          </div>
          <button
            class="toggle ${isOn ? 'on' : ''}"
            @click=${() => this._toggle(entity_id)}
            role="switch"
            aria-checked=${isOn}
            title=${isOn ? 'Wyłącz' : 'Włącz'}
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        ${supportsDim && isOn
          ? html`<input
              type="range"
              class="bri-slider"
              min="1"
              max="100"
              step="1"
              style="--pct:${brightnessPct}%;"
              .value=${String(brightnessPct)}
              @input=${(ev: Event) => {
                const el = ev.target as HTMLInputElement;
                el.style.setProperty('--pct', `${el.value}%`);
              }}
              @change=${(ev: Event) => this._setBrightness(entity_id, ev)}
              @click=${(ev: Event) => ev.stopPropagation()}
            />`
          : nothing}
        ${coverPos !== undefined
          ? html`<input
              type="range"
              class="bri-slider"
              min="0"
              max="100"
              step="1"
              style="--pct:${coverPos}%;"
              .value=${String(coverPos)}
              @input=${(ev: Event) => {
                const el = ev.target as HTMLInputElement;
                el.style.setProperty('--pct', `${el.value}%`);
              }}
              @change=${(ev: Event) => this._setCoverPosition(entity_id, ev)}
              @click=${(ev: Event) => ev.stopPropagation()}
            />`
          : nothing}
      </div>
    `;
  }

  /**
   * Prosty wiersz czujki (obecność, drzwi, okna, wyciek...): ikona,
   * nazwa + pokój, po prawej czas od zmiany stanu. Klik = more-info.
   */
  private _renderSensorRow(entity_id: string): TemplateResult {
    const state = this.hass?.states?.[entity_id];
    const isOn = state?.state === 'on';
    const name = this._friendlyName(entity_id);
    const icon =
      (state?.attributes?.icon as string | undefined) ??
      this._defaultIcon(entity_id.split('.')[0] ?? '', isOn);
    const area = this._areaOf(entity_id).name;
    const lastChanged = (state as { last_changed?: string } | undefined)
      ?.last_changed;
    return html`
      <button
        class="prow ${isOn ? 'active' : ''}"
        @click=${() => this._moreInfo(entity_id)}
        title="Więcej info"
      >
        <span class="bub">
          <ha-icon .icon=${icon}></ha-icon>
        </span>
        <span class="mid">
          <span class="nm">${area}</span>
          <span class="sub">${name}</span>
        </span>
        ${lastChanged
          ? html`<span class="tm">${ago(lastChanged)}</span>`
          : nothing}
      </button>
    `;
  }

  private _defaultIcon(domain: string, on: boolean): string {
    if (domain === 'light') return on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline';
    if (domain === 'switch') return on ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off-outline';
    if (domain === 'cover') return 'mdi:window-shutter';
    if (domain === 'binary_sensor') return 'mdi:motion-sensor';
    return 'mdi:label-outline';
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
      max-width: min(560px, 94vw);
      width: 100%;
      max-height: 86vh;
      display: flex;
      flex-direction: column;
      border-radius: 20px;
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
      padding: 16px 18px 14px;
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 16%, transparent),
        transparent
      );
      flex-shrink: 0;
    }

    .avatar {
      width: 46px;
      height: 46px;
      border-radius: 14px;
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
      --mdc-icon-size: 24px;
    }

    .head-body {
      flex: 1;
      min-width: 0;
    }

    .head-title {
      font-size: 17px;
      font-weight: 700;
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
      flex-shrink: 0;
    }
    .close:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 22%, transparent);
      color: var(--error-color, #e53935);
    }
    .close:active {
      transform: scale(0.95);
    }

    .tabs {
      display: flex;
      gap: 8px;
      padding: 12px 16px 2px;
      overflow-x: auto;
      scrollbar-width: none;
      flex-shrink: 0;
    }
    .tabs::-webkit-scrollbar { display: none; }

    .tab {
      flex-shrink: 0;
      border: 1px solid transparent;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 14px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      font-variant-numeric: tabular-nums;
    }
    .tab.on {
      background: color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 16%, transparent);
      border-color: color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 45%, transparent);
      color: var(--accent, var(--primary-color, #ff9b42));
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
      padding: 12px 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* --- wiersz sterowalny (światła / przełączniki / rolety) --- */

    .crow {
      display: flex;
      flex-direction: column;
      gap: 9px;
      border-radius: 16px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      padding: 12px 14px;
    }

    .crow-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .crow .bub {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      border: 0;
      background: color-mix(
        in srgb,
        var(--c, var(--accent, var(--primary-color, #ff9b42))) 20%,
        transparent
      );
      color: var(--c, var(--accent, var(--primary-color, #ff9b42)));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.08s ease;
    }
    .crow .bub:hover { transform: scale(1.06); }
    .crow .bub:active { transform: scale(0.94); }
    .crow .bub ha-icon { --mdc-icon-size: 20px; }

    .mid {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .nm {
      font-size: 14.5px;
      font-weight: 600;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }

    .sub {
      font-size: 11.5px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
      font-variant-numeric: tabular-nums;
    }

    .toggle {
      position: relative;
      width: 48px;
      height: 26px;
      border-radius: 999px;
      border: 0;
      background: var(--divider-color, rgba(255, 255, 255, 0.2));
      cursor: pointer;
      padding: 0;
      transition: background 0.15s ease;
      flex-shrink: 0;
    }

    .toggle.on {
      background: var(--c, var(--accent, var(--primary-color, #ff9b42)));
    }

    .toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .toggle.on .toggle-knob {
      transform: translateX(22px);
    }

    .bri-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 12px;
      margin: 0;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        var(--c, var(--accent, var(--primary-color, #ff9b42))) var(--pct, 0%),
        rgba(255, 255, 255, 0.12) var(--pct, 0%)
      );
      cursor: pointer;
      outline: none;
    }

    .bri-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #fff;
      border: 0;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
      cursor: pointer;
    }

    .bri-slider::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #fff;
      border: 0;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
      cursor: pointer;
    }

    .bri-slider:focus-visible {
      outline: 2px solid var(--c, var(--accent, var(--primary-color, #ff9b42)));
      outline-offset: 2px;
    }

    /* --- prosty wiersz czujki --- */

    .prow {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 58px;
      padding: 10px 14px;
      border-radius: 16px;
      border: 0;
      font: inherit;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      color: var(--primary-text-color);
      cursor: pointer;
      text-align: left;
      transition: background 0.12s ease;
      width: 100%;
    }
    .prow:hover {
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color, #ff9b42)) 8%,
        var(--secondary-background-color, rgba(255, 255, 255, 0.04))
      );
    }

    .prow .bub {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.07);
      color: var(--secondary-text-color);
    }
    .prow.active .bub {
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color, #ff9b42)) 18%,
        transparent
      );
      color: var(--accent, var(--primary-color, #ff9b42));
    }
    .prow .bub ha-icon { --mdc-icon-size: 20px; }

    .prow .tm {
      font-size: 12.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }
    .prow.active .tm {
      color: var(--accent, var(--primary-color, #ff9b42));
    }

    /* --- sticky stopka --- */

    .foot {
      padding: 10px 16px 14px;
      flex-shrink: 0;
      background: linear-gradient(
        to top,
        var(--ha-card-background, var(--card-background-color, #1e1f22)) 65%,
        transparent
      );
    }

    .master {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 13px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: color-mix(in srgb, var(--error-color, #e53935) 16%, transparent);
      color: var(--error-color, #e53935);
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .master:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 26%, transparent);
    }
    .master ha-icon { --mdc-icon-size: 18px; }

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
