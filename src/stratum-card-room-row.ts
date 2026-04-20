// Jeden wiersz pomieszczenia w body rozwiniętej karty.
//
// Pokazuje: ikonę area, nazwę, oraz mini-informacje wg pól z globalnej
// konfiguracji (`display_config.fields`). Klik na wiersz — tap_action albo
// popup pokoju.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { RowDisplayConfig, TileField } from './types.js';
import { resolveColor } from './colors.js';
import { DEFAULT_FIELDS, type ConditionOverride } from './tile-data.js';

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

  /** Liczba aktywnych czujek wycieku. */
  @property({ type: Number, attribute: 'leak-active' }) public leakActive = 0;

  /** Globalna konfiguracja wyglądu (fields, accent_color, show_icon/show_name). */
  @property({ attribute: false }) public displayConfig?: RowDisplayConfig;

  /** Per-pokój CSS override. */
  @property({ type: String, attribute: 'style-override' }) public styleOverride?: string;

  /** Overrides wyliczone z `display_config.conditions`. */
  @property({ attribute: false }) public conditionOverride?: ConditionOverride;

  /** Dynamiczny accent z aktywnego światła (accent_mode=lights). */
  @property({ type: String, attribute: 'lights-accent' }) public lightsAccent?: string;

  /** Jasność światła (0-1). */
  @property({ type: Number, attribute: 'lights-brightness' }) public lightsBrightness?: number;

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
    const ovr = this.conditionOverride;
    const stateActive = this.lightsOn > 0 || this.motion;
    const lightsActive = Boolean(this.lightsAccent);
    const effectiveActive = stateActive || Boolean(ovr?.accent_color) || lightsActive;
    const accent =
      resolveColor(ovr?.accent_color) ??
      this.lightsAccent ??
      resolveColor(cfg.accent_color);
    const effectiveIcon = ovr?.icon ?? this.icon;
    const iconColorOvr = resolveColor(ovr?.icon_color);
    const rowAnim = ovr?.animation;
    const iconAnim = ovr?.icon_animation;
    const textColorOvr = resolveColor(ovr?.text_color);
    const opacityOvr = typeof ovr?.opacity === 'number' ? ovr.opacity : undefined;
    const iconScaleOvr =
      typeof ovr?.icon_size_scale === 'number' ? ovr.icon_size_scale : undefined;
    const borderColorOvr = resolveColor(ovr?.border_color);
    const borderWidthOvr =
      typeof ovr?.border_width === 'number' ? `${ovr.border_width}px` : undefined;
    const bgColorOvr = resolveColor(ovr?.background_color);

    const hoverEffect = cfg.hover_effect ?? 'subtle';
    const pressScale = typeof cfg.press_scale === 'number' ? cfg.press_scale : 0.98;

    const cssVars: string[] = [
      effectiveActive && accent
        ? `--stratum-room-row-active-color: ${accent};`
        : '',
      typeof cfg.border_radius === 'number'
        ? `--stratum-room-row-radius: ${cfg.border_radius}px;`
        : '',
      typeof cfg.padding === 'number'
        ? `--stratum-room-row-padding: ${cfg.padding}px;`
        : '',
      typeof cfg.min_height === 'number'
        ? `--stratum-room-row-min-height: ${cfg.min_height}px;`
        : '',
      typeof cfg.icon_size === 'number'
        ? `--stratum-room-row-icon-size: ${cfg.icon_size}px;`
        : '',
      `--stratum-room-row-press-scale: ${pressScale};`,
      borderColorOvr
        ? `border: ${borderWidthOvr ?? '1px'} solid ${borderColorOvr}; border-radius: var(--stratum-room-row-radius, 6px);`
        : borderWidthOvr
        ? `border-width: ${borderWidthOvr};`
        : '',
      bgColorOvr ? `background-color: ${bgColorOvr};` : '',
      iconColorOvr ? `--stratum-card-room-icon-color: ${iconColorOvr};` : '',
      textColorOvr ? `color: ${textColorOvr};` : '',
      opacityOvr !== undefined ? `opacity: ${opacityOvr};` : '',
      iconScaleOvr !== undefined ? `--stratum-room-row-icon-scale: ${iconScaleOvr};` : '',
      this.styleOverride ?? '',
    ];
    const styles = cssVars.filter(Boolean).join(' ');

    return html`
      <div
        class="row ${effectiveActive ? 'active' : ''} ${rowAnim ? `anim-${rowAnim}` : ''}"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        data-hover=${hoverEffect}
        style=${styles}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        ${showIcon
          ? html`<ha-icon
              class="icon ${iconAnim ? `icon-anim-${iconAnim}` : ''}"
              .icon=${effectiveIcon}
            ></ha-icon>`
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
        case 'leak':
          return this.leakActive > 0
            ? html`<span class="field leak">
                <ha-icon .icon=${'mdi:water-alert'}></ha-icon>
                ${this.leakActive}
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
      padding: var(--stratum-room-row-padding, 10px 4px);
      min-height: var(--stratum-room-row-min-height, auto);
      border-bottom: 0.5px solid
        var(--stratum-card-room-divider, var(--divider-color, rgba(255, 255, 255, 0.06)));
      transition: background 0.15s ease, border-color 0.15s ease,
        transform 0.12s ease, box-shadow 0.15s ease;
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
      border-radius: var(--stratum-room-row-radius, 6px);
    }

    :host([clickable]) .row[data-hover='subtle']:hover {
      background: var(--stratum-card-room-hover, rgba(255, 255, 255, 0.04));
    }
    :host([clickable]) .row[data-hover='lift']:hover {
      background: var(--stratum-card-room-hover, rgba(255, 255, 255, 0.04));
      transform: translateY(-1px);
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
    }
    :host([clickable]) .row[data-hover='glow']:hover {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color, #ff9b42) 50%, transparent);
    }

    :host([clickable]) .row:active {
      transform: scale(var(--stratum-room-row-press-scale, 0.98));
    }

    :host([clickable]) .row:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: -2px;
    }

    :host(:last-of-type) .row {
      border-bottom: 0;
    }

    .icon {
      --mdc-icon-size: var(--stratum-room-row-icon-size, 20px);
      color: var(--stratum-card-room-icon-color, var(--secondary-text-color));
      flex-shrink: 0;
    }

    /* --- Animacje dla row (z reguł warunkowych) --- */
    .row.anim-pulse { animation: stratum-row-pulse 1.6s ease-in-out infinite; }
    .row.anim-blink { animation: stratum-row-blink 1.4s ease-in-out infinite; }
    .row.anim-shake { animation: stratum-row-shake 0.6s ease-in-out infinite; }
    .row.anim-glow { animation: stratum-row-glow 2.4s ease-in-out infinite; }
    .row.anim-bounce { animation: stratum-row-bounce 1.4s ease-in-out infinite; }

    @keyframes stratum-row-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 color-mix(
          in srgb,
          var(--stratum-room-row-active-color, #ffc107) 45%,
          transparent
        );
      }
      50% {
        box-shadow: 0 0 0 6px color-mix(
          in srgb,
          var(--stratum-room-row-active-color, #ffc107) 0%,
          transparent
        );
      }
    }
    @keyframes stratum-row-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes stratum-row-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }
    @keyframes stratum-row-glow {
      0%, 100% { box-shadow: 0 0 4px color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 40%, transparent); }
      50% { box-shadow: 0 0 10px color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 60%, transparent); }
    }
    @keyframes stratum-row-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
    }

    /* --- Animacje ikony w row --- */
    .icon {
      transform: scale(var(--stratum-room-row-icon-scale, 1));
      transform-origin: center center;
    }
    .icon.icon-anim-spin { animation: stratum-icon-spin 3s linear infinite; }
    .icon.icon-anim-pulse { animation: stratum-icon-pulse 1.4s ease-in-out infinite; }
    .icon.icon-anim-blink { animation: stratum-row-blink 1.4s ease-in-out infinite; }
    .icon.icon-anim-shake { animation: stratum-row-shake 0.6s ease-in-out infinite; }
    .icon.icon-anim-bounce { animation: stratum-row-bounce 1.2s ease-in-out infinite; }
    .icon.icon-anim-glow { filter: drop-shadow(0 0 4px currentColor); }

    @keyframes stratum-icon-spin {
      from { transform: rotate(0deg) scale(var(--stratum-room-row-icon-scale, 1)); }
      to { transform: rotate(360deg) scale(var(--stratum-room-row-icon-scale, 1)); }
    }
    @keyframes stratum-icon-pulse {
      0%, 100% { transform: scale(var(--stratum-room-row-icon-scale, 1)); }
      50% { transform: scale(calc(var(--stratum-room-row-icon-scale, 1) * 1.2)); }
    }

    @media (prefers-reduced-motion: reduce) {
      .row { transition: none; }
      .row.anim-pulse, .row.anim-blink, .row.anim-shake, .row.anim-glow, .row.anim-bounce,
      .icon.icon-anim-spin, .icon.icon-anim-pulse, .icon.icon-anim-blink,
      .icon.icon-anim-shake, .icon.icon-anim-bounce { animation: none; }
      :host([clickable]) .row:hover,
      :host([clickable]) .row:active { transform: none; }
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

    .leak {
      color: var(--stratum-chip-leak-color, #f44336);
      font-weight: 600;
    }

    .leak ha-icon {
      --mdc-icon-size: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-room-row': StratumCardRoomRow;
  }
}
