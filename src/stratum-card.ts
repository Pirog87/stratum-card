// stratum-card
//
// Customowa karta Home Assistant: podsumowanie warstwy (floor lub area)
// z rozwijanym body. Zobacz docs/roadmap.md dla kolejnych milestone'ów.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { StratumCardConfig, HomeAssistant } from './types.js';
import {
  getEntitiesInArea,
  getEntitiesInFloor,
  filterByDomain,
  filterBinarySensorDeviceClass,
} from './area-entities.js';
import './stratum-card-editor.js';

const VERSION = '0.4.0';

@customElement('stratum-card')
export class StratumCard extends LitElement {
  /** Wstrzykiwane automatycznie przez Home Assistant przy każdej zmianie stanu. */
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumCardConfig;
  @state() private _expanded = false;

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
        detail: { expanded: this._expanded },
        bubbles: true,
        composed: true,
      }),
    );
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
      <ha-card part="card">
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
            <!-- v0.3: tu renderujemy chipy z config.chips -->
            <span class="chip placeholder">—</span>
          </div>
          <ha-icon
            class="expander ${this._expanded ? 'open' : ''}"
            part="expander"
            .icon=${'mdi:chevron-down'}
          ></ha-icon>
        </button>

        ${this._expanded
          ? html`
              <div class="body" part="body">
                <!-- v0.5: lista pomieszczeń -->
                <div class="placeholder">
                  Lista pomieszczeń pojawi się tutaj (v0.5).
                </div>
              </div>
            `
          : nothing}
      </ha-card>
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

    .chip {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--area-chip-background, rgba(255, 255, 255, 0.06));
      color: var(--area-chip-color, var(--secondary-text-color));
    }

    .chip.placeholder {
      opacity: 0.4;
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

    .body {
      padding: 0 16px 14px;
      border-top: 0.5px solid
        var(--stratum-card-divider-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
    }

    .placeholder {
      padding: 14px 0;
      color: var(--secondary-text-color);
      font-size: 13px;
      text-align: center;
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
