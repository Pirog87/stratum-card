// Edytor belki nagłówka karty Stratum.
//
// Rich config (chipy size, swatche kolorów, slidery, toggles, accent bar) —
// spójny wizualnie z stratum-display-editor. Emituje `header-config-changed`.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HeaderConfig, HeaderTitleSize } from './types.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const TITLE_SIZES: Array<{ value: HeaderTitleSize; label: string; preview: string }> = [
  { value: 'sm', label: 'Mały', preview: '14px' },
  { value: 'md', label: 'Średni', preview: '17px' },
  { value: 'lg', label: 'Duży', preview: '20px' },
];

const TITLE_WEIGHTS: Array<{ value: 400 | 500 | 600 | 700; label: string }> = [
  { value: 400, label: 'Normalna' },
  { value: 500, label: 'Średnia' },
  { value: 600, label: 'Semi-bold' },
  { value: 700, label: 'Bold' },
];

const COLOR_SWATCHES: Array<{ key: string; color: string; label: string }> = [
  { key: 'amber', color: '#ffc107', label: 'Amber' },
  { key: 'green', color: '#4caf50', label: 'Zielony' },
  { key: 'blue', color: '#2196f3', label: 'Niebieski' },
  { key: 'red', color: '#e53935', label: 'Czerwony' },
  { key: 'purple', color: '#9c27b0', label: 'Fioletowy' },
  { key: 'orange', color: '#ff9800', label: 'Pomarańcz' },
  { key: 'teal', color: '#009688', label: 'Morski' },
  { key: 'pink', color: '#ec407a', label: 'Różowy' },
];

type ColorKey = 'title_color' | 'icon_color' | 'accent_bar_color';

@customElement('stratum-header-editor')
export class StratumHeaderEditor extends LitElement {
  @property({ attribute: false }) public config: HeaderConfig = {};

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

  protected render(): TemplateResult {
    const cfg = this.config;
    const titleSize = cfg.title_size ?? 'md';
    const titleWeight = cfg.title_weight ?? 500;
    const iconSize = cfg.icon_size ?? 22;
    const padding = cfg.padding ?? 14;

    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">Rozmiar tytułu</label>
        <div class="stratum-chip-row">
          ${TITLE_SIZES.map(
            (s) => html`<button
              type="button"
              class="stratum-chip title-size-chip ${titleSize === s.value ? 'on' : ''}"
              @click=${() => this._setTitleSize(s.value)}
            >
              <span class="size-preview" data-size=${s.value}>Aa</span>
              <span>${s.label}</span>
            </button>`,
          )}
        </div>
      </div>

      <div class="stratum-group">
        <label class="stratum-group-label">Waga tytułu</label>
        <div class="stratum-chip-row">
          ${TITLE_WEIGHTS.map(
            (w) => html`<button
              type="button"
              class="stratum-chip ${titleWeight === w.value ? 'on' : ''}"
              style="font-weight:${w.value};"
              @click=${() => this._setTitleWeight(w.value)}
            >
              ${w.label}
            </button>`,
          )}
        </div>
      </div>

      ${this._renderColorRow('Kolor tytułu', 'title_color', cfg.title_color)}
      ${this._renderColorRow('Kolor ikony', 'icon_color', cfg.icon_color)}

      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Rozmiar ikony</label>
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

      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Padding belki</label>
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
      </div>

      <div class="stratum-toggles-row">
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${cfg.hide_expander === true}
            @change=${(ev: Event) => this._onToggle('hide_expander', ev)}
          />
          <span>Ukryj chevron</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${cfg.accent_bar === true}
            @change=${(ev: Event) => this._onToggle('accent_bar', ev)}
          />
          <span>Akcentowy pasek z lewej</span>
        </label>
      </div>

      ${cfg.accent_bar
        ? this._renderColorRow(
            'Kolor akcentowego paska',
            'accent_bar_color',
            cfg.accent_bar_color,
          )
        : nothing}
    `;
  }

  private _renderColorRow(
    label: string,
    key: ColorKey,
    value: string | undefined,
  ): TemplateResult {
    const isPreset = COLOR_SWATCHES.some((s) => s.key === value);
    const custom = !isPreset && value ? value : '';
    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">${label}</label>
        <div class="stratum-chip-row">
          ${COLOR_SWATCHES.map(
            (s) => html`<button
              type="button"
              class="swatch ${value === s.key ? 'on' : ''}"
              style="--swatch:${s.color};"
              title=${s.label}
              @click=${() => this._onColorSwatch(key, s.key)}
            ></button>`,
          )}
          <input
            type="text"
            class="custom-input"
            placeholder="#hex lub var(--color)"
            .value=${custom}
            @change=${(ev: Event) => this._onColorCustom(key, ev)}
          />
          ${value
            ? html`<button
                type="button"
                class="stratum-chip subtle"
                title="Wyłącz"
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
