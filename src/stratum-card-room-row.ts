// Jeden wiersz pomieszczenia w body rozwiniętej karty.
//
// Cztery presety kształtu (`display_config.preset`):
//  - fill (default) — pigułka z wypełnieniem = średnia jasność świateł
//  - pill           — pigułka z ringiem aktywności
//  - rail           — płaska lista z paskiem akcentu z lewej (dawny wygląd)
//  - cards          — miękkie karty z gradient-tintem
//
// Statusy: stały porządek (temp → wilgotność → światła → ruch → okna →
// drzwi → alarmy), limit 4 widocznych + „+n". Alarmy mają najwyższy
// priorytet i nie są ucinane przed zwykłymi polami.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { RowDisplayConfig, RowPreset, TileField } from './types.js';
import { resolveColor } from './colors.js';
import { DEFAULT_FIELDS, type ConditionOverride } from './tile-data.js';

/** Priorytet pola przy ucinaniu do 4 — wyższy wygrywa. */
const FIELD_PRIORITY: Record<TileField, number> = {
  smoke: 10,
  gas: 9,
  leak: 8,
  problem: 7,
  lights: 6,
  motion: 5,
  temperature: 4,
  windows: 3,
  doors: 2,
  humidity: 1,
};

/** Stała kolejność wyświetlania — niezależna od kolejności w configu. */
const DISPLAY_ORDER: TileField[] = [
  'temperature',
  'humidity',
  'lights',
  'motion',
  'windows',
  'doors',
  'leak',
  'smoke',
  'gas',
  'problem',
];

/** Maksymalna liczba widocznych statusów zanim pojawi się „+n". */
const MAX_VISIBLE_FIELDS = 4;

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

  /** Liczba aktywnych czujek dymu. */
  @property({ type: Number, attribute: 'smoke-active' }) public smokeActive = 0;

  /** Liczba aktywnych czujek gazu/CO. */
  @property({ type: Number, attribute: 'gas-active' }) public gasActive = 0;

  /** Liczba aktywnych „problem" binary_sensors. */
  @property({ type: Number, attribute: 'problem-active' }) public problemActive = 0;

  /** Globalna konfiguracja wyglądu (fields, accent_color, preset, show_icon…). */
  @property({ attribute: false }) public displayConfig?: RowDisplayConfig;

  /** Per-pokój CSS override. */
  @property({ type: String, attribute: 'style-override' }) public styleOverride?: string;

  /** Overrides wyliczone z `display_config.conditions`. */
  @property({ attribute: false }) public conditionOverride?: ConditionOverride;

  /** Dynamiczny accent z aktywnego światła (accent_mode=lights). */
  @property({ type: String, attribute: 'lights-accent' }) public lightsAccent?: string;

  /** Jasność pierwszego światła (0-1) — do intensywności akcentu. */
  @property({ type: Number, attribute: 'lights-brightness' }) public lightsBrightness?: number;

  /** Średnia jasność włączonych świateł (0-1) — napędza preset fill. */
  @property({ type: Number, attribute: 'lights-avg-brightness' })
  public lightsAvgBrightness?: number;

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

  /** Czy pole ma niepustą wartość do pokazania. */
  private _fieldHasValue(f: TileField): boolean {
    switch (f) {
      case 'temperature':
        return Boolean(this.temperature);
      case 'humidity':
        return Boolean(this.humidity);
      case 'lights':
        return this.lightsOn > 0;
      case 'motion':
        return this.motion;
      case 'windows':
        return this.windowsOpen > 0;
      case 'doors':
        return this.doorsOpen > 0;
      case 'leak':
        return this.leakActive > 0;
      case 'smoke':
        return this.smokeActive > 0;
      case 'gas':
        return this.gasActive > 0;
      case 'problem':
        return this.problemActive > 0;
      default:
        return false;
    }
  }

  /** Pola do pokazania: max 4 wg priorytetu, w stałej kolejności + licznik ukrytych. */
  private _visibleFields(configured: TileField[]): {
    shown: TileField[];
    hiddenCount: number;
  } {
    const withValue = configured.filter((f) => this._fieldHasValue(f));
    if (withValue.length <= MAX_VISIBLE_FIELDS) {
      return {
        shown: DISPLAY_ORDER.filter((f) => withValue.includes(f)),
        hiddenCount: 0,
      };
    }
    const byPriority = [...withValue].sort(
      (a, b) => (FIELD_PRIORITY[b] ?? 0) - (FIELD_PRIORITY[a] ?? 0),
    );
    const top = new Set(byPriority.slice(0, MAX_VISIBLE_FIELDS));
    return {
      shown: DISPLAY_ORDER.filter((f) => top.has(f)),
      hiddenCount: withValue.length - MAX_VISIBLE_FIELDS,
    };
  }

  /** Czy jakikolwiek alarm jest aktywny (smoke/gas/leak/problem). */
  private get _alarmActive(): boolean {
    return (
      this.smokeActive > 0 ||
      this.gasActive > 0 ||
      this.leakActive > 0 ||
      this.problemActive > 0
    );
  }

  protected render(): TemplateResult {
    const cfg = this.displayConfig ?? {};
    const preset: RowPreset = cfg.preset ?? 'fill';
    const fields = cfg.fields ?? DEFAULT_FIELDS;
    const showIcon = cfg.show_icon !== false;
    const showName = cfg.show_name !== false;
    const ovr = this.conditionOverride;
    const stateActive = this.lightsOn > 0 || this.motion;
    const lightsActive = Boolean(this.lightsAccent);
    const effectiveActive = stateActive || Boolean(ovr?.accent_color) || lightsActive;
    const alarmed = this._alarmActive;
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

    // Wypełnienie (preset fill): % = średnia jasność włączonych świateł.
    const fillPct =
      preset === 'fill' && typeof this.lightsAvgBrightness === 'number'
        ? Math.round(this.lightsAvgBrightness * 100)
        : 0;

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
      `--stratum-room-row-fill: ${fillPct}%;`,
      borderColorOvr
        ? `border: ${borderWidthOvr ?? '1px'} solid ${borderColorOvr};`
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

    const { shown, hiddenCount } = this._visibleFields(fields);

    return html`
      <div
        class="row ${effectiveActive ? 'active' : ''} ${alarmed ? 'alerted' : ''} ${rowAnim
          ? `anim-${rowAnim}`
          : ''}"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        data-preset=${preset}
        data-hover=${hoverEffect}
        style=${styles}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        ${preset === 'fill' && fillPct > 0
          ? html`<span class="fill" aria-hidden="true"></span>`
          : nothing}
        ${preset === 'rail' ? html`<span class="bar" aria-hidden="true"></span>` : nothing}
        ${showIcon
          ? html`<span class="iconwrap">
              <ha-icon
                class="icon ${iconAnim ? `icon-anim-${iconAnim}` : ''}"
                .icon=${effectiveIcon}
              ></ha-icon>
            </span>`
          : nothing}
        ${showName
          ? html`<span class="name">${this.name}</span>`
          : html`<span class="name-spacer"></span>`}
        <div class="info">
          ${shown.map((f) => this._renderField(f))}
          ${hiddenCount > 0
            ? html`<span class="field more" title="${hiddenCount} więcej">+${hiddenCount}</span>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderField(f: TileField): TemplateResult | typeof nothing {
    switch (f) {
      case 'temperature':
        return html`<span class="field temp">${this.temperature}</span>`;
      case 'humidity':
        return html`<span class="field hum">
          <ha-icon .icon=${'mdi:water-percent'}></ha-icon>
          ${this.humidity}
        </span>`;
      case 'motion':
        return html`<ha-icon
          class="field motion"
          .icon=${'mdi:motion-sensor'}
          title="Ktoś jest w pomieszczeniu"
        ></ha-icon>`;
      case 'lights':
        return html`<span class="field lights">
          <ha-icon .icon=${'mdi:lightbulb-on'}></ha-icon>
          ${this.lightsOn}
        </span>`;
      case 'windows':
        return html`<span class="field windows">
          <ha-icon .icon=${'mdi:window-open-variant'}></ha-icon>
          ${this.windowsOpen}
        </span>`;
      case 'doors':
        return html`<span class="field doors">
          <ha-icon .icon=${'mdi:door-open'}></ha-icon>
          ${this.doorsOpen}
        </span>`;
      case 'leak':
        return html`<span class="field leak">
          <ha-icon .icon=${'mdi:water-alert'}></ha-icon>
          ${this.leakActive}
        </span>`;
      case 'smoke':
        return html`<span class="field smoke">
          <ha-icon .icon=${'mdi:smoke-detector-variant'}></ha-icon>
          ${this.smokeActive}
        </span>`;
      case 'gas':
        return html`<span class="field gas">
          <ha-icon .icon=${'mdi:gas-cylinder'}></ha-icon>
          ${this.gasActive}
        </span>`;
      case 'problem':
        return html`<span class="field problem">
          <ha-icon .icon=${'mdi:alert-circle-outline'}></ha-icon>
          ${this.problemActive}
        </span>`;
      default:
        return nothing;
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    /* ====== BAZA wspólna dla presetów ====== */
    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: var(--stratum-room-row-min-height, 52px);
      transition: background 0.15s ease, border-color 0.15s ease,
        transform 0.12s ease, box-shadow 0.15s ease;
      overflow: hidden;
    }

    .row > *:not(.fill):not(.bar) {
      position: relative;
      z-index: 1;
    }

    :host([clickable]) .row {
      cursor: pointer;
    }

    :host([clickable]) .row:active {
      transform: scale(var(--stratum-room-row-press-scale, 0.98));
    }

    :host([clickable]) .row:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: -2px;
    }

    .iconwrap {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .icon {
      --mdc-icon-size: var(--stratum-room-row-icon-size, 20px);
      color: var(--stratum-card-room-icon-color, var(--secondary-text-color));
      transform: scale(var(--stratum-room-row-icon-scale, 1));
      transform-origin: center center;
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .name-spacer {
      flex: 1;
    }

    .info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      color: var(--secondary-text-color);
      font-size: 12.5px;
      font-variant-numeric: tabular-nums;
    }

    /* ====== PRESET: fill (default) + pill ====== */
    .row[data-preset='fill'],
    .row[data-preset='pill'] {
      border-radius: var(--stratum-room-row-radius, 999px);
      background: var(--stratum-room-row-bg, rgba(255, 255, 255, 0.04));
      padding: var(--stratum-room-row-padding, 5px) 16px
        var(--stratum-room-row-padding, 5px) 5px;
      min-height: var(--stratum-room-row-min-height, 54px);
      margin-bottom: 6px;
    }

    .row[data-preset='fill'] .iconwrap,
    .row[data-preset='pill'] .iconwrap {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--stratum-room-row-iconbg, rgba(0, 0, 0, 0.25));
    }

    .row[data-preset='fill'].active .iconwrap,
    .row[data-preset='pill'].active .iconwrap {
      background: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 16%,
        var(--stratum-room-row-iconbg, rgba(0, 0, 0, 0.25))
      );
    }

    .row[data-preset='fill'].active .icon,
    .row[data-preset='pill'].active .icon {
      color: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }

    .row[data-preset='fill'].alerted .iconwrap,
    .row[data-preset='pill'].alerted .iconwrap {
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 18%, transparent);
    }
    .row[data-preset='fill'].alerted .icon,
    .row[data-preset='pill'].alerted .icon {
      color: var(--stratum-chip-leak-color, #f44336);
    }

    /* fill: warstwa wypełnienia = średnia jasność świateł */
    .fill {
      position: absolute;
      inset: 0;
      width: var(--stratum-room-row-fill, 0%);
      border-radius: inherit;
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 16%, transparent),
        color-mix(in srgb, var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 5%, transparent)
      );
      transition: width 0.3s ease-out;
      pointer-events: none;
    }

    /* pill: ring aktywności zamiast wypełnienia */
    .row[data-preset='pill'].active {
      box-shadow: inset 0 0 0 1.5px
        color-mix(in srgb, var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 40%, transparent);
    }
    .row[data-preset='fill'].alerted,
    .row[data-preset='pill'].alerted {
      box-shadow: inset 0 0 0 1.5px
        color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 50%, transparent);
    }

    /* ====== PRESET: rail (dawny wygląd, zwarty) ====== */
    .row[data-preset='rail'] {
      padding: var(--stratum-room-row-padding, 6px) 8px
        var(--stratum-room-row-padding, 6px) 14px;
      min-height: var(--stratum-room-row-min-height, 48px);
      border-radius: var(--stratum-room-row-radius, 8px);
    }

    .bar {
      position: absolute;
      left: 2px;
      top: 20%;
      bottom: 20%;
      width: 3px;
      border-radius: 3px;
      background: transparent;
      transition: background 0.15s ease;
    }

    .row[data-preset='rail'].active .bar {
      background: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }
    .row[data-preset='rail'].alerted .bar {
      background: var(--stratum-chip-leak-color, #f44336);
    }

    .row[data-preset='rail'] .iconwrap {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--stratum-room-row-iconbg, rgba(255, 255, 255, 0.05));
    }
    .row[data-preset='rail'].active .icon {
      color: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }
    .row[data-preset='rail'].alerted .icon {
      color: var(--stratum-chip-leak-color, #f44336);
    }

    /* ====== PRESET: cards ====== */
    .row[data-preset='cards'] {
      border-radius: var(--stratum-room-row-radius, 14px);
      background: var(--stratum-room-row-bg, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.07));
      padding: var(--stratum-room-row-padding, 8px) 14px;
      min-height: var(--stratum-room-row-min-height, 54px);
      margin-bottom: 6px;
    }

    .row[data-preset='cards'].active {
      background: linear-gradient(
          120deg,
          color-mix(in srgb, var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 10%, transparent),
          transparent 55%
        ),
        var(--stratum-room-row-bg, rgba(255, 255, 255, 0.04));
      border-color: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 28%,
        transparent
      );
    }
    .row[data-preset='cards'].alerted {
      border-color: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 40%, transparent);
    }

    .row[data-preset='cards'] .iconwrap {
      width: 36px;
      height: 36px;
      border-radius: 11px;
      background: var(--stratum-room-row-iconbg, rgba(255, 255, 255, 0.05));
    }
    .row[data-preset='cards'].active .iconwrap {
      background: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 16%,
        transparent
      );
    }
    .row[data-preset='cards'].active .icon {
      color: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }
    .row[data-preset='cards'].alerted .icon {
      color: var(--stratum-chip-leak-color, #f44336);
    }

    /* ====== hover ====== */
    :host([clickable]) .row[data-hover='subtle']:hover {
      background-color: var(--stratum-card-room-hover, rgba(255, 255, 255, 0.07));
    }
    :host([clickable]) .row[data-hover='lift']:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
    }
    :host([clickable]) .row[data-hover='glow']:hover {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color, #ff9b42) 50%, transparent);
    }

    /* ====== Animacje (z reguł warunkowych) ====== */
    .row.anim-pulse { animation: stratum-row-pulse 1.6s ease-in-out infinite; }
    .row.anim-blink { animation: stratum-row-blink 1.4s ease-in-out infinite; }
    .row.anim-shake { animation: stratum-row-shake 0.6s ease-in-out infinite; }
    .row.anim-glow { animation: stratum-row-glow 2.4s ease-in-out infinite; }
    .row.anim-bounce { animation: stratum-row-bounce 1.4s ease-in-out infinite; }

    @keyframes stratum-row-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 45%, transparent);
      }
      50% {
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 0%, transparent);
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
      .fill { transition: none; }
      .row.anim-pulse, .row.anim-blink, .row.anim-shake, .row.anim-glow, .row.anim-bounce,
      .icon.icon-anim-spin, .icon.icon-anim-pulse, .icon.icon-anim-blink,
      .icon.icon-anim-shake, .icon.icon-anim-bounce { animation: none; }
      :host([clickable]) .row:hover,
      :host([clickable]) .row:active { transform: none; }
    }

    /* ====== Pola statusów ====== */
    .field {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .field ha-icon {
      --mdc-icon-size: 16px;
    }

    .temp {
      font-variant-numeric: tabular-nums;
    }

    .hum {
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
    }

    .motion {
      --mdc-icon-size: 16px;
      color: var(--stratum-chip-motion-color, #4caf50);
    }

    .lights { color: var(--stratum-chip-lights-color, #ffc107); font-weight: 600; }
    .windows { color: var(--stratum-chip-windows-color, #42a5f5); font-weight: 600; }
    .doors { color: var(--stratum-chip-doors-color, #ba68c8); font-weight: 600; }
    .leak { color: var(--stratum-chip-leak-color, #f44336); font-weight: 600; }
    .smoke { color: var(--stratum-chip-smoke-color, #e53935); font-weight: 600; }
    .gas { color: var(--stratum-chip-gas-color, #ff5722); font-weight: 600; }
    .problem { color: var(--stratum-chip-problem-color, #ff9800); font-weight: 600; }

    .more {
      color: var(--secondary-text-color);
      font-weight: 600;
      background: var(--stratum-room-row-iconbg, rgba(255, 255, 255, 0.06));
      border-radius: 999px;
      padding: 1px 7px;
      font-size: 11px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-room-row': StratumCardRoomRow;
  }
}
