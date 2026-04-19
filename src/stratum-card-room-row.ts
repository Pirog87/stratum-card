// Jeden wiersz pomieszczenia w body rozwiniętej karty.
//
// Pokazuje: ikonę area, nazwę, oraz mini-informacje (liczba świateł on,
// status motion, temperatura). Klik na wiersz — tap_action w v0.6.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('stratum-card-room-row')
export class StratumCardRoomRow extends LitElement {
  @property({ type: String }) public name = '';

  @property({ type: String }) public icon = 'mdi:floor-plan';

  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @property({ type: Number, attribute: 'lights-on' }) public lightsOn = 0;

  @property({ type: Boolean, attribute: 'motion' }) public motion = false;

  /** Sformatowana temperatura do wyświetlenia (np. "22.4 °C"). Opcjonalne. */
  @property({ type: String }) public temperature?: string;

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
    return html`
      <div
        class="row"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        <ha-icon class="icon" .icon=${this.icon}></ha-icon>
        <span class="name">${this.name}</span>
        <div class="info">
          ${this.temperature
            ? html`<span class="temp">${this.temperature}</span>`
            : null}
          ${this.motion
            ? html`<ha-icon
                class="motion"
                .icon=${'mdi:motion-sensor'}
                title="Ktoś jest w pomieszczeniu"
              ></ha-icon>`
            : null}
          ${this.lightsOn > 0
            ? html`<span class="lights">
                <ha-icon .icon=${'mdi:lightbulb-on'}></ha-icon>
                ${this.lightsOn}
              </span>`
            : null}
        </div>
      </div>
    `;
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
      transition: background 0.15s ease;
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

    .info {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--secondary-text-color);
      font-size: 12px;
    }

    .temp {
      font-variant-numeric: tabular-nums;
    }

    .motion {
      --mdc-icon-size: 16px;
      color: var(--stratum-chip-motion-color, #4caf50);
    }

    .lights {
      display: inline-flex;
      align-items: center;
      gap: 3px;
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
