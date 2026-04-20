// Kafelek pomieszczenia w głównej karcie Stratum (alternatywa do row).
//
// Kwadratowy kafel (aspect 1/1): duża ikona area, nazwa, mini-licznik
// świateł, indicator motion, temperatura. Gradient tła subtelny; gdy
// pomieszczenie ma aktywne encje (światła/motion) dostaje accent.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DisplayConfig, TileField } from './types.js';
import { resolveColor } from './colors.js';
import { resolveSceneImage } from './scene-presets.js';
import { DEFAULT_FIELDS } from './tile-data.js';

@customElement('stratum-card-room-tile')
export class StratumCardRoomTile extends LitElement {
  @property({ type: String }) public name = '';

  @property({ type: String }) public icon = 'mdi:floor-plan';

  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @property({ type: Number, attribute: 'lights-on' }) public lightsOn = 0;

  @property({ type: Boolean }) public motion = false;

  @property({ type: String }) public temperature?: string;

  @property({ type: Boolean, reflect: true }) public clickable = false;

  /** Wilgotność (sformatowana, np. "54.2 %"). */
  @property({ type: String }) public humidity?: string;

  /** Liczba otwartych okien. */
  @property({ type: Number, attribute: 'windows-open' }) public windowsOpen = 0;

  /** Liczba otwartych drzwi. */
  @property({ type: Number, attribute: 'doors-open' }) public doorsOpen = 0;

  /** Globalna konfiguracja wyglądu (aspect, pola, kolor akcentu, tło). */
  @property({ attribute: false }) public displayConfig?: DisplayConfig;

  /** Per-pokój CSS override (wstrzykiwane jako style na .tile). */
  @property({ type: String, attribute: 'style-override' }) public styleOverride?: string;

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
    const active = this.lightsOn > 0 || this.motion;
    const fields = cfg.fields ?? DEFAULT_FIELDS;
    const showIcon = cfg.show_icon !== false;
    const showName = cfg.show_name !== false;
    const accent = resolveColor(cfg.accent_color) ?? 'var(--stratum-chip-lights-color, #ffc107)';
    const bgImage = resolveSceneImage(cfg.background_image);
    const styles = [
      `--stratum-room-tile-aspect: ${cfg.aspect ?? '1/1'};`,
      active ? `--stratum-room-tile-active-color: ${accent};` : '',
      bgImage ? `background-image: url("${bgImage}"); background-size: cover; background-position: center;` : '',
      this.styleOverride ?? '',
    ].join(' ');

    return html`
      <div
        class="tile ${active ? 'active' : ''} ${bgImage ? 'has-bg' : ''}"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        style=${styles}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        ${showIcon || this.motion
          ? html`<div class="top">
              ${showIcon
                ? html`<span class="icon-bubble">
                    <ha-icon .icon=${this.icon}></ha-icon>
                  </span>`
                : html`<span></span>`}
              ${this.motion && fields.includes('motion')
                ? html`<ha-icon
                    class="motion-dot"
                    .icon=${'mdi:motion-sensor'}
                    title="Obecność"
                  ></ha-icon>`
                : nothing}
            </div>`
          : nothing}
        ${showName ? html`<div class="name">${this.name}</div>` : nothing}
        <div class="info">${this._renderFields(fields)}</div>
      </div>
    `;
  }

  private _renderFields(fields: TileField[]): TemplateResult[] {
    const out: TemplateResult[] = [];
    for (const f of fields) {
      switch (f) {
        case 'temperature':
          if (this.temperature) {
            out.push(html`<span class="field temp">${this.temperature}</span>`);
          }
          break;
        case 'humidity':
          if (this.humidity) {
            out.push(html`<span class="field hum">
              <ha-icon .icon=${'mdi:water-percent'}></ha-icon>
              ${this.humidity}
            </span>`);
          }
          break;
        case 'lights':
          if (this.lightsOn > 0) {
            out.push(html`<span class="field lights">
              <ha-icon .icon=${'mdi:lightbulb-on'}></ha-icon>
              ${this.lightsOn}
            </span>`);
          }
          break;
        case 'windows':
          if (this.windowsOpen > 0) {
            out.push(html`<span class="field windows">
              <ha-icon .icon=${'mdi:window-open-variant'}></ha-icon>
              ${this.windowsOpen}
            </span>`);
          }
          break;
        case 'doors':
          if (this.doorsOpen > 0) {
            out.push(html`<span class="field doors">
              <ha-icon .icon=${'mdi:door-open'}></ha-icon>
              ${this.doorsOpen}
            </span>`);
          }
          break;
      }
    }
    return out;
  }

  static styles = css`
    :host {
      display: block;
    }

    .tile {
      aspect-ratio: var(--stratum-room-tile-aspect, 1/1);
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 6px;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: var(--stratum-room-tile-bg, rgba(255, 255, 255, 0.03));
      color: var(--primary-text-color);
      transition: background 0.2s ease, border-color 0.2s ease,
        transform 0.12s ease, box-shadow 0.15s ease;
      min-height: 110px;
    }

    :host([clickable]) .tile {
      cursor: pointer;
    }

    :host([clickable]) .tile:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    }

    :host([clickable]) .tile:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: 2px;
    }

    .tile.active {
      border-color: color-mix(in srgb, var(--stratum-room-tile-active-color, var(--stratum-chip-lights-color, #ffc107)) 40%, transparent);
      background: color-mix(in srgb, var(--stratum-room-tile-active-color, var(--stratum-chip-lights-color, #ffc107)) 8%, var(--stratum-room-tile-bg, rgba(255, 255, 255, 0.03)));
    }

    .tile.has-bg {
      color: #fff;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    }

    .tile.has-bg::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, rgba(0, 0, 0, 0.15) 0%, rgba(0, 0, 0, 0.6) 100%);
      border-radius: inherit;
      pointer-events: none;
    }

    .tile {
      position: relative;
    }

    .tile.has-bg > * {
      position: relative;
      z-index: 1;
    }

    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .icon-bubble {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--primary-color, #ff9b42) 15%, transparent);
      color: var(--primary-color, #ff9b42);
    }

    .tile.active .icon-bubble {
      background: color-mix(in srgb, var(--stratum-chip-lights-color, #ffc107) 22%, transparent);
      color: var(--stratum-chip-lights-color, #ffc107);
    }

    .icon-bubble ha-icon {
      --mdc-icon-size: 22px;
    }

    .motion-dot {
      --mdc-icon-size: 18px;
      color: var(--stratum-chip-motion-color, #4caf50);
      filter: drop-shadow(0 0 6px rgba(76, 175, 80, 0.6));
    }

    .name {
      align-self: end;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    .temp {
      font-variant-numeric: tabular-nums;
    }

    .lights {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: var(--stratum-chip-lights-color, #ffc107);
      font-weight: 600;
    }

    .lights ha-icon {
      --mdc-icon-size: 14px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-room-tile': StratumCardRoomTile;
  }
}
