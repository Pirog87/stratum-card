// Dedykowany edytor `display_config` — zamiast gołego ha-form pokazuje
// chipy, swatche kolorów, presety proporcji, grid pozycji ikony i slidery
// z widocznymi wartościami. Emituje `display-config-changed`.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type {
  HoverEffect,
  IconPosition,
  IconStyle,
  RowPreset,
  TileDisplayConfig,
  TileField,
} from './types.js';
import { SCENE_PRESETS } from './scene-presets.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import { localize, lookup, messages, type MessageKey } from './localize/localize.js';
import { effectiveFields } from './tile-data.js';
import {
  moveField,
  rowStyleDefaults,
  TILE_STYLE_DEFAULTS,
  toggleField,
} from './display-config-clean.js';

/** Typ edytora — zwykły kontrakt wyglądu, bez conditions (te są top-level). */
export type DisplayEditorMode = 'row' | 'tile';

// `label`/`hint` w tablicach poniżej to klucze słownika (src/localize/).
const FIELD_META: Array<{ key: TileField; icon: string; label: MessageKey }> = [
  { key: 'temperature', icon: 'mdi:thermometer', label: 'editor.fields.temperature' },
  { key: 'humidity', icon: 'mdi:water-percent', label: 'editor.fields.humidity' },
  { key: 'lights', icon: 'mdi:lightbulb-on', label: 'editor.fields.lights' },
  { key: 'motion', icon: 'mdi:motion-sensor', label: 'editor.fields.motion' },
  { key: 'windows', icon: 'mdi:window-open-variant', label: 'editor.fields.windows' },
  { key: 'doors', icon: 'mdi:door-open', label: 'editor.fields.doors' },
  { key: 'leak', icon: 'mdi:water-alert', label: 'editor.fields.leak' },
  { key: 'smoke', icon: 'mdi:smoke-detector-variant', label: 'editor.fields.smoke' },
  { key: 'gas', icon: 'mdi:gas-cylinder', label: 'editor.fields.gas' },
  { key: 'problem', icon: 'mdi:alert-circle-outline', label: 'editor.fields.problem' },
];

const ASPECT_PRESETS: Array<{ value: string; label: string }> = [
  { value: '1/1', label: '1:1' },
  { value: '4/3', label: '4:3' },
  { value: '3/2', label: '3:2' },
  { value: '16/9', label: '16:9' },
  { value: '2/1', label: '2:1' },
];

const COLOR_SWATCHES: Array<{ key: string; color: string; label: MessageKey }> = [
  { key: 'amber', color: '#ffc107', label: 'editor.colors.amber' },
  { key: 'green', color: '#4caf50', label: 'editor.colors.green' },
  { key: 'blue', color: '#2196f3', label: 'editor.colors.blue' },
  { key: 'red', color: '#e53935', label: 'editor.colors.red' },
  { key: 'purple', color: '#9c27b0', label: 'editor.colors.purple' },
  { key: 'orange', color: '#ff9800', label: 'editor.colors.orange' },
  { key: 'teal', color: '#009688', label: 'editor.colors.teal' },
  { key: 'pink', color: '#ec407a', label: 'editor.colors.pink' },
];

const ICON_POSITIONS: Array<{ value: IconPosition; label: MessageKey; preview: string }> = [
  { value: 'top-left', label: 'editor.display.pos_top_left', preview: '↖' },
  { value: 'top-right', label: 'editor.display.pos_top_right', preview: '↗' },
  { value: 'center', label: 'editor.display.pos_center', preview: '●' },
  { value: 'bottom-left', label: 'editor.display.pos_bottom_left', preview: '↙' },
  { value: 'bottom-right', label: 'editor.display.pos_bottom_right', preview: '↘' },
  { value: 'left', label: 'editor.display.pos_left', preview: '⇤' },
];

const NARROW_MODES: Array<{
  value: NonNullable<TileDisplayConfig['narrow_mode']>;
  label: MessageKey;
  icon: string;
  hint: MessageKey;
}> = [
  {
    value: 'fields',
    label: 'editor.display.narrow_fields',
    icon: 'mdi:arrow-collapse-horizontal',
    hint: 'editor.display.narrow_fields_hint',
  },
  {
    value: 'two-line',
    label: 'editor.display.narrow_two_line',
    icon: 'mdi:view-headline',
    hint: 'editor.display.narrow_two_line_hint',
  },
  {
    value: 'compact',
    label: 'editor.display.narrow_compact',
    icon: 'mdi:arrow-collapse-all',
    hint: 'editor.display.narrow_compact_hint',
  },
  {
    value: 'off',
    label: 'editor.display.narrow_off',
    icon: 'mdi:cancel',
    hint: 'editor.display.narrow_off_hint',
  },
];

const ICON_STYLES: Array<{ value: IconStyle; label: MessageKey; icon: string }> = [
  { value: 'bubble', label: 'editor.display.icon_bubble', icon: 'mdi:circle-slice-8' },
  { value: 'flat', label: 'editor.display.icon_flat', icon: 'mdi:circle-outline' },
  { value: 'none', label: 'editor.common.none', icon: 'mdi:eye-off-outline' },
];

const HOVER_EFFECTS: Array<{ value: HoverEffect; label: MessageKey }> = [
  { value: 'none', label: 'editor.common.none' },
  { value: 'subtle', label: 'editor.display.hover_subtle' },
  { value: 'lift', label: 'editor.display.hover_lift' },
  { value: 'glow', label: 'editor.display.hover_glow' },
];

/** Presety kształtu wiersza — tylko mode 'row'. */
const ROW_PRESETS: Array<{
  value: RowPreset;
  label: MessageKey;
  icon: string;
  hint: MessageKey;
}> = [
  {
    value: 'fill',
    label: 'editor.display.preset_fill',
    icon: 'mdi:signal',
    hint: 'editor.display.preset_fill_hint',
  },
  {
    value: 'pill',
    label: 'editor.display.preset_pill',
    icon: 'mdi:capsule',
    hint: 'editor.display.preset_pill_hint',
  },
  {
    value: 'rail',
    label: 'editor.display.preset_rail',
    icon: 'mdi:format-list-bulleted',
    hint: 'editor.display.preset_rail_hint',
  },
  {
    value: 'cards',
    label: 'editor.display.preset_cards',
    icon: 'mdi:card-outline',
    hint: 'editor.display.preset_cards_hint',
  },
];

@customElement('stratum-display-editor')
export class StratumDisplayEditor extends LitElement {
  @property({ attribute: false }) public config: TileDisplayConfig = {};
  /**
   * Język UI (`langOf(hass)` z edytora karty). Sam kod języka zamiast
   * `hass`: edytor wyglądu nie czyta encji, a nowe `hass` przy każdej
   * zmianie stanu w domu przerysowywałoby cały formularz.
   */
  @property({ attribute: false }) public uiLang?: string;

  private _t(key: MessageKey, vars?: Record<string, string | number>): string {
    return localize(this.uiLang, key, vars);
  }

  /** Tryb edytora — `tile` pokazuje wszystkie pola, `row` ukrywa tile-only. */
  @property({ type: String }) public mode: DisplayEditorMode = 'tile';

  private _emit(next: TileDisplayConfig): void {
    this.dispatchEvent(
      new CustomEvent('display-config-changed', {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _patch(patch: Partial<TileDisplayConfig>): void {
    this._emit({ ...this.config, ...patch });
  }

  private _onFieldColor(field: TileField, ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    const next = { ...this.config };
    const map = { ...(next.field_colors ?? {}) };
    if (value) map[field] = value;
    else delete map[field];
    if (Object.keys(map).length > 0) next.field_colors = map;
    else delete next.field_colors;
    this._emit(next);
  }

  // Lista startowa pól = DEFAULT_FIELDS karty (tile-data.ts), nie
  // osobna kopia — edytor ma pokazywać i edytować dokładnie to, co karta
  // renderuje przy braku `fields`.
  private _moveField(field: TileField, dir: -1 | 1): void {
    const next = moveField(this.config.fields, field, dir);
    if (next) this._emit({ ...this.config, fields: next });
  }

  private _toggleField(field: TileField): void {
    this._patch({ fields: toggleField(this.config.fields, field) });
  }

  private _setAspect(value: string): void {
    this._patch({ aspect: value });
  }

  private _onCustomAspect(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    if (!value) {
      const { aspect: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ aspect: value });
    }
  }

  private _setColor(value: string): void {
    this._patch({ accent_color: value });
  }

  private _setRowPreset(value: RowPreset): void {
    // 'fill' to default — nie zapisujemy do configu (czysty YAML).
    const next = { ...this.config };
    if (value === 'fill') delete next.preset;
    else next.preset = value;
    this._emit(next);
  }

  private _toggleAccentFromLights(): void {
    const cfg = this.config;
    const isLights =
      cfg.accent_mode === 'lights' ||
      (cfg.accent_mode === undefined && !cfg.accent_color);
    const next = { ...cfg };
    if (isLights) {
      // Wyłączamy tryb lights → static (z accent_color albo domyślnym amber).
      next.accent_mode = 'static';
    } else if (cfg.accent_color) {
      // Kolor ustawiony, ale user chce dynamiczny — explicit lights.
      next.accent_mode = 'lights';
    } else {
      // Brak koloru → lights jest defaultem, czyścimy klucz.
      delete next.accent_mode;
    }
    this._emit(next);
  }

  private _setStatusLayout(value: 'two-line' | 'right'): void {
    // 'right' to default — nie zapisujemy do configu.
    const next = { ...this.config };
    if (value === 'right') delete next.status_layout;
    else next.status_layout = value;
    this._emit(next);
  }

  private _toggleSlider(): void {
    const next = { ...this.config };
    if (this.config.slider === false) delete next.slider;
    else next.slider = false;
    this._emit(next);
  }

  private _toggleSliderFromOff(): void {
    const next = { ...this.config };
    if (this.config.slider_from_off === 'none') delete next.slider_from_off;
    else next.slider_from_off = 'none';
    this._emit(next);
  }

  private _toggleLightsSwitch(): void {
    const next = { ...this.config };
    if (this.config.lights_switch === true) delete next.lights_switch;
    else next.lights_switch = true;
    this._emit(next);
  }

  private _toggleLightsSwitchShowOff(): void {
    const next = { ...this.config };
    if (this.config.lights_switch_show_off === false) {
      delete next.lights_switch_show_off;
    } else {
      next.lights_switch_show_off = false;
    }
    this._emit(next);
  }

  private _onCustomColor(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    if (!value) {
      const { accent_color: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ accent_color: value });
    }
  }

  private _onBgPreset(ev: Event): void {
    const value = (ev.target as HTMLSelectElement).value;
    if (value === '__custom__') return;
    if (!value) {
      const { background_image: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ background_image: value });
    }
  }

  private _onCustomBgUrl(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    if (!value) {
      const { background_image: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ background_image: value });
    }
  }

  private _onToggle(key: 'show_icon' | 'show_name', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    // default = true, więc zapisujemy tylko gdy false.
    if (checked) {
      const next = { ...this.config };
      delete next[key];
      this._emit(next);
    } else {
      this._patch({ [key]: false });
    }
  }

  private _onSlider(key: keyof TileDisplayConfig, ev: Event): void {
    const value = parseFloat((ev.target as HTMLInputElement).value);
    this._patch({ [key]: value } as Partial<TileDisplayConfig>);
  }

  /**
   * Powrót do wartości domyślnej = usunięcie klucza. Wymiary wiersza nie
   * są już wycinane przy zapisie (domyślne zależą od presetu), więc to
   * jedyna droga, żeby wiersz znów szedł za presetem.
   */
  private _resetKey(key: keyof TileDisplayConfig): void {
    const next = { ...this.config };
    delete next[key];
    this._emit(next);
  }

  private _setIconStyle(value: IconStyle): void {
    this._patch({ icon_style: value });
  }

  private _setIconPosition(value: IconPosition): void {
    this._patch({ icon_position: value });
  }

  private _setHoverEffect(value: HoverEffect): void {
    this._patch({ hover_effect: value });
  }

  protected render(): TemplateResult {
    const cfg = this.config;
    const fields = effectiveFields(cfg);
    const aspect = cfg.aspect ?? '1/1';
    const aspectIsPreset = ASPECT_PRESETS.some((p) => p.value === aspect);
    const customAspect = aspectIsPreset ? '' : aspect;
    const color = cfg.accent_color ?? '';
    const colorIsPreset = COLOR_SWATCHES.some((s) => s.key === color);
    const customColor = colorIsPreset ? '' : color;
    // DEFAULT: akcent ze świateł, chyba że user wybrał konkretny kolor
    // (wtedy static) albo explicit accent_mode.
    const accentFromLights =
      cfg.accent_mode === 'lights' ||
      (cfg.accent_mode === undefined && !cfg.accent_color);
    const rowPreset: RowPreset = cfg.preset ?? 'fill';
    const sliderOn = cfg.slider !== false;
    const statusLayout = cfg.status_layout ?? 'right';
    const bg = cfg.background_image ?? '';
    const bgIsPreset = bg.startsWith('stratum:');
    const customBgUrl = !bgIsPreset ? bg : '';
    const iconStyle = cfg.icon_style ?? 'bubble';
    const iconPos = cfg.icon_position ?? 'top-left';
    const hover = cfg.hover_effect ?? 'subtle';

    // Wartość suwaka bez ustawionego klucza = to, co karta faktycznie
    // rysuje (fallback w CSS danego presetu), a nie jedna liczba dla
    // wszystkich — Fill to pigułka 999 px, Rail ma 48 px wysokości.
    const defaults =
      this.mode === 'row'
        ? rowStyleDefaults(rowPreset, cfg.min_height)
        : TILE_STYLE_DEFAULTS;
    const radius = cfg.border_radius ?? defaults.border_radius;
    const padding = cfg.padding ?? defaults.padding;
    const minHeight = cfg.min_height ?? defaults.min_height;
    const iconSize = cfg.icon_size ?? defaults.icon_size;
    const press = cfg.press_scale ?? 0.98;

    return html`
      ${this.mode === 'row'
        ? html`<div class="group">
            <label class="group-label">${this._t('editor.display.row_shape')}</label>
            <div class="chip-row">
              ${ROW_PRESETS.map(
                (p) => html`<button
                  type="button"
                  class="chip ${rowPreset === p.value ? 'on' : ''}"
                  title=${this._t(p.hint)}
                  @click=${() => this._setRowPreset(p.value)}
                >
                  <ha-icon .icon=${p.icon}></ha-icon>
                  <span>${this._t(p.label)}</span>
                </button>`,
              )}
            </div>
            <p class="group-hint">
              ${this._t('editor.display.row_shape_hint')}
            </p>
            <label class="group-label sub">${this._t('editor.display.status_layout')}</label>
            <div class="chip-row">
              <button
                type="button"
                class="chip ${statusLayout === 'two-line' ? 'on' : ''}"
                title=${this._t('editor.display.status_two_line_title')}
                @click=${() => this._setStatusLayout('two-line')}
              >
                <ha-icon .icon=${'mdi:format-align-left'}></ha-icon>
                <span>${this._t('editor.display.status_two_line')}</span>
              </button>
              <button
                type="button"
                class="chip ${statusLayout === 'right' ? 'on' : ''}"
                title=${this._t('editor.display.status_right_title')}
                @click=${() => this._setStatusLayout('right')}
              >
                <ha-icon .icon=${'mdi:format-align-right'}></ha-icon>
                <span>${this._t('editor.display.status_right')}</span>
              </button>
            </div>
            <div style="margin-top:12px">
              ${this._renderSlider(this._t('editor.display.row_height'), 'min_height', minHeight, 40, 120, 2, 'px')}
            </div>
            <div class="toggles-row" style="margin-top:4px">
              <label class="toggle">
                <input
                  type="checkbox"
                  .checked=${sliderOn}
                  @change=${this._toggleSlider}
                />
                <span>${this._t('editor.display.slider')}</span>
              </label>
            </div>
            ${sliderOn
              ? html`<div class="toggles-row" style="margin-top:4px">
                  <label class="toggle">
                    <input
                      type="checkbox"
                      .checked=${cfg.slider_from_off !== 'none'}
                      @change=${this._toggleSliderFromOff}
                    />
                    <span>${this._t('editor.display.slider_from_off')}</span>
                  </label>
                </div>`
              : nothing}
            <div class="toggles-row" style="margin-top:4px">
              <label class="toggle">
                <input
                  type="checkbox"
                  .checked=${cfg.lights_switch === true}
                  @change=${this._toggleLightsSwitch}
                />
                <span>${this._t('editor.display.lights_switch')}</span>
              </label>
            </div>
            ${cfg.lights_switch === true
              ? html`
                  <div style="margin-top:6px">
                    ${this._renderSlider(this._t('editor.display.glow_on'), 'lights_switch_glow_on', cfg.lights_switch_glow_on ?? 100, 0, 100, 5, '%')}
                    ${this._renderSlider(this._t('editor.display.glow_off'), 'lights_switch_glow_off', cfg.lights_switch_glow_off ?? 30, 0, 100, 5, '%')}
                  </div>
                  <div class="toggles-row" style="margin-top:4px">
                    <label class="toggle">
                      <input
                        type="checkbox"
                        .checked=${cfg.lights_switch_show_off !== false}
                        @change=${this._toggleLightsSwitchShowOff}
                      />
                      <span>${this._t('editor.display.switch_show_off')}</span>
                    </label>
                  </div>
                `
              : nothing}
          </div>`
        : nothing}

      <details class="stratum-collapsible">
        <summary>
          <ha-icon .icon=${'mdi:format-list-bulleted-type'}></ha-icon>
          <span>${this._t('editor.display.fields_section')}</span>
        </summary>
        <div class="group">
          <label class="group-label">${this._t('editor.display.fields')}</label>
          <div class="chip-row">
            ${FIELD_META.map((f) => {
              const on = fields.includes(f.key);
              return html`<button
                type="button"
                class="chip field-chip ${on ? 'on' : ''}"
                @click=${() => this._toggleField(f.key)}
              >
                <ha-icon .icon=${f.icon}></ha-icon>
                <span>${this._t(f.label)}</span>
              </button>`;
            })}
          </div>
          <p class="group-hint">
            ${this._t('editor.display.fields_hint')}
          </p>
          ${fields.length > 1
            ? html`
                <label class="group-label" style="margin-top:10px;"
                  >${this._t('editor.display.fields_order')}</label
                >
                <div class="chip-row">
                  ${fields.map((key, i) => {
                    const meta = FIELD_META.find((m) => m.key === key);
                    return html`<span class="chip order-chip">
                      <button
                        class="ord"
                        title=${this._t('editor.display.earlier')}
                        ?disabled=${i === 0}
                        @click=${() => this._moveField(key, -1)}
                      >
                        <ha-icon .icon=${'mdi:chevron-left'}></ha-icon>
                      </button>
                      <ha-icon .icon=${meta?.icon ?? 'mdi:help'}></ha-icon>
                      <span>${meta ? this._t(meta.label) : key}</span>
                      <button
                        class="ord"
                        title=${this._t('editor.display.later')}
                        ?disabled=${i === fields.length - 1}
                        @click=${() => this._moveField(key, 1)}
                      >
                        <ha-icon .icon=${'mdi:chevron-right'}></ha-icon>
                      </button>
                    </span>`;
                  })}
                </div>
                <p class="group-hint">
                  ${this._t('editor.display.order_hint')}
                </p>
              `
            : nothing}
          <label class="group-label" style="margin-top:10px;"
            >${this._t('editor.display.field_colors')}</label
          >
          ${fields.map((key) => {
            const meta = FIELD_META.find((m) => m.key === key);
            return html`<div class="fc-row">
              <span class="fc-label">
                <ha-icon .icon=${meta?.icon ?? 'mdi:help'}></ha-icon>
                ${meta ? this._t(meta.label) : key}
              </span>
              <input
                type="text"
                class="custom-input grow"
                placeholder=${this._t('editor.display.field_color_placeholder')}
                .value=${cfg.field_colors?.[key] ?? ''}
                @change=${(ev: Event) => this._onFieldColor(key, ev)}
              />
            </div>`;
          })}
          <p class="group-hint">
            ${this._t('editor.display.field_colors_hint')}
          </p>
        </div>
      </details>

      ${this.mode === 'tile'
        ? html`<div class="group">
            <label class="group-label">${this._t('editor.display.aspect')}</label>
            <div class="chip-row">
              ${ASPECT_PRESETS.map(
                (p) => html`<button
                  type="button"
                  class="chip aspect-chip ${aspect === p.value ? 'on' : ''}"
                  @click=${() => this._setAspect(p.value)}
                >
                  <span
                    class="aspect-preview"
                    style="aspect-ratio:${p.value};"
                  ></span>
                  ${p.label}
                </button>`,
              )}
              <input
                type="text"
                class="custom-input"
                placeholder=${this._t('editor.display.aspect_placeholder')}
                .value=${customAspect}
                @change=${this._onCustomAspect}
              />
            </div>
          </div>`
        : nothing}

      <div class="group">
        <label class="group-label">${this._t('editor.display.accent')}</label>
        <div class="chip-row">
          <button
            type="button"
            class="chip accent-lights ${accentFromLights ? 'on' : ''}"
            title=${this._t('editor.display.accent_lights_title')}
            @click=${this._toggleAccentFromLights}
          >
            <ha-icon .icon=${'mdi:lightbulb-on-outline'}></ha-icon>
            <span>${this._t('editor.display.accent_lights')}</span>
          </button>
          ${COLOR_SWATCHES.map(
            (s) => html`<button
              type="button"
              class="swatch ${!accentFromLights && color === s.key ? 'on' : ''}"
              style="--swatch:${s.color};"
              title=${this._t(s.label)}
              ?disabled=${accentFromLights}
              @click=${() => this._setColor(s.key)}
            ></button>`,
          )}
          <input
            type="text"
            class="custom-input"
            placeholder=${this._t('editor.display.accent_placeholder')}
            .value=${customColor}
            ?disabled=${accentFromLights}
            @change=${this._onCustomColor}
          />
          ${color && !accentFromLights
            ? html`<button
                type="button"
                class="chip subtle"
                @click=${() => this._setColor('')}
              >
                <ha-icon .icon=${'mdi:close'}></ha-icon>
              </button>`
            : nothing}
        </div>
        ${accentFromLights
          ? html`<p class="group-hint">
              ${this._t('editor.display.accent_lights_hint')}
            </p>`
          : nothing}
      </div>

      ${this.mode === 'tile'
        ? html`<div class="group">
            <label class="group-label">${this._t('editor.display.bg_image')}</label>
            <div class="bg-row">
              <select
                class="native-select"
                .value=${bgIsPreset ? bg : customBgUrl ? '__custom__' : ''}
                @change=${this._onBgPreset}
              >
                <option value="">${this._t('editor.display.bg_none')}</option>
                <optgroup label=${this._t('editor.display.bg_presets')}>
                  ${SCENE_PRESETS.map(
                    (p) => html`<option
                      value=${`stratum:${p.id}`}
                      ?selected=${bg === `stratum:${p.id}`}
                    >
                      ${lookup(messages(this.uiLang).editor.scene_presets, p.id) ?? p.id}
                    </option>`,
                  )}
                </optgroup>
                <option
                  value="__custom__"
                  ?selected=${!bgIsPreset && Boolean(customBgUrl)}
                >
                  ${this._t('editor.display.bg_custom')}
                </option>
              </select>
              ${!bgIsPreset
                ? html`<input
                    type="text"
                    class="custom-input grow"
                    placeholder=${this._t('editor.display.bg_url_placeholder')}
                    .value=${customBgUrl}
                    @change=${this._onCustomBgUrl}
                  />`
                : nothing}
            </div>
          </div>`
        : nothing}

      <div class="group toggles-row">
        <label class="toggle">
          <input
            type="checkbox"
            .checked=${cfg.show_icon !== false}
            @change=${(ev: Event) => this._onToggle('show_icon', ev)}
          />
          <span>${this._t('editor.display.show_icon')}</span>
        </label>
        <label class="toggle">
          <input
            type="checkbox"
            .checked=${cfg.show_name !== false}
            @change=${(ev: Event) => this._onToggle('show_name', ev)}
          />
          <span>${this._t('editor.display.show_name')}</span>
        </label>
      </div>

      <details class="stratum-collapsible" open>
        <summary>
          <ha-icon .icon=${'mdi:ruler-square'}></ha-icon>
          <span>${this._t('editor.display.dimensions')}</span>
        </summary>
        <div class="stratum-collapsible-body">
          ${this._renderSlider(
            this._t('editor.display.radius'),
            'border_radius',
            radius,
            0,
            40,
            1,
            'px',
            // 999 px (pigułka) nie mieści się na skali 0–40 — zamiast
            // udawać 40 px mówimy wprost, co karta rysuje.
            radius > 40 ? this._t('editor.display.radius_pill') : undefined,
          )}
          ${this._renderSlider(this._t('editor.display.padding'), 'padding', padding, 0, 40, 1, 'px')}
          ${this.mode === 'tile'
            ? this._renderSlider(this._t('editor.display.tile_min_height'), 'min_height', minHeight, 40, 260, 2, 'px')
            : nothing}
          ${this.mode === 'row'
            ? html`
                <label class="group-label sub">${this._t('editor.display.narrow')}</label>
                <div class="chip-row">
                  ${NARROW_MODES.map(
                    (m) => html`<button
                      type="button"
                      class="chip ${(cfg.narrow_mode ?? 'fields') === m.value
                        ? 'on'
                        : ''}"
                      title=${this._t(m.hint)}
                      @click=${() => this._patch({ narrow_mode: m.value })}
                    >
                      <ha-icon .icon=${m.icon}></ha-icon>
                      <span>${this._t(m.label)}</span>
                    </button>`,
                  )}
                </div>
              `
            : nothing}
        </div>
      </details>

      <details class="stratum-collapsible" open>
        <summary>
          <ha-icon .icon=${'mdi:image-outline'}></ha-icon>
          <span>${this._t('editor.display.icon')}</span>
        </summary>
        <div class="stratum-collapsible-body">
          ${this._renderSlider(this._t('editor.display.icon_size'), 'icon_size', iconSize, 12, 64, 1, 'px')}
          ${this.mode === 'row'
            ? html`
                ${this._renderSlider(
                  this._t('editor.display.icon_offset'),
                  'icon_offset_x',
                  cfg.icon_offset_x ?? 0,
                  -40,
                  40,
                  1,
                  'px',
                )}
                ${this._renderSlider(
                  this._t('editor.display.icon_bg_offset'),
                  'icon_bg_offset_x',
                  cfg.icon_bg_offset_x ?? 0,
                  -40,
                  40,
                  1,
                  'px',
                )}
                ${this._renderSlider(
                  this._t('editor.display.icon_bg_scale'),
                  'icon_bg_scale',
                  cfg.icon_bg_scale ?? 100,
                  50,
                  140,
                  2,
                  '%',
                )}
              `
            : nothing}
          <label class="group-label sub">${this._t('editor.display.icon_style')}</label>
          <div class="chip-row">
            ${ICON_STYLES.map(
              (s) => html`<button
                type="button"
                class="chip ${iconStyle === s.value ? 'on' : ''}"
                @click=${() => this._setIconStyle(s.value)}
              >
                <ha-icon .icon=${s.icon}></ha-icon>
                <span>${this._t(s.label)}</span>
              </button>`,
            )}
          </div>
          ${this.mode === 'tile'
            ? html`
                <label class="group-label sub">${this._t('editor.display.icon_position')}</label>
                <div class="icon-position-grid">
                  ${ICON_POSITIONS.map(
                    (p) => html`<button
                      type="button"
                      class="pos-cell ${iconPos === p.value ? 'on' : ''}"
                      title=${this._t(p.label)}
                      @click=${() => this._setIconPosition(p.value)}
                    >
                      <span class="pos-glyph">${p.preview}</span>
                      <span class="pos-label">${this._t(p.label)}</span>
                    </button>`,
                  )}
                </div>
              `
            : nothing}
        </div>
      </details>

      <details class="stratum-collapsible" open>
        <summary>
          <ha-icon .icon=${'mdi:gesture-tap'}></ha-icon>
          <span>${this._t('editor.display.touch')}</span>
        </summary>
        <div class="stratum-collapsible-body">
          <label class="group-label sub">${this._t('editor.display.hover')}</label>
          <div class="chip-row">
            ${HOVER_EFFECTS.map(
              (h) => html`<button
                type="button"
                class="chip ${hover === h.value ? 'on' : ''}"
                @click=${() => this._setHoverEffect(h.value)}
              >
                ${this._t(h.label)}
              </button>`,
            )}
          </div>
          ${this._renderSlider(this._t('editor.display.press_scale'), 'press_scale', press, 0.9, 1, 0.01, '×')}
        </div>
      </details>
    `;
  }

  private _renderSlider(
    label: string,
    key: keyof TileDisplayConfig,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    displayText?: string,
  ): TemplateResult {
    const isSet = this.config[key] !== undefined;
    const shown = displayText ?? this._formatValue(value, unit);
    return html`
      <div class="slider-row">
        <label class="slider-label">${label}</label>
        <div class="slider-value">
          ${isSet ? nothing : html`<span class="slider-default">${this._t('editor.display.default')}</span>`}
          <!-- Przycisk zostaje w DOM-ie (wyłączony, gdy nie ma czego
               przywracać): usunięty po kliknięciu zabierał ze sobą fokus
               klawiatury i trzeba było przechodzić Tabem przez cały edytor. -->
          <button
            type="button"
            class="slider-reset"
            title=${this._t('editor.display.reset')}
            aria-label=${this._t('editor.display.reset_named', { label })}
            ?disabled=${!isSet}
            @click=${() => this._resetKey(key)}
          >
            <ha-icon .icon=${'mdi:restore'} aria-hidden="true"></ha-icon>
          </button>
          <span>${shown}</span>
        </div>
        <input
          type="range"
          class="slider"
          min=${min}
          max=${max}
          step=${step}
          aria-label=${label}
          .value=${String(Math.min(max, Math.max(min, value)))}
          @input=${(ev: Event) => this._onSlider(key, ev)}
        />
      </div>
    `;
  }

  private _formatValue(v: number, unit: string): string {
    if (unit === '×') return v.toFixed(2);
    return `${v} ${unit}`;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .group {
        margin-bottom: 18px;
      }

      .group-label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 8px;
      }

      .group-label.sub {
        margin-top: 14px;
      }

      .group-hint {
        margin: 6px 0 0;
        font-size: 11px;
        color: var(--secondary-text-color);
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }

      /* Kolory pól — wiersz label + input. */
      .fc-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .fc-row .fc-label {
        flex: 0 0 116px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .fc-row .fc-label ha-icon {
        --mdc-icon-size: 15px;
      }

      /* Kolejność pól — chip ze strzałkami. */
      .order-chip {
        gap: 3px;
        padding: 4px 6px;
        cursor: default;
      }
      .ord {
        border: 0;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        padding: 0;
        display: inline-flex;
        align-items: center;
      }
      .ord[disabled] {
        opacity: 0.25;
        cursor: default;
      }
      .ord ha-icon {
        --mdc-icon-size: 16px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease,
          transform 0.08s ease;
      }

      .chip ha-icon {
        --mdc-icon-size: 14px;
      }

      .chip:hover {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      }

      .chip:active {
        transform: scale(0.97);
      }

      .chip.on {
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 22%, transparent);
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
        font-weight: 600;
      }

      .chip.subtle {
        color: var(--secondary-text-color);
      }

      .chip.accent-lights {
        border-color: color-mix(in srgb, #ffc107 40%, var(--divider-color));
      }

      .chip.accent-lights.on {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, #ffc107 26%, transparent),
          color-mix(in srgb, #ff9b42 26%, transparent)
        );
        border-color: #ffc107;
        color: #ffc107;
      }

      .swatch[disabled],
      .custom-input[disabled] {
        opacity: 0.35;
        cursor: not-allowed;
      }

      .aspect-chip {
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px 4px;
      }

      .aspect-preview {
        display: block;
        width: 26px;
        border: 1.5px solid currentColor;
        border-radius: 3px;
        opacity: 0.6;
      }

      .aspect-chip.on .aspect-preview {
        opacity: 1;
      }

      .swatch {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--swatch, #ccc);
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: transform 0.1s ease, box-shadow 0.12s ease;
      }

      .swatch:hover {
        transform: scale(1.08);
      }

      .swatch.on {
        border-color: var(--primary-text-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--swatch, #ccc) 40%, transparent);
      }

      .custom-input {
        flex: 0 0 auto;
        min-width: 130px;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 12px;
      }

      .custom-input.grow {
        flex: 1 1 auto;
        min-width: 0;
      }

      .custom-input:focus-visible {
        outline: 2px solid var(--primary-color, #ff9b42);
        outline-offset: 1px;
      }

      .native-select {
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 13px;
        min-width: 180px;
      }

      .bg-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .toggles-row {
        display: flex;
        gap: 20px;
        align-items: center;
      }

      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        cursor: pointer;
      }

      .toggle input[type='checkbox'] {
        width: 18px;
        height: 18px;
        accent-color: var(--primary-color, #ff9b42);
        cursor: pointer;
      }

      .slider-row {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-rows: auto auto;
        column-gap: 10px;
        row-gap: 2px;
        margin-bottom: 10px;
      }

      .slider-label {
        grid-column: 1;
        grid-row: 1;
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .slider-value {
        grid-column: 2;
        grid-row: 1;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        font-weight: 600;
      }

      .slider-value {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .slider-default {
        font-weight: 400;
        font-size: 11px;
        color: var(--secondary-text-color);
      }

      /* Reset wartości suwaka — pełny komplet stanów (hover/focus/active),
         bo to jedyna droga powrotu do domyślnych presetu. */
      .slider-reset {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: background 0.12s ease, color 0.12s ease,
          transform 0.08s ease;
      }

      .slider-reset ha-icon {
        --mdc-icon-size: 14px;
      }

      .slider-reset:hover:not(:disabled) {
        background: color-mix(
          in srgb,
          var(--card-background-color) 90%,
          var(--primary-text-color)
        );
        color: var(--primary-text-color);
      }

      .slider-reset:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      .slider-reset:active:not(:disabled) {
        transform: scale(0.96);
      }

      .slider-reset:disabled {
        opacity: 0.5;
        cursor: default;
      }

      @media (prefers-reduced-motion: reduce) {
        .slider-reset {
          transition: none;
        }
        .slider-reset:active:not(:disabled) {
          transform: none;
        }
      }

      .slider {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        accent-color: var(--primary-color, #ff9b42);
        margin: 0;
      }

      .icon-position-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }

      .pos-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 8px 4px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 11px;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }

      .pos-cell:hover {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      }

      .pos-cell.on {
        border-color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 18%, transparent);
        color: var(--primary-color, #ff9b42);
      }

      .pos-glyph {
        font-size: 20px;
        line-height: 1;
      }

      .pos-label {
        font-size: 10px;
      }

      details.stratum-collapsible {
        margin-top: 12px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-display-editor': StratumDisplayEditor;
  }
}
