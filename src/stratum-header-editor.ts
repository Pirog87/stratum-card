// Edytor belki nagłówka karty Stratum.
//
// Rich config (chipy size, swatche kolorów, slidery, toggles, accent bar) —
// spójny wizualnie z stratum-display-editor. Emituje `header-config-changed`.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HeaderConfig, HeaderTitleSize } from './types.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import { localizeUi, type UiKey } from './localize/editor-localize.js';

// `label` to klucz słownika (src/localize/) — tekst wybiera język z `hass`.
const TITLE_SIZES: Array<{ value: HeaderTitleSize; label: UiKey; preview: string }> = [
  { value: 'sm', label: 'editor.header.size_sm', preview: '14px' },
  { value: 'md', label: 'editor.header.size_md', preview: '17px' },
  { value: 'lg', label: 'editor.header.size_lg', preview: '20px' },
];

const TITLE_WEIGHTS: Array<{ value: 400 | 500 | 600 | 700; label: UiKey }> = [
  { value: 400, label: 'editor.header.weight_400' },
  { value: 500, label: 'editor.header.weight_500' },
  { value: 600, label: 'editor.header.weight_600' },
  { value: 700, label: 'editor.header.weight_700' },
];

const COLOR_SWATCHES: Array<{ key: string; color: string; label: UiKey }> = [
  { key: 'amber', color: '#ffc107', label: 'editor.colors.amber' },
  { key: 'green', color: '#4caf50', label: 'editor.colors.green' },
  { key: 'blue', color: '#2196f3', label: 'editor.colors.blue' },
  { key: 'red', color: '#e53935', label: 'editor.colors.red' },
  { key: 'purple', color: '#9c27b0', label: 'editor.colors.purple' },
  { key: 'orange', color: '#ff9800', label: 'editor.colors.orange' },
  { key: 'teal', color: '#009688', label: 'editor.colors.teal' },
  { key: 'pink', color: '#ec407a', label: 'editor.colors.pink' },
];

const HEADER_STYLES: Array<{ value: 'classic' | 'stripes'; label: UiKey }> = [
  { value: 'classic', label: 'editor.header.style_classic' },
  { value: 'stripes', label: 'editor.header.style_stripes' },
];

const STRIPES_COLORS: Array<{ value: 'lights' | 'static'; label: UiKey }> = [
  { value: 'lights', label: 'editor.header.stripes_color_lights' },
  { value: 'static', label: 'editor.header.stripes_color_static' },
];

type ColorKey = 'title_color' | 'icon_color' | 'accent_bar_color';

@customElement('stratum-header-editor')
export class StratumHeaderEditor extends LitElement {
  @property({ attribute: false }) public config: HeaderConfig = {};
  /**
   * Język UI (`langOf(hass)` z edytora karty). Sam kod języka zamiast
   * `hass`: edytor belki nie czyta encji, a nowe `hass` przy każdej
   * zmianie stanu w domu przerysowywałoby cały formularz.
   */
  @property({ attribute: false }) public uiLang?: string;

  private _t(key: UiKey): string {
    return localizeUi(this.uiLang, key);
  }

  private _emit(next: HeaderConfig): void {
    this.dispatchEvent(
      new CustomEvent('header-config-changed', {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _patch(patch: Partial<HeaderConfig>): void {
    this._emit({ ...this.config, ...patch });
  }

  private _setTitleSize(size: HeaderTitleSize): void {
    this._patch({ title_size: size === 'md' ? undefined : size });
  }

  private _setTitleWeight(weight: 400 | 500 | 600 | 700): void {
    this._patch({ title_weight: weight === 500 ? undefined : weight });
  }

  private _onColorSwatch(key: ColorKey, value: string): void {
    const current = this.config[key];
    this._patch({
      [key]: current === value ? undefined : value,
    } as Partial<HeaderConfig>);
  }

  private _onColorCustom(key: ColorKey, ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this._patch({ [key]: v === '' ? undefined : v } as Partial<HeaderConfig>);
  }

  private _onColorClear(key: ColorKey): void {
    this._patch({ [key]: undefined } as Partial<HeaderConfig>);
  }

  private _onSlider(key: 'icon_size' | 'padding', ev: Event): void {
    const v = parseInt((ev.target as HTMLInputElement).value, 10);
    this._patch({ [key]: v } as Partial<HeaderConfig>);
  }

  private _onToggle(
    key: 'hide_expander' | 'accent_bar',
    ev: Event,
  ): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._patch({ [key]: checked ? true : undefined } as Partial<HeaderConfig>);
  }

  private _setStyle(style: 'classic' | 'stripes'): void {
    this._patch({ style: style === 'classic' ? undefined : style });
  }

  private _setStripesColor(mode: 'lights' | 'static'): void {
    this._patch({ stripes_color: mode === 'lights' ? undefined : mode });
  }

  private _onStripesMax(ev: Event): void {
    const v = parseInt((ev.target as HTMLInputElement).value, 10);
    this._patch({ stripes_max: v === 3 ? undefined : v });
  }

  /**
   * Przełączniki, których stan domyślny to „włączone” — w configu zapisujemy
   * tylko odstępstwo, żeby YAML zostawał czysty.
   */
  private _onIconFrameToggle(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    // Domyślnie bez ramki — zapisujemy tylko włączenie.
    this._patch({ icon_frame: checked ? true : undefined });
  }

  private _onDefaultOnToggle(key: 'icon_glow' | 'stripes_tap', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (key === 'icon_glow') {
      this._patch({ icon_glow: checked ? undefined : false });
    } else {
      this._patch({ stripes_tap: checked ? undefined : 'none' });
    }
  }

  private _renderStripesOptions(cfg: HeaderConfig): TemplateResult {
    const max = cfg.stripes_max ?? 3;
    const colorMode = cfg.stripes_color ?? 'lights';
    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">${this._t('editor.header.stripes_color')}</label>
        <div class="stratum-chip-row">
          ${STRIPES_COLORS.map(
            (c) => html`<button
              type="button"
              class="stratum-chip ${colorMode === c.value ? 'on' : ''}"
              @click=${() => this._setStripesColor(c.value)}
            >
              ${this._t(c.label)}
            </button>`,
          )}
        </div>
      </div>

      <div class="stratum-slider-row">
        <label class="stratum-slider-label">${this._t('editor.header.stripes_max')}</label>
        <div class="stratum-slider-value">${max}</div>
        <input
          type="range"
          class="stratum-slider"
          min="1"
          max="4"
          step="1"
          .value=${String(max)}
          @input=${this._onStripesMax}
        />
      </div>

      <div class="stratum-toggles-row">
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${cfg.icon_glow !== false}
            @change=${(ev: Event) => this._onDefaultOnToggle('icon_glow', ev)}
          />
          <span>${this._t('editor.header.icon_glow')}</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${cfg.icon_frame === true}
            @change=${this._onIconFrameToggle}
          />
          <span>${this._t('editor.header.icon_frame')}</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${cfg.stripes_tap !== 'none'}
            @change=${(ev: Event) => this._onDefaultOnToggle('stripes_tap', ev)}
          />
          <span>${this._t('editor.header.stripes_tap')}</span>
        </label>
      </div>
    `;
  }

  protected render(): TemplateResult {
    const cfg = this.config;
    const titleSize = cfg.title_size ?? 'md';
    const titleWeight = cfg.title_weight ?? 500;
    const iconSize = cfg.icon_size ?? 22;
    const padding = cfg.padding ?? 14;

    const style = cfg.style ?? 'classic';
    const isStripes = style === 'stripes';

    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">${this._t('editor.header.style')}</label>
        <div class="stratum-chip-row">
          ${HEADER_STYLES.map(
            (s) => html`<button
              type="button"
              class="stratum-chip ${style === s.value ? 'on' : ''}"
              @click=${() => this._setStyle(s.value)}
            >
              ${this._t(s.label)}
            </button>`,
          )}
        </div>
      </div>

      ${isStripes ? this._renderStripesOptions(cfg) : nothing}

      <div class="stratum-group">
        <label class="stratum-group-label">${this._t('editor.header.title_size')}</label>
        <div class="stratum-chip-row">
          ${TITLE_SIZES.map(
            (s) => html`<button
              type="button"
              class="stratum-chip title-size-chip ${titleSize === s.value ? 'on' : ''}"
              @click=${() => this._setTitleSize(s.value)}
            >
              <span class="size-preview" data-size=${s.value}>Aa</span>
              <span>${this._t(s.label)}</span>
            </button>`,
          )}
        </div>
      </div>

      <div class="stratum-group">
        <label class="stratum-group-label">${this._t('editor.header.title_weight')}</label>
        <div class="stratum-chip-row">
          ${TITLE_WEIGHTS.map(
            (w) => html`<button
              type="button"
              class="stratum-chip ${titleWeight === w.value ? 'on' : ''}"
              style="font-weight:${w.value};"
              @click=${() => this._setTitleWeight(w.value)}
            >
              ${this._t(w.label)}
            </button>`,
          )}
        </div>
      </div>

      ${this._renderColorRow('editor.header.title_color', 'title_color', cfg.title_color)}
      ${this._renderColorRow('editor.header.icon_color', 'icon_color', cfg.icon_color)}

      <div class="stratum-slider-row">
        <label class="stratum-slider-label">${this._t('editor.header.icon_size')}</label>
        <div class="stratum-slider-value">${iconSize} px</div>
        <input
          type="range"
          class="stratum-slider"
          min="16"
          max="48"
          step="1"
          .value=${String(iconSize)}
          @input=${(ev: Event) => this._onSlider('icon_size', ev)}
        />
      </div>

      ${
        // Belka „Smugi" ma stałą wysokość (paski liczą z niej skos) —
        // padding jej nie zmienia, więc suwak byłby martwy.
        isStripes
          ? nothing
          : html`<div class="stratum-slider-row">
              <label class="stratum-slider-label">${this._t('editor.header.padding')}</label>
              <div class="stratum-slider-value">${padding} px</div>
              <input
                type="range"
                class="stratum-slider"
                min="4"
                max="28"
                step="1"
                .value=${String(padding)}
                @input=${(ev: Event) => this._onSlider('padding', ev)}
              />
            </div>`
      }

      ${
        // Belka „Smugi" nie rysuje chevronu ani akcentowego paska — opcje,
        // które nic nie zmieniają, chowamy zamiast zostawiać martwe.
        isStripes
          ? nothing
          : html`<div class="stratum-toggles-row">
                <label class="stratum-toggle">
                  <input
                    type="checkbox"
                    .checked=${cfg.hide_expander === true}
                    @change=${(ev: Event) =>
                      this._onToggle('hide_expander', ev)}
                  />
                  <span>${this._t('editor.header.hide_chevron')}</span>
                </label>
                <label class="stratum-toggle">
                  <input
                    type="checkbox"
                    .checked=${cfg.accent_bar === true}
                    @change=${(ev: Event) => this._onToggle('accent_bar', ev)}
                  />
                  <span>${this._t('editor.header.accent_bar')}</span>
                </label>
              </div>

              ${cfg.accent_bar
                ? this._renderColorRow(
                    'editor.header.accent_bar_color',
                    'accent_bar_color',
                    cfg.accent_bar_color,
                  )
                : nothing}`
      }
    `;
  }

  private _renderColorRow(
    label: UiKey,
    key: ColorKey,
    value: string | undefined,
  ): TemplateResult {
    const isPreset = COLOR_SWATCHES.some((s) => s.key === value);
    const custom = !isPreset && value ? value : '';
    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">${this._t(label)}</label>
        <div class="stratum-chip-row">
          ${COLOR_SWATCHES.map(
            (s) => html`<button
              type="button"
              class="swatch ${value === s.key ? 'on' : ''}"
              style="--swatch:${s.color};"
              title=${this._t(s.label)}
              @click=${() => this._onColorSwatch(key, s.key)}
            ></button>`,
          )}
          <input
            type="text"
            class="custom-input"
            placeholder=${this._t('editor.common.color_placeholder')}
            .value=${custom}
            @change=${(ev: Event) => this._onColorCustom(key, ev)}
          />
          ${value
            ? html`<button
                type="button"
                class="stratum-chip subtle"
                title=${this._t('editor.common.clear_color')}
                @click=${() => this._onColorClear(key)}
              >
                <ha-icon .icon=${'mdi:close'}></ha-icon>
              </button>`
            : nothing}
        </div>
      </div>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .title-size-chip {
        flex-direction: column;
        gap: 2px;
        padding: 6px 10px 4px;
        min-width: 60px;
      }

      .size-preview {
        line-height: 1;
        font-weight: 600;
      }

      .size-preview[data-size='sm'] {
        font-size: 12px;
      }

      .size-preview[data-size='md'] {
        font-size: 16px;
      }

      .size-preview[data-size='lg'] {
        font-size: 20px;
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
        min-width: 140px;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 12px;
      }

      .custom-input:focus-visible {
        outline: 2px solid var(--primary-color, #ff9b42);
        outline-offset: 1px;
      }

      .stratum-chip.subtle {
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-header-editor': StratumHeaderEditor;
  }
}
