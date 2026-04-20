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
  RoomSectionType,
  StratumRoomCardConfig,
} from './types.js';
import { getEntitiesInArea, filterByDomain, filterBinarySensorDeviceClass } from './area-entities.js';
import { evaluateChip, resolveChipColor, resolveChipIcon } from './chip-defaults.js';
import { TemplateRenderer } from './template-renderer.js';
import './stratum-card-chip.js';
import './stratum-room-card-editor.js';
import './stratum-room-tile.js';

const VERSION = '1.1.0';

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

const SECTION_LABEL: Record<RoomSectionType, string> = {
  lights: 'Światła',
  covers: 'Rolety',
  windows: 'Okna',
  doors: 'Drzwi',
  climate: 'Klimat',
  media: 'Media',
  fans: 'Wentylacja',
  switches: 'Przełączniki',
  scenes: 'Sceny',
};

const SECTION_ICON: Record<RoomSectionType, string> = {
  lights: 'mdi:lightbulb-group',
  covers: 'mdi:blinds',
  windows: 'mdi:window-open',
  doors: 'mdi:door',
  climate: 'mdi:thermostat',
  media: 'mdi:speaker',
  fans: 'mdi:fan',
  switches: 'mdi:toggle-switch',
  scenes: 'mdi:palette',
};

/** Klasa CSS sterująca liczbą kolumn w grid tiles. */
const SECTION_LAYOUT: Record<RoomSectionType, string> = {
  scenes: 'grid-3',
  lights: 'grid-2',
  switches: 'grid-2',
  fans: 'grid-2',
  windows: 'grid-2',
  doors: 'grid-2',
  covers: 'grid-1',
  climate: 'grid-1',
  media: 'grid-1',
};

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
    const sections = this._config.sections ?? autoSections(this.hass, entries);

    return html`
      <ha-card part="card">
        <div class="header" part="header">
          <ha-icon class="icon" part="room-icon" .icon=${icon}></ha-icon>
          <span class="title" part="title">${name}</span>
          <div class="chips" part="chips">${this._renderChips(entries)}</div>
        </div>
        <div class="body" part="body">
          ${sections.length === 0
            ? html`<div class="placeholder">
                Brak encji do wyświetlenia — sprawdź przypisanie area.
              </div>`
            : sections.map((s) => this._renderSection(s, entries))}
        </div>
      </ha-card>
    `;
  }

  private _renderSection(
    section: RoomSectionType,
    entries: HassEntityRegistryEntry[],
  ): TemplateResult {
    const items = entitiesForSection(this.hass!, entries, section);
    if (items.length === 0) return html``;
    const layout = SECTION_LAYOUT[section];
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${SECTION_ICON[section]}></ha-icon>
          <span>${SECTION_LABEL[section]}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="tiles ${layout}">
          ${items.map(
            (e) =>
              html`<stratum-room-tile
                .hass=${this.hass}
                .entity=${e.entity_id}
              ></stratum-room-tile>`,
          )}
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
