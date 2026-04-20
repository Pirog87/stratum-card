// stratum-card
//
// Customowa karta Home Assistant: podsumowanie warstwy (floor lub area)
// z rozwijanym body. Zobacz docs/roadmap.md dla kolejnych milestone'ów.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HassEntityRegistryEntry,
  HomeAssistant,
  StratumCardConfig,
} from './types.js';
import {
  getAreasInFloor,
  getEntitiesInArea,
  getEntitiesInFloor,
  filterByDomain,
  filterBinarySensorDeviceClass,
} from './area-entities.js';
import {
  DEFAULT_CHIPS,
  evaluateChip,
  resolveChipColor,
  resolveChipIcon,
} from './chip-defaults.js';
import { runTapAction } from './tap-action.js';
import { TemplateRenderer } from './template-renderer.js';
import './stratum-card-chip.js';
import './stratum-card-editor.js';
import './stratum-card-room-row.js';
import './stratum-room-card.js';
import './stratum-scene-bar.js';

const VERSION = '1.10.0';

@customElement('stratum-card')
export class StratumCard extends LitElement {
  /** Wstrzykiwane automatycznie przez Home Assistant przy każdej zmianie stanu. */
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumCardConfig;
  @state() private _expanded = false;

  /** Popup: aktualnie otwarte pomieszczenie z overrides z RoomConfig. */
  @state() private _popupRoom?: {
    area_id: string;
    merge_with?: string[];
    sections?: import('./types.js').RoomSectionSpec[];
    scenes?: import('./types.js').SceneBarConfig;
    chips?: import('./types.js').ChipConfig[];
  };

  /** Template renderer — subskrybuje Jinja2 przez WebSocket i wywołuje rerender. */
  private _templates = new TemplateRenderer(() => this.requestUpdate());

  /** Timer auto-collapse — wołany gdy karta rozwinięta i nic nie klikniemy. */
  private _autoCollapseTimer?: number;

  private _autoCollapseSeconds(): number {
    const v = this._config?.auto_collapse;
    return typeof v === 'number' ? v : 60;
  }

  private _scheduleAutoCollapse(): void {
    this._clearAutoCollapse();
    const seconds = this._autoCollapseSeconds();
    if (seconds <= 0 || !this._expanded) return;
    this._autoCollapseTimer = window.setTimeout(() => {
      this._autoCollapseTimer = undefined;
      if (this._expanded) {
        this._expanded = false;
        this.dispatchEvent(
          new CustomEvent('stratum-card-toggle', {
            detail: { expanded: false, reason: 'auto-collapse' },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }, seconds * 1000);
  }

  private _clearAutoCollapse(): void {
    if (this._autoCollapseTimer !== undefined) {
      window.clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = undefined;
    }
  }

  private _onInteraction = (): void => {
    if (this._expanded) this._scheduleAutoCollapse();
  };

  /** HA wymaga żeby karta miała metodę `setConfig` — rzuci tu przy błędnej konfiguracji. */
  public setConfig(config: StratumCardConfig): void {
    if (!config) {
      throw new Error('Konfiguracja jest wymagana.');
    }
    if (!config.floor_id && !config.area_id && !config.name) {
      throw new Error('Podaj `floor_id`, `area_id` lub `name`.');
    }
    this._config = config;
    this._expanded = Boolean(config.expanded);
    if (this._expanded) this._scheduleAutoCollapse();
  }

  /** HA używa tego do kalkulacji layoutu masonry. */
  public getCardSize(): number {
    return this._expanded ? 4 : 1;
  }

  /** Powiązuje wizualny editor z kartą — UI dashboardu HA wywoła to przy „Edit". */
  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('stratum-card-editor');
  }

  /** Sensowny default gdy user dodaje kartę przez wizard „Add card". */
  public static getStubConfig(
    hass: HomeAssistant,
    _entities: string[],
    _entitiesFallback: string[],
  ): Partial<StratumCardConfig> {
    const firstFloor = hass?.floors && Object.keys(hass.floors)[0];
    if (firstFloor) return { floor_id: firstFloor };
    const firstArea = hass?.areas && Object.keys(hass.areas)[0];
    return { area_id: firstArea ?? '' };
  }

  private _toggleExpand = (): void => {
    this._expanded = !this._expanded;
    this.dispatchEvent(
      new CustomEvent('stratum-card-toggle', {
        detail: { expanded: this._expanded, reason: 'user' },
        bubbles: true,
        composed: true,
      }),
    );
    if (this._expanded) this._scheduleAutoCollapse();
    else this._clearAutoCollapse();
  };

  private _resolveName(): string {
    if (this._config?.name) return this._config.name;
    if (this._config?.floor_id && this.hass?.floors) {
      const floor = this.hass.floors[this._config.floor_id];
      if (floor?.name) return floor.name;
    }
    if (this._config?.area_id && this.hass?.areas) {
      const area = this.hass.areas[this._config.area_id];
      if (area?.name) return area.name;
    }
    return this._config?.floor_id ?? this._config?.area_id ?? 'Stratum';
  }

  private _resolveIcon(): string {
    if (this._config?.icon) return this._config.icon;
    if (this._config?.floor_id && this.hass?.floors) {
      const floor = this.hass.floors[this._config.floor_id];
      if (floor?.icon) return floor.icon;
    }
    if (this._config?.area_id && this.hass?.areas) {
      const area = this.hass.areas[this._config.area_id];
      if (area?.icon) return area.icon;
    }
    return 'mdi:home';
  }

  private _getEntries() {
    if (!this.hass) return [];
    if (this._config?.floor_id) {
      return getEntitiesInFloor(this.hass, this._config.floor_id);
    }
    if (this._config?.area_id) {
      return getEntitiesInArea(this.hass, this._config.area_id);
    }
    return [];
  }

  private _renderChips(): TemplateResult[] {
    if (!this.hass) return [];
    this._templates.setHass(this.hass);
    const entries = this._getEntries();
    const chips = this._config?.chips ?? DEFAULT_CHIPS;
    return chips.map((chip) => {
      const { label, active } = evaluateChip(this.hass!, entries, chip, this._templates);
      const hasTap = Boolean(chip.tap_action && chip.tap_action.action !== 'none');
      return html`<stratum-card-chip
        .icon=${resolveChipIcon(chip)}
        .label=${label}
        .active=${active}
        .color=${resolveChipColor(chip)}
        .showWhenZero=${chip.show_when_zero ?? false}
        .clickable=${hasTap}
        @chip-tap=${() => this._onChipTap(chip)}
      ></stratum-card-chip>`;
    });
  }

  private _onChipTap(chip: { tap_action?: unknown }): void {
    void runTapAction(this.hass, chip.tap_action as never, { source: this });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._templates.destroy();
    this._clearAutoCollapse();
    document.removeEventListener('keydown', this._onPopupKey);
  }

  private _debugLog(): void {
    if (!this.hass) return;
    const entries = this._getEntries();
    const scope = this._config?.floor_id
      ? `floor=${this._config.floor_id}`
      : `area=${this._config?.area_id}`;
    const lights = filterByDomain(entries, 'light');
    const motion = filterBinarySensorDeviceClass(this.hass, entries, 'motion');
    const occupancy = filterBinarySensorDeviceClass(this.hass, entries, 'occupancy');
    const windows = filterBinarySensorDeviceClass(this.hass, entries, 'window');
    const doors = filterBinarySensorDeviceClass(this.hass, entries, 'door');
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[stratum-card] ${scope} (${entries.length} entities)`);
    // eslint-disable-next-line no-console
    console.table({
      lights: lights.length,
      motion: motion.length,
      occupancy: occupancy.length,
      windows: windows.length,
      doors: doors.length,
    });
    // eslint-disable-next-line no-console
    console.log('all entries:', entries.map((e) => e.entity_id));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;

    const name = this._resolveName();
    const icon = this._resolveIcon();

    if (this._config.debug) this._debugLog();

    return html`
      <ha-card part="card" @pointerdown=${this._onInteraction}>
        <button
          class="header"
          part="header"
          @click=${this._toggleExpand}
          aria-expanded=${this._expanded}
          aria-label="Rozwiń ${name}"
        >
          <ha-icon class="area-icon" part="area-icon" .icon=${icon}></ha-icon>
          <span class="title" part="title">${name}</span>
          <div class="chips" part="chips">
            ${this._renderChips()}
          </div>
          <ha-icon
            class="expander ${this._expanded ? 'open' : ''}"
            part="expander"
            .icon=${'mdi:chevron-down'}
          ></ha-icon>
        </button>

        <div
          class="body-wrap ${this._expanded ? 'open' : ''}"
          part="body"
          aria-hidden=${!this._expanded}
        >
          <div class="body">${this._renderBody()}</div>
        </div>
      </ha-card>
      ${this._renderPopup()}
    `;
  }

  private _renderPopup(): TemplateResult {
    if (!this._popupRoom) return html``;
    const popupConfig: import('./types.js').StratumRoomCardConfig = {
      type: 'custom:stratum-room-card',
      area_id: this._popupRoom.area_id,
      merge_with: this._popupRoom.merge_with,
      sections: this._popupRoom.sections,
      scenes: this._popupRoom.scenes,
      chips: this._popupRoom.chips,
    };
    return html`
      <div
        class="stratum-popup-backdrop"
        part="popup"
        @click=${(ev: MouseEvent) => this._onBackdropClick(ev)}
      >
        <div class="stratum-popup-card" @click=${(ev: Event) => ev.stopPropagation()}>
          <button
            class="stratum-popup-close"
            title="Zamknij"
            @click=${this._closeRoomPopup}
          >
            <ha-icon .icon=${'mdi:close'}></ha-icon>
          </button>
          <stratum-room-card
            .hass=${this.hass}
            .config=${popupConfig}
          ></stratum-room-card>
        </div>
      </div>
    `;
  }

  private _renderBody(): TemplateResult[] {
    const parts: TemplateResult[] = [];
    const scenes = this._config?.scenes;
    const position = scenes?.position ?? 'top';
    const sceneBar =
      scenes && scenes.items && scenes.items.length > 0
        ? html`<stratum-scene-bar
            .hass=${this.hass}
            .config=${scenes}
          ></stratum-scene-bar>`
        : null;
    const roomsTemplate = this._renderRooms();

    if (position === 'top' && sceneBar) parts.push(sceneBar);
    if (roomsTemplate) parts.push(roomsTemplate as TemplateResult);
    if (position === 'bottom' && sceneBar) parts.push(sceneBar);
    return parts;
  }

  private _renderRooms(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    // Jawna konfiguracja rooms — użyj jej z override'ami per room.
    if (this._config.rooms && this._config.rooms.length > 0) {
      // Area które są scalone do innego wiersza — nie pokazuj ich jako osobne.
      const mergedInto = new Set<string>();
      for (const r of this._config.rooms) {
        for (const child of r.merge_with ?? []) mergedInto.add(child);
      }
      const visible = this._config.rooms.filter(
        (r) => !r.hidden && !mergedInto.has(r.area_id),
      );
      return html`${visible.map((room) => {
        const area = this.hass!.areas?.[room.area_id];
        const name = room.name ?? area?.name ?? room.area_id;
        const icon = room.icon ?? area?.icon ?? undefined;
        const aggregate = room.aggregate ?? 'sum';
        const areaIds =
          aggregate === 'sum' && room.merge_with?.length
            ? [room.area_id, ...room.merge_with]
            : [room.area_id];
        return this._renderRoomRow(areaIds, name, icon, room.tap_action, {
          merge_with: room.merge_with,
          sections: room.sections,
          scenes: room.scenes,
          chips: room.chips,
        });
      })}`;
    }

    // Auto-discover: wszystkie area z floor-a w kolejności HA.
    if (this._config.floor_id) {
      const areas = getAreasInFloor(this.hass, this._config.floor_id);
      if (areas.length === 0) {
        return html`<div class="placeholder">
          Brak stref przypisanych do tego piętra.<br />
          Przypisz area do floor w Settings → Areas & Zones.
        </div>`;
      }
      return html`${areas.map((area) =>
        this._renderRoomRow([area.area_id], area.name, area.icon ?? undefined),
      )}`;
    }

    // Pojedyncza strefa — wiersz tej area.
    if (this._config.area_id) {
      const area = this.hass.areas?.[this._config.area_id];
      const name = area?.name ?? this._config.area_id;
      return this._renderRoomRow([this._config.area_id], name, area?.icon ?? undefined);
    }

    return nothing;
  }

  private _renderRoomRow(
    areaIds: string[],
    name: string,
    icon: string | undefined,
    perRoomTapAction?: import('./types.js').TapActionConfig,
    popupOverrides?: {
      merge_with?: string[];
      sections?: import('./types.js').RoomSectionSpec[];
      scenes?: import('./types.js').SceneBarConfig;
      chips?: import('./types.js').ChipConfig[];
    },
  ): TemplateResult {
    const primary = areaIds[0];
    // Zbieramy encje z wszystkich area (primary + merge_with), deduplikując.
    const seen = new Set<string>();
    const entries: HassEntityRegistryEntry[] = [];
    for (const id of areaIds) {
      for (const e of getEntitiesInArea(this.hass!, id)) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        entries.push(e);
      }
    }

    const lightsOn = filterByDomain(entries, 'light').reduce(
      (n, e) => n + (this.hass!.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
      0,
    );
    const motion =
      filterBinarySensorDeviceClass(this.hass!, entries, 'motion').some(
        (e) => this.hass!.states?.[e.entity_id]?.state === 'on',
      ) ||
      filterBinarySensorDeviceClass(this.hass!, entries, 'occupancy').some(
        (e) => this.hass!.states?.[e.entity_id]?.state === 'on',
      );
    const temperature = this._firstTemperature(entries);
    // Rozwiązywanie akcji dla klikalności wiersza.
    const isSet = (a: import('./types.js').TapActionConfig | undefined): boolean =>
      Boolean(a && (a as { action?: string }).action && (a as { action: string }).action !== 'default');
    const effectiveTap = isSet(perRoomTapAction)
      ? perRoomTapAction
      : isSet(this._config?.room_tap_action)
      ? this._config?.room_tap_action
      : undefined;
    // Klikalność: jawna akcja (nie none) LUB brak akcji (default → popup).
    const explicitNone = effectiveTap?.action === 'none';
    const clickable = !explicitNone;

    return html`<stratum-card-room-row
      .areaId=${primary}
      .name=${name}
      .icon=${icon ?? 'mdi:floor-plan'}
      .lightsOn=${lightsOn}
      .motion=${motion}
      .temperature=${temperature}
      .clickable=${clickable}
      @row-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
        this._onRoomTap(ev, effectiveTap, popupOverrides)}
    ></stratum-card-room-row>`;
  }

  private _onRoomTap(
    ev: CustomEvent<{ area_id: string; area_name: string }>,
    action: import('./types.js').TapActionConfig | undefined,
    roomOverrides?: {
      merge_with?: string[];
      sections?: import('./types.js').RoomSectionSpec[];
      scenes?: import('./types.js').SceneBarConfig;
      chips?: import('./types.js').ChipConfig[];
    },
  ): void {
    // Rozwiązywanie akcji: per-room > global > domyślny popup.
    // `action: 'default'` z ha-form = „nie ustawione" — przechodzimy głębiej.
    const isSet = (a: import('./types.js').TapActionConfig | undefined): boolean =>
      Boolean(a && (a as { action?: string }).action && (a as { action: string }).action !== 'default');

    let effective: import('./types.js').TapActionConfig | undefined;
    if (isSet(action)) effective = action;
    else if (isSet(this._config?.room_tap_action)) effective = this._config?.room_tap_action;

    if (effective?.action === 'none') return;

    if (effective) {
      void runTapAction(this.hass, effective, {
        source: this,
        area_id: ev.detail.area_id,
        area_name: ev.detail.area_name,
      });
      return;
    }

    this._openRoomPopup(ev.detail.area_id, roomOverrides);
  }

  private _openRoomPopup(
    areaId: string,
    overrides?: {
      merge_with?: string[];
      sections?: import('./types.js').RoomSectionSpec[];
      scenes?: import('./types.js').SceneBarConfig;
      chips?: import('./types.js').ChipConfig[];
    },
  ): void {
    this._popupRoom = {
      area_id: areaId,
      merge_with: overrides?.merge_with,
      sections: overrides?.sections,
      scenes: overrides?.scenes,
      chips: overrides?.chips,
    };
    document.addEventListener('keydown', this._onPopupKey);
  }

  private _closeRoomPopup = (): void => {
    this._popupRoom = undefined;
    document.removeEventListener('keydown', this._onPopupKey);
  };

  private _onPopupKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && this._popupRoom) {
      ev.stopPropagation();
      this._closeRoomPopup();
    }
  };

  private _onBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this._closeRoomPopup();
  }

  private _firstTemperature(entries: HassEntityRegistryEntry[]): string | undefined {
    if (!this.hass) return undefined;
    for (const entry of entries) {
      if (!entry.entity_id.startsWith('sensor.')) continue;
      const state = this.hass.states?.[entry.entity_id];
      if (!state) continue;
      if (state.attributes?.device_class !== 'temperature') continue;
      const value = parseFloat(state.state);
      if (Number.isNaN(value)) continue;
      const unit = (state.attributes?.unit_of_measurement as string | undefined) ?? '°C';
      return `${value.toFixed(1)} ${unit}`;
    }
    return undefined;
  }

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      background: var(--stratum-card-background, var(--ha-card-background, var(--card-background-color, #1e1f22)));
      border-radius: var(--stratum-card-border-radius, var(--ha-card-border-radius, 12px));
      color: var(--stratum-card-color, var(--primary-text-color, #e8e8e8));
      overflow: hidden;
      box-shadow: var(--ha-card-box-shadow, none);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, transparent));
      transition: background 0.15s ease;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      cursor: pointer;
      user-select: none;
      background: transparent;
      border: 0;
      width: 100%;
      color: inherit;
      font: inherit;
      text-align: left;
    }

    .header:hover {
      background: var(--stratum-card-hover-background, rgba(255, 255, 255, 0.04));
    }

    .header:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: -2px;
    }

    .area-icon {
      --mdc-icon-size: var(--stratum-card-icon-size, 22px);
      color: var(--stratum-card-icon-color, var(--primary-text-color));
      flex-shrink: 0;
    }

    .title {
      flex: 1;
      font-size: var(--stratum-card-title-size, 17px);
      font-weight: var(--stratum-card-title-weight, 500);
      letter-spacing: -0.01em;
    }

    .chips {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-shrink: 0;
    }

    .expander {
      --mdc-icon-size: 20px;
      transition: transform 0.2s ease;
      color: var(--stratum-card-expander-color, var(--secondary-text-color));
      flex-shrink: 0;
    }

    .expander.open {
      transform: rotate(180deg);
    }

    .body-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows var(--stratum-card-expander-duration, 280ms)
        cubic-bezier(0.4, 0, 0.2, 1);
    }

    .body-wrap.open {
      grid-template-rows: 1fr;
    }

    .body {
      overflow: hidden;
      padding: 0 16px;
      border-top: 0.5px solid
        var(--stratum-card-divider-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
    }

    .body-wrap.open .body {
      padding: 4px 16px 12px;
    }

    .placeholder {
      padding: 14px 0;
      color: var(--secondary-text-color);
      font-size: 13px;
      text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .body-wrap {
        transition: none;
      }
    }

    .stratum-popup-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: stratum-popup-fade 0.15s ease-out;
    }

    @keyframes stratum-popup-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .stratum-popup-card {
      position: relative;
      max-width: min(560px, 92vw);
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      border-radius: var(--ha-card-border-radius, 12px);
      animation: stratum-popup-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes stratum-popup-pop {
      from { transform: scale(0.95); opacity: 0.6; }
      to { transform: scale(1); opacity: 1; }
    }

    .stratum-popup-close {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 2;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 0;
      background: var(--primary-color, #ff9b42);
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    .stratum-popup-close:hover {
      filter: brightness(1.1);
    }

    .stratum-popup-close ha-icon {
      --mdc-icon-size: 20px;
    }

    @media (prefers-reduced-motion: reduce) {
      .stratum-popup-backdrop,
      .stratum-popup-card {
        animation: none;
      }
    }
  `;
}

// Rejestracja karty w "katalogu" HA widocznym w wizardzie dashboardu.
interface CustomCardsWindow extends Window {
  customCards?: Array<{
    type: string;
    name: string;
    description?: string;
    preview?: boolean;
  }>;
}

const w = window as CustomCardsWindow;
w.customCards = w.customCards ?? [];
if (!w.customCards.some((c) => c.type === 'stratum-card')) {
  w.customCards.push({
    type: 'stratum-card',
    name: 'Stratum',
    description:
      'Podsumowanie strefy z rozwijaną listą pomieszczeń (świata, obecność, okna).',
    preview: false,
  });
}

// Sygnatura w konsoli — pomocna w debugowaniu wersji u użytkownika.
// eslint-disable-next-line no-console
console.info(
  `%c STRATUM %c v${VERSION} `,
  'color: #fff; background: #ff9b42; padding: 2px 6px; border-radius: 3px 0 0 3px; font-weight: 500;',
  'color: #ff9b42; background: #1e1f22; padding: 2px 6px; border-radius: 0 3px 3px 0;',
);
