// stratum-room-card — widok detalu pomieszczenia z auto-generowanymi sekcjami.
//
// v1.0 1/3 — szkielet: rejestracja card type, setConfig, header z ikoną/nazwą/chipami.
// Placeholder sekcji zostanie zastąpiony listą aktywnych sekcji w 2/3.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
  RoomSectionConfig,
  RoomSectionSpec,
  RoomSectionType,
  StratumRoomCardConfig,
  SummaryField,
} from './types.js';
import { getEntitiesInArea, filterByDomain, filterBinarySensorDeviceClass } from './area-entities.js';
import { evaluateChip, resolveChipColor, resolveChipIcon } from './chip-defaults.js';
import { TemplateRenderer } from './template-renderer.js';
import './stratum-card-chip.js';
import './stratum-room-card-editor.js';
import './stratum-room-tile.js';
import './stratum-scene-bar.js';

const VERSION = '1.4.0';

/** Auto-wybór chipów dla room card: lights + motion + temp + humidity (jeśli są). */
function autoRoomChips(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
): ChipConfig[] {
  const chips: ChipConfig[] = [{ type: 'lights' }, { type: 'motion' }];
  const temp = entries.find(
    (e) => hass.states?.[e.entity_id]?.attributes?.device_class === 'temperature',
  );
  if (temp) {
    chips.push({
      type: 'entity',
      entity: temp.entity_id,
      icon: 'mdi:thermometer',
      suffix: ' °C',
      color: 'amber',
      show_when_zero: true,
    });
  }
  const hum = entries.find(
    (e) => hass.states?.[e.entity_id]?.attributes?.device_class === 'humidity',
  );
  if (hum) {
    chips.push({
      type: 'entity',
      entity: hum.entity_id,
      icon: 'mdi:water-percent',
      suffix: ' %',
      color: 'blue',
      show_when_zero: true,
    });
  }
  return chips;
}

import { SECTION_ICON, SECTION_LABEL, SECTION_LAYOUT } from './section-defaults.js';

/** Normalizuje spec sekcji do pełnego configu. */
function normalizeSections(
  input: RoomSectionSpec[] | undefined,
  autoDetected: RoomSectionType[],
): RoomSectionConfig[] {
  if (!input || input.length === 0) return autoDetected.map((t) => ({ type: t }));
  return input.map((s) => (typeof s === 'string' ? { type: s } : s));
}

/** Filtry per sekcja — jakie encje do niej należą. */
function entitiesForSection(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  section: RoomSectionType,
): HassEntityRegistryEntry[] {
  switch (section) {
    case 'lights':
      return filterByDomain(entries, 'light');
    case 'covers':
      return filterByDomain(entries, 'cover');
    case 'windows':
      return filterBinarySensorDeviceClass(hass, entries, 'window');
    case 'doors':
      return filterBinarySensorDeviceClass(hass, entries, 'door');
    case 'climate':
      return filterByDomain(entries, 'climate');
    case 'media':
      return filterByDomain(entries, 'media_player');
    case 'fans':
      return filterByDomain(entries, 'fan');
    case 'switches':
      return filterByDomain(entries, 'switch');
    case 'scenes':
      return filterByDomain(entries, 'scene');
    case 'summary':
      return [];
  }
}

/** Auto-discover: sekcje dla których są encje. Kolejność — utrwalona. */
function autoSections(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
): RoomSectionType[] {
  const order: RoomSectionType[] = [
    'scenes',
    'lights',
    'covers',
    'windows',
    'doors',
    'climate',
    'media',
    'fans',
    'switches',
  ];
  return order.filter((s) => entitiesForSection(hass, entries, s).length > 0);
}

@customElement('stratum-room-card')
export class StratumRoomCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumRoomCardConfig;

  private _templates = new TemplateRenderer(() => this.requestUpdate());

  public setConfig(config: StratumRoomCardConfig): void {
    if (!config) throw new Error('Konfiguracja jest wymagana.');
    if (!config.area_id) throw new Error('Podaj `area_id`.');
    this._config = config;
  }

  /** Ustawia config poprzez Lit property (dla osadzania w popup). */
  public set config(value: StratumRoomCardConfig) {
    if (value) this.setConfig(value);
  }

  public getCardSize(): number {
    return 6;
  }

  /** Powiązuje wizualny editor z kartą. */
  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('stratum-room-card-editor');
  }

  /** Sensowny default gdy user dodaje kartę przez wizard „Add card". */
  public static getStubConfig(hass: HomeAssistant): Partial<StratumRoomCardConfig> {
    const firstArea = hass?.areas && Object.keys(hass.areas)[0];
    return { area_id: firstArea ?? '' };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._templates.destroy();
  }

  private _getEntries(): HassEntityRegistryEntry[] {
    if (!this.hass || !this._config) return [];
    const ids = [this._config.area_id, ...(this._config.merge_with ?? [])];
    const seen = new Set<string>();
    const out: HassEntityRegistryEntry[] = [];
    for (const id of ids) {
      for (const entry of getEntitiesInArea(this.hass, id)) {
        if (seen.has(entry.entity_id)) continue;
        seen.add(entry.entity_id);
        out.push(entry);
      }
    }
    return out;
  }

  private _resolveName(): string {
    if (this._config?.name) return this._config.name;
    if (this._config?.area_id && this.hass?.areas) {
      return this.hass.areas[this._config.area_id]?.name ?? this._config.area_id;
    }
    return 'Pomieszczenie';
  }

  private _resolveIcon(): string {
    if (this._config?.icon) return this._config.icon;
    if (this._config?.area_id && this.hass?.areas) {
      const icon = this.hass.areas[this._config.area_id]?.icon;
      if (icon) return icon;
    }
    return 'mdi:floor-plan';
  }

  private _renderChips(entries: HassEntityRegistryEntry[]): TemplateResult[] {
    if (!this.hass) return [];
    this._templates.setHass(this.hass);
    const chips = this._config?.chips ?? autoRoomChips(this.hass, entries);
    return chips.map((chip) => {
      const { label, active } = evaluateChip(this.hass!, entries, chip, this._templates);
      return html`<stratum-card-chip
        .icon=${resolveChipIcon(chip)}
        .label=${label}
        .active=${active}
        .color=${resolveChipColor(chip)}
        .showWhenZero=${chip.show_when_zero ?? false}
      ></stratum-card-chip>`;
    });
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    if (!this.hass) return nothing;

    const entries = this._getEntries();
    const name = this._resolveName();
    const icon = this._resolveIcon();
    const autoTypes = autoSections(this.hass, entries);
    const sections = normalizeSections(this._config.sections, autoTypes).filter(
      (s) => !s.hidden,
    );

    // Explicit scenes config zastępuje sekcję scenes (pasek scen is in body top).
    const hasExplicitScenes =
      this._config.scenes && (this._config.scenes.items ?? []).length > 0;
    const effectiveSections = hasExplicitScenes
      ? sections.filter((s) => s.type !== 'scenes')
      : sections;

    return html`
      <ha-card part="card">
        <div class="header" part="header">
          <ha-icon class="icon" part="room-icon" .icon=${icon}></ha-icon>
          <span class="title" part="title">${name}</span>
          <div class="chips" part="chips">${this._renderChips(entries)}</div>
        </div>
        <div class="body" part="body">
          ${hasExplicitScenes
            ? html`<stratum-scene-bar
                .hass=${this.hass}
                .config=${this._config.scenes}
              ></stratum-scene-bar>`
            : null}
          ${effectiveSections.length === 0
            ? html`<div class="placeholder">
                Brak encji do wyświetlenia — sprawdź przypisanie area.
              </div>`
            : effectiveSections.map((s) => this._renderSection(s, entries))}
        </div>
      </ha-card>
    `;
  }

  private _renderSection(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
  ): TemplateResult {
    const type = section.type;
    const title = section.title ?? SECTION_LABEL[type];
    const iconName = section.icon ?? SECTION_ICON[type];

    if (type === 'summary') return this._renderSummary(section, entries, title, iconName);

    let items = entitiesForSection(this.hass!, entries, type);
    if (section.entities && section.entities.length > 0) {
      const allow = new Set(section.entities);
      items = items.filter((e) => allow.has(e.entity_id));
    }
    if (items.length === 0) return html``;

    const layout =
      section.columns === 1 ? 'grid-1'
      : section.columns === 2 ? 'grid-2'
      : section.columns === 3 ? 'grid-3'
      : SECTION_LAYOUT[type];
    const mode = section.mode ?? 'tile';

    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="tiles ${layout}">
          ${items.map(
            (e) =>
              html`<stratum-room-tile
                .hass=${this.hass}
                .entity=${e.entity_id}
                .mode=${mode}
              ></stratum-room-tile>`,
          )}
        </div>
      </div>
    `;
  }

  private _renderSummary(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
    title: string,
    iconName: string,
  ): TemplateResult {
    const fields: SummaryField[] = section.fields ?? [
      'motion',
      'temperature',
      'humidity',
      'lights_on',
      'windows_open',
      'doors_open',
    ];
    const chips = fields
      .map((f) => this._summaryChip(f, entries))
      .filter((t): t is TemplateResult => t !== null);
    if (chips.length === 0) return html``;
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
        </div>
        <div class="summary-grid">${chips}</div>
      </div>
    `;
  }

  private _summaryChip(
    field: SummaryField,
    entries: HassEntityRegistryEntry[],
  ): TemplateResult | null {
    const hass = this.hass!;
    switch (field) {
      case 'motion':
      case 'occupancy': {
        const cls = field;
        const on = filterBinarySensorDeviceClass(hass, entries, cls).some(
          (e) => hass.states?.[e.entity_id]?.state === 'on',
        );
        return this._summaryItem(
          field === 'motion' ? 'Obecność' : 'Obecność',
          'mdi:motion-sensor',
          on ? 'aktywna' : 'brak',
          on,
          '#4caf50',
        );
      }
      case 'temperature':
      case 'humidity': {
        const cls = field === 'temperature' ? 'temperature' : 'humidity';
        const entry = entries.find(
          (e) =>
            e.entity_id.startsWith('sensor.') &&
            hass.states?.[e.entity_id]?.attributes?.device_class === cls,
        );
        if (!entry) return null;
        const state = hass.states?.[entry.entity_id];
        if (!state) return null;
        const unit = (state.attributes?.unit_of_measurement as string | undefined) ??
          (cls === 'temperature' ? '°C' : '%');
        const label = cls === 'temperature' ? 'Temperatura' : 'Wilgotność';
        const icon = cls === 'temperature' ? 'mdi:thermometer' : 'mdi:water-percent';
        const color = cls === 'temperature' ? '#ffc107' : '#42a5f5';
        return this._summaryItem(label, icon, `${state.state} ${unit}`, true, color);
      }
      case 'lights_on': {
        const n = filterByDomain(entries, 'light').reduce(
          (acc, e) => acc + (hass.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
          0,
        );
        return this._summaryItem(
          'Światła',
          'mdi:lightbulb-on',
          n > 0 ? `${n} włącz.` : 'wszystkie wył.',
          n > 0,
          '#ffc107',
        );
      }
      case 'windows_open': {
        const n = filterBinarySensorDeviceClass(hass, entries, 'window').reduce(
          (acc, e) => acc + (hass.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
          0,
        );
        return this._summaryItem(
          'Okna',
          'mdi:window-open-variant',
          n > 0 ? `${n} otwart.` : 'zamknięte',
          n > 0,
          '#42a5f5',
        );
      }
      case 'doors_open': {
        const n = filterBinarySensorDeviceClass(hass, entries, 'door').reduce(
          (acc, e) => acc + (hass.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
          0,
        );
        return this._summaryItem(
          'Drzwi',
          'mdi:door-open',
          n > 0 ? `${n} otwart.` : 'zamknięte',
          n > 0,
          '#42a5f5',
        );
      }
      case 'battery_low': {
        const low = entries.some((e) => {
          const s = hass.states?.[e.entity_id];
          if (!s || s.attributes?.device_class !== 'battery') return false;
          const v = parseFloat(s.state);
          return !Number.isNaN(v) && v < 20;
        });
        if (!low) return null;
        return this._summaryItem(
          'Bateria',
          'mdi:battery-alert',
          'niski poziom',
          true,
          '#f44336',
        );
      }
      case 'leak': {
        const active = filterBinarySensorDeviceClass(hass, entries, 'moisture').some(
          (e) => hass.states?.[e.entity_id]?.state === 'on',
        );
        if (!active) return null;
        return this._summaryItem('Wyciek', 'mdi:water-alert', 'wykryty', true, '#f44336');
      }
      default:
        return null;
    }
  }

  private _summaryItem(
    label: string,
    icon: string,
    value: string,
    active: boolean,
    color: string,
  ): TemplateResult {
    return html`
      <div class="summary-item ${active ? 'active' : 'inactive'}">
        <ha-icon style=${active ? `color:${color};` : ''} .icon=${icon}></ha-icon>
        <div class="summary-text">
          <span class="summary-label">${label}</span>
          <span class="summary-value">${value}</span>
        </div>
      </div>
    `;
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
      padding: var(--stratum-room-padding, 16px);
      box-shadow: var(--ha-card-box-shadow, none);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, transparent));
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    }

    .icon {
      --mdc-icon-size: 28px;
      color: var(--primary-text-color);
      flex-shrink: 0;
    }

    .title {
      flex: 1;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
    }

    .section-header ha-icon {
      --mdc-icon-size: 16px;
    }

    .section-header .count {
      margin-left: auto;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      color: var(--secondary-text-color);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      transition: opacity 0.15s ease;
    }

    .summary-item.inactive {
      opacity: 0.5;
    }

    .summary-item ha-icon {
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }

    .summary-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .summary-label {
      font-size: 11px;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .summary-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 480px) {
      ha-card {
        padding: 12px;
      }
      .header {
        gap: 8px;
      }
      .title {
        font-size: 17px;
      }
      .body {
        gap: 14px;
      }
    }

    .tiles {
      display: grid;
      gap: 8px;
    }

    .tiles.grid-1 {
      grid-template-columns: 1fr;
    }

    .tiles.grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tiles.grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @media (max-width: 480px) {
      .tiles.grid-3 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .placeholder {
      padding: 20px;
      text-align: center;
      color: var(--secondary-text-color);
    }
  `;
}

// Rejestracja drugiego card type w katalogu HA.
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
if (!w.customCards.some((c) => c.type === 'stratum-room-card')) {
  w.customCards.push({
    type: 'stratum-room-card',
    name: 'Stratum — Pokój',
    description:
      'Widok pojedynczego pomieszczenia z auto-generowanymi sekcjami (Światła, Rolety, Okna, Klimat).',
    preview: false,
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-room-card': StratumRoomCard;
  }
}

// eslint-disable-next-line no-console
console.info(
  `%c STRATUM-ROOM %c v${VERSION} `,
  'color: #fff; background: #42a5f5; padding: 2px 6px; border-radius: 3px 0 0 3px; font-weight: 500;',
  'color: #42a5f5; background: #1e1f22; padding: 2px 6px; border-radius: 0 3px 3px 0;',
);
