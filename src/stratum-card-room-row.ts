// Jeden wiersz pomieszczenia w body rozwiniętej karty.
//
// Pokazuje: ikonę area, nazwę, oraz mini-informacje wg pól z globalnej
// konfiguracji (`display_config.fields`). Klik na wiersz — tap_action albo
// popup pokoju.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisplayConfig, TileField } from './types.js';
import { resolveColor } from './colors.js';
import { DEFAULT_FIELDS } from './tile-data.js';

@customElement('stratum-card-room-row')
export class StratumCardRoomRow extends LitElement {
  @property({ type: String }) public name = '';

  @property({ type: String }) public icon = 'mdi:floor-plan';

  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @property({ type: Number, attribute: 'lights-on' }) public lightsOn = 0;

  @property({ type: Boolean, attribute: 'motion' }) public motion = false;

  /** Sformatowana temperatura do wyświetlenia (np. "22.4 °C"). Opcjonalne. */
  @property({ type: String }) public temperature?: string;

  /** Sformatowana wilgotność (np. "54.2 %"). */
  @property({ type: String }) public humidity?: string;

  /** Liczba otwartych okien. */
  @property({ type: Number, attribute: 'windows-open' }) public windowsOpen = 0;

  /** Liczba otwartych drzwi. */
  @property({ type: Number, attribute: 'doors-open' }) public doorsOpen = 0;

  /** Globalna konfiguracja wyglądu (fields, accent_color, show_icon/show_name). */
  @property({ attribute: false }) public displayConfig?: DisplayConfig;

  /** Per-pokój CSS override. */
  @property({ type: String, attribute: 'style-override' }) public styleOverride?: string;

  /** Czy wiersz ma reagować na klik (pokazać cursor:pointer + hover). */
  @property({ type: Boolean, reflect: true }) public clickable = false;

  private _onClick = (): void => {
    if (!this.clickable) return;
    this.dispatchEvent(
      new CustomEvent('row-tap', {
        detail: { area_id: this.areaId, area_name: this.name },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _onKey = (ev: KeyboardEvent): void => {
    if (!this.clickable) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this._onClick();
    }
  };

  protected render(): TemplateResult {
    const cfg = this.displayConfig ?? {};
    const fields = cfg.fields ?? DEFAULT_FIELDS;
    const showIcon = cfg.show_icon !== false;
    const showName = cfg.show_name !== false;
    const active = this.lightsOn > 0 || this.motion;
    const accent = resolveColor(cfg.accent_color);
    const styles = [
      active && accent ? `--stratum-room-row-active-color: ${accent};` : '',
      this.styleOverride ?? '',
    ].join(' ');

    return html`
      <div
        class="row ${active ? 'active' : ''}"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        style=${styles}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        ${showIcon
          ? html`<ha-icon class="icon" .icon=${this.icon}></ha-icon>`
          : nothing}
        ${showName
          ? html`<span class="name">${this.name}</span>`
          : html`<span class="name-spacer"></span>`}
        <div class="info">${this._renderFields(fields)}</div>
      </div>
    `;
  }

  private _renderFields(fields: TileField[]): (TemplateResult | typeof nothing)[] {
    return fields.map((f) => {
      switch (f) {
        case 'temperature':
          return this.temperature
            ? html`<span class="field temp">${this.temperature}</span>`
            : nothing;
        case 'humidity':
          return this.humidity
            ? html`<span class="field hum">
                <ha-icon .icon=${'mdi:water-percent'}></ha-icon>
                ${this.humidity}
              </span>`
            : nothing;
        case 'motion':
          return this.motion
            ? html`<ha-icon
                class="field motion"
                .icon=${'mdi:motion-sensor'}
                title="Ktoś jest w pomieszczeniu"
              ></ha-icon>`
            : nothing;
        case 'lights':
          return this.lightsOn > 0
            ? html`<span class="field lights">
                <ha-icon .icon=${'mdi:lightbulb-on'}></ha-icon>
                ${this.lightsOn}
              </span>`
            : nothing;
        case 'windows':
          return this.windowsOpen > 0
            ? html`<span class="field windows">
                <ha-icon .icon=${'mdi:window-open-variant'}></ha-icon>
                ${this.windowsOpen}
              </span>`
            : nothing;
        case 'doors':
          return this.doorsOpen > 0
            ? html`<span class="field doors">
                <ha-icon .icon=${'mdi:door-open'}></ha-icon>
                ${this.doorsOpen}
              </span>`
            : nothing;
        default:
          return nothing;
      }
    });
  }

  static styles = css`
    :host {
      display: block;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 4px;
      border-bottom: 0.5px solid
        var(--stratum-card-room-divider, var(--divider-color, rgba(255, 255, 255, 0.06)));
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .row.active {
      border-bottom-color: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 40%,
        transparent
      );
    }

    :host([clickable]) .row {
      cursor: pointer;
      border-radius: 6px;
    }

    :host([clickable]) .row:hover {
      background: var(--stratum-card-room-hover, rgba(255, 255, 255, 0.04));
    }

    :host([clickable]) .row:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: -2px;
    }

    :host(:last-of-type) .row {
      border-bottom: 0;
    }

    .icon {
      --mdc-icon-size: 20px;
      color: var(--stratum-card-room-icon-color, var(--secondary-text-color));
      flex-shrink: 0;
    }

    .name {
      flex: 1;
      font-size: 14px;
      color: var(--primary-text-color);
    }

    .name-spacer {
      flex: 1;
    }

    .info {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--secondary-text-color);
      font-size: 12px;
    }

    .field {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .temp {
      font-variant-numeric: tabular-nums;
    }

    .hum ha-icon,
    .windows ha-icon,
    .doors ha-icon {
      --mdc-icon-size: 16px;
    }

    .motion {
      --mdc-icon-size: 16px;
      color: var(--stratum-chip-motion-color, #4caf50);
    }

    .lights {
      color: var(--stratum-chip-lights-color, #ffc107);
      font-weight: 600;
    }

    .lights ha-icon {
      --mdc-icon-size: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-room-row': StratumCardRoomRow;
  }
}
