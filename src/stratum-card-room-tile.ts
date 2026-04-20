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

    const iconPos = cfg.icon_position ?? 'top-left';
    const iconStyle = cfg.icon_style ?? 'bubble';
    const hoverEffect = cfg.hover_effect ?? 'lift';
    const pressScale = typeof cfg.press_scale === 'number' ? cfg.press_scale : 0.98;

    const cssVars: string[] = [
      `--stratum-room-tile-aspect: ${cfg.aspect ?? '1/1'};`,
      active ? `--stratum-room-tile-active-color: ${accent};` : '',
      typeof cfg.border_radius === 'number'
        ? `--stratum-room-tile-radius: ${cfg.border_radius}px;`
        : '',
      typeof cfg.min_height === 'number'
        ? `--stratum-room-tile-min-height: ${cfg.min_height}px;`
        : '',
      typeof cfg.padding === 'number'
        ? `--stratum-room-tile-padding: ${cfg.padding}px;`
        : '',
      typeof cfg.icon_size === 'number'
        ? `--stratum-room-tile-icon-size: ${cfg.icon_size}px;`
        : '',
      `--stratum-room-tile-press-scale: ${pressScale};`,
      bgImage
        ? `background-image: url("${bgImage}"); background-size: cover; background-position: center;`
        : '',
      this.styleOverride ?? '',
    ];
    const styles = cssVars.filter(Boolean).join(' ');

    return html`
      <div
        class="tile ${active ? 'active' : ''} ${bgImage ? 'has-bg' : ''}"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        data-icon-pos=${iconPos}
        data-icon-style=${iconStyle}
        data-hover=${hoverEffect}
        style=${styles}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        ${showIcon && iconStyle !== 'none'
          ? html`<span class="icon-slot icon-${iconStyle}">
              <ha-icon .icon=${this.icon}></ha-icon>
            </span>`
          : nothing}
        ${this.motion && fields.includes('motion')
          ? html`<ha-icon
              class="motion-dot"
              .icon=${'mdi:motion-sensor'}
              title="Obecność"
            ></ha-icon>`
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
      position: relative;
      aspect-ratio: var(--stratum-room-tile-aspect, 1/1);
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-rows: auto 1fr auto;
      grid-template-areas:
        'icon    .     motion'
        '.       .     .     '
        'name    name  info  ';
      gap: 6px;
      padding: var(--stratum-room-tile-padding, 12px);
      border-radius: var(--stratum-room-tile-radius, 14px);
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: var(--stratum-room-tile-bg, rgba(255, 255, 255, 0.03));
      color: var(--primary-text-color);
      transition: background 0.2s ease, border-color 0.2s ease,
        transform 0.12s ease, box-shadow 0.15s ease;
      min-height: var(--stratum-room-tile-min-height, 110px);
    }

    /* --- Warianty pozycji ikony --- */
    .tile[data-icon-pos='top-left'] {
      grid-template-areas:
        'icon    .     motion'
        '.       .     .     '
        'name    name  info  ';
    }
    .tile[data-icon-pos='top-right'] {
      grid-template-areas:
        'motion  .     icon'
        '.       .     .   '
        'name    name  info';
    }
    .tile[data-icon-pos='bottom-left'] {
      grid-template-areas:
        'name    name  motion'
        '.       .     .     '
        'icon    info  info  ';
    }
    .tile[data-icon-pos='bottom-right'] {
      grid-template-areas:
        'name    name  motion'
        '.       .     .     '
        'info    info  icon  ';
    }
    .tile[data-icon-pos='center'] {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr auto auto;
      grid-template-areas:
        'motion'
        'icon'
        'name'
        'info';
      justify-items: center;
      text-align: center;
    }
    .tile[data-icon-pos='left'] {
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      grid-template-areas:
        'icon   name  '
        'icon   info  ';
      align-items: center;
    }
    .tile[data-icon-pos='left'] .motion-dot {
      position: absolute;
      top: 8px;
      right: 8px;
    }

    .icon-slot { grid-area: icon; }
    .motion-dot { grid-area: motion; justify-self: end; align-self: start; }
    .name { grid-area: name; }
    .info { grid-area: info; }

    /* --- Klikalność + warianty hover --- */
    :host([clickable]) .tile { cursor: pointer; }

    :host([clickable]) .tile[data-hover='subtle']:hover {
      background: color-mix(in srgb, var(--primary-color, #ff9b42) 6%, var(--stratum-room-tile-bg, rgba(255, 255, 255, 0.03)));
    }
    :host([clickable]) .tile[data-hover='lift']:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    }
    :host([clickable]) .tile[data-hover='glow']:hover {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color, #ff9b42) 55%, transparent),
        0 4px 20px color-mix(in srgb, var(--primary-color, #ff9b42) 35%, transparent);
    }

    :host([clickable]) .tile:active {
      transform: scale(var(--stratum-room-tile-press-scale, 0.98));
    }

    :host([clickable]) .tile:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: 2px;
    }

    .tile.active {
      border-color: color-mix(in srgb, var(--stratum-room-tile-active-color, var(--stratum-chip-lights-color, #ffc107)) 40%, transparent);
      background: color-mix(in srgb, var(--stratum-room-tile-active-color, var(--stratum-chip-lights-color, #ffc107)) 8%, var(--stratum-room-tile-bg, rgba(255, 255, 255, 0.03)));
    }

    .tile.has-bg { color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6); }
    .tile.has-bg::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, rgba(0, 0, 0, 0.15) 0%, rgba(0, 0, 0, 0.6) 100%);
      border-radius: inherit;
      pointer-events: none;
    }
    .tile.has-bg > * { position: relative; z-index: 1; }

    /* --- Warianty stylu ikony --- */
    .icon-slot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .icon-slot ha-icon {
      --mdc-icon-size: var(--stratum-room-tile-icon-size, 22px);
    }
    .icon-bubble {
      width: calc(var(--stratum-room-tile-icon-size, 22px) + 20px);
      height: calc(var(--stratum-room-tile-icon-size, 22px) + 20px);
      border-radius: 50%;
      background: color-mix(in srgb, var(--primary-color, #ff9b42) 15%, transparent);
      color: var(--primary-color, #ff9b42);
    }
    .tile.active .icon-bubble {
      background: color-mix(in srgb, var(--stratum-chip-lights-color, #ffc107) 22%, transparent);
      color: var(--stratum-chip-lights-color, #ffc107);
    }
    .icon-flat { color: var(--primary-color, #ff9b42); }
    .tile.active .icon-flat { color: var(--stratum-chip-lights-color, #ffc107); }

    .motion-dot {
      --mdc-icon-size: 18px;
      color: var(--stratum-chip-motion-color, #4caf50);
      filter: drop-shadow(0 0 6px rgba(76, 175, 80, 0.6));
    }

    .name {
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
      justify-content: flex-end;
      gap: 8px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    .tile[data-icon-pos='center'] .info { justify-content: center; }

    .temp { font-variant-numeric: tabular-nums; }

    .lights {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: var(--stratum-chip-lights-color, #ffc107);
      font-weight: 600;
    }
    .lights ha-icon { --mdc-icon-size: 14px; }

    @media (prefers-reduced-motion: reduce) {
      .tile { transition: none; }
      :host([clickable]) .tile:hover,
      :host([clickable]) .tile:active { transform: none; }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-room-tile': StratumCardRoomTile;
  }
}
