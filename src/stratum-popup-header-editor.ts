// Panel konfiguracji belki popupu pomieszczenia (popup_header) —
// wydzielony ze stratum-card-editor jako osobny komponent (dług
// techniczny pkt 4). Trzyma cleanup defaultów u siebie i emituje
// `popup-header-changed` z gotową (oczyszczoną) wartością.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type {
  HomeAssistant,
  PopupHeaderConfig,
  StratumRoomCardConfig,
} from './types.js';
import { editorSharedStyles } from './editor-shared-styles.js';

@customElement('stratum-popup-header-editor')
export class StratumPopupHeaderEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  /** Aktualny popup_header z configu karty (undefined = defaulty). */
  @property({ attribute: false }) public value?: PopupHeaderConfig;

  /** Gotowy config karty pokoju do mini-podglądu (undefined = bez podglądu). */
  @property({ attribute: false }) public previewConfig?: StratumRoomCardConfig;

  private _update(patch: Partial<PopupHeaderConfig>): void {
    const merged: PopupHeaderConfig = { ...(this.value ?? {}), ...patch };
    // Cleanup defaultów — trzymamy w configu tylko odstępstwa.
    const effStyle = merged.style ?? 'classic';
    // subtitle 'none' jest znaczący dla stylu avatar (jego default = areas).
    if (!merged.subtitle || (merged.subtitle === 'none' && effStyle !== 'avatar')) {
      delete merged.subtitle;
    }
    if (merged.style === 'classic') delete merged.style;
    if (merged.title_size === 'md') delete merged.title_size;
    if (merged.title_weight === 600) delete merged.title_weight;
    if (!merged.title_color) delete merged.title_color;
    if (!merged.hide_icon) delete merged.hide_icon;
    if (merged.icon_size === undefined) delete merged.icon_size;
    if (!merged.icon_color) delete merged.icon_color;
    if (!merged.icon_bg_color) delete merged.icon_bg_color;
    if (merged.padding === undefined) delete merged.padding;
    if (merged.chips_position === 'inline') delete merged.chips_position;
    if (merged.divider !== false) delete merged.divider;
    if (!merged.accent_bar) delete merged.accent_bar;
    if (!merged.accent_color) delete merged.accent_color;
    this.dispatchEvent(
      new CustomEvent('popup-header-changed', {
        detail: { value: Object.keys(merged).length > 0 ? merged : undefined },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _seg<T extends string | number>(
    label: string,
    options: Array<{ value: T; label: string }>,
    current: T,
    onPick: (v: T) => void,
    hint?: string,
  ): TemplateResult {
    return html`<div class="stratum-group">
      <label class="stratum-group-label">${label}</label>
      <div class="stratum-chip-row">
        ${options.map(
          (o) => html`<button
            type="button"
            class="stratum-chip ${current === o.value ? 'on' : ''}"
            @click=${() => onPick(o.value)}
          >
            <span>${o.label}</span>
          </button>`,
        )}
      </div>
      ${hint ? html`<p class="stratum-group-hint">${hint}</p>` : nothing}
    </div>`;
  }

  private _colorInput(
    label: string,
    value: string | undefined,
    onChange: (v: string | undefined) => void,
  ): TemplateResult {
    return html`<div class="stratum-group">
      <label class="stratum-group-label">${label}</label>
      <input
        type="text"
        class="ph-input"
        placeholder="#hex, nazwa albo var(--color) — puste = domyślny"
        .value=${value ?? ''}
        @change=${(ev: Event) => {
          const v = (ev.target as HTMLInputElement).value.trim();
          onChange(v || undefined);
        }}
      />
    </div>`;
  }

  private _renderPreview(): TemplateResult | typeof nothing {
    if (!this.previewConfig || !this.hass) return nothing;
    const areaId = this.previewConfig.area_id;
    return html`<div class="ph-preview-wrap">
      <label class="stratum-group-label"
        >Podgląd na żywo (${(areaId && this.hass.areas?.[areaId]?.name) ??
        areaId})</label
      >
      <div class="ph-preview">
        <stratum-room-card
          .hass=${this.hass}
          .config=${this.previewConfig}
        ></stratum-room-card>
        <div class="ph-preview-fade"></div>
      </div>
    </div>`;
  }

  protected render(): TemplateResult {
    const ph = this.value ?? {};
    const style = ph.style ?? 'classic';
    return html`
      ${this._renderPreview()}
      ${this._seg(
        'Styl belki',
        [
          { value: 'classic', label: 'Klasyczny' },
          { value: 'avatar', label: 'Avatar' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'compact', label: 'Kompakt' },
        ] as const,
        style,
        (v) => this._update({ style: v }),
        'Avatar = ikona w kółku + podtytuł; Gradient = belka podbarwiona akcentem; Kompakt = niska belka.',
      )}
      ${this._seg(
        'Rozmiar tytułu',
        [
          { value: 'sm', label: 'Mały' },
          { value: 'md', label: 'Średni' },
          { value: 'lg', label: 'Duży' },
        ] as const,
        ph.title_size ?? 'md',
        (v) => this._update({ title_size: v }),
      )}
      ${this._seg(
        'Waga tytułu',
        [
          { value: 400, label: 'Normalna' },
          { value: 500, label: 'Średnia' },
          { value: 600, label: 'Semi-bold' },
          { value: 700, label: 'Bold' },
        ] as const,
        ph.title_weight ?? 600,
        (v) => this._update({ title_weight: v }),
      )}
      ${this._colorInput('Kolor tytułu', ph.title_color, (v) =>
        this._update({ title_color: v }),
      )}
      ${this._seg(
        'Pozycja chipów',
        [
          { value: 'inline', label: 'Przy tytule' },
          { value: 'below', label: 'Druga linia' },
          { value: 'hidden', label: 'Ukryte' },
        ] as const,
        ph.chips_position ?? 'inline',
        (v) => this._update({ chips_position: v }),
        'Druga linia = chipy pod tytułem, przewijane — najlepsze na telefonie przy wielu chipach.',
      )}
      ${this._seg(
        'Podtytuł pod nazwą',
        [
          { value: 'none', label: 'Brak' },
          { value: 'areas', label: 'Strefy scalone' },
          { value: 'entities', label: 'Liczba encji' },
        ] as const,
        ph.subtitle ?? (style === 'avatar' ? 'areas' : 'none'),
        (v) => this._update({ subtitle: v }),
      )}
      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Rozmiar ikony</label>
        <div class="stratum-slider-value">${ph.icon_size ?? 28} px</div>
        <input
          type="range"
          class="stratum-slider"
          min="14"
          max="40"
          step="1"
          .value=${String(ph.icon_size ?? 28)}
          @input=${(ev: Event) =>
            this._update({
              icon_size: parseInt((ev.target as HTMLInputElement).value, 10),
            })}
        />
      </div>
      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Padding belki (dół)</label>
        <div class="stratum-slider-value">${ph.padding ?? 12} px</div>
        <input
          type="range"
          class="stratum-slider"
          min="4"
          max="24"
          step="1"
          .value=${String(ph.padding ?? 12)}
          @input=${(ev: Event) =>
            this._update({
              padding: parseInt((ev.target as HTMLInputElement).value, 10),
            })}
        />
      </div>
      ${this._colorInput('Kolor ikony', ph.icon_color, (v) =>
        this._update({ icon_color: v }),
      )}
      ${this._colorInput(
        'Kolor tła ikony (avatar/gradient)',
        ph.icon_bg_color,
        (v) => this._update({ icon_bg_color: v }),
      )}
      ${this._colorInput(
        'Kolor akcentu (gradient / pasek / tło ikony)',
        ph.accent_color,
        (v) => this._update({ accent_color: v }),
      )}
      <div class="stratum-toggles-row">
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${ph.hide_icon === true}
            @change=${(ev: Event) =>
              this._update({
                hide_icon: (ev.target as HTMLInputElement).checked || undefined,
              })}
          />
          <span>Ukryj ikonę pomieszczenia</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${ph.divider !== false}
            @change=${(ev: Event) =>
              this._update({
                divider: (ev.target as HTMLInputElement).checked ? undefined : false,
              })}
          />
          <span>Separator pod belką</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${ph.accent_bar === true}
            @change=${(ev: Event) =>
              this._update({
                accent_bar: (ev.target as HTMLInputElement).checked || undefined,
              })}
          />
          <span>Akcentowy pasek z lewej</span>
        </label>
      </div>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      /* Mini-podgląd na żywo. */
      .ph-preview-wrap {
        margin-bottom: 12px;
      }
      .ph-preview {
        position: relative;
        max-height: 200px;
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        /* Podgląd, nie panel sterowania — bez klikania (switche!). */
        pointer-events: none;
      }
      .ph-preview-fade {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 46px;
        background: linear-gradient(
          to top,
          var(--card-background-color, #1e1f22),
          transparent
        );
      }

      /* Input koloru. */
      .ph-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.14));
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
        color: var(--primary-text-color);
        font: inherit;
        font-size: 13px;
      }
      .ph-input::placeholder {
        color: var(--secondary-text-color);
        opacity: 0.6;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-popup-header-editor': StratumPopupHeaderEditor;
  }
}
