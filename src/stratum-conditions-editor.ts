// Edytor listy reguł warunkowego stylu (`display_config.conditions`).
//
// Każda reguła = pole + operator + opcjonalna wartość + overrides stylu
// (accent / border / background / icon / icon_color / pulse). Kolejność
// w tablicy znaczy: pierwsza pasująca reguła wygrywa.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  DisplayConditionConfig,
  DisplayConditionOp,
  HomeAssistant,
  TileField,
} from './types.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const FIELD_META: Array<{ value: TileField; label: string; icon: string }> = [
  { value: 'temperature', label: 'Temperatura', icon: 'mdi:thermometer' },
  { value: 'humidity', label: 'Wilgotność', icon: 'mdi:water-percent' },
  { value: 'lights', label: 'Światła', icon: 'mdi:lightbulb-on' },
  { value: 'motion', label: 'Obecność', icon: 'mdi:motion-sensor' },
  { value: 'windows', label: 'Okna', icon: 'mdi:window-open-variant' },
  { value: 'doors', label: 'Drzwi', icon: 'mdi:door-open' },
];

const OP_LABELS: Record<DisplayConditionOp, string> = {
  any_on: 'Dowolna aktywna',
  none_on: 'Żadna aktywna',
  count_gt: 'Ilość >',
  gt: 'Wartość >',
  lt: 'Wartość <',
  eq: 'Wartość =',
};

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

function opsFor(field: TileField): DisplayConditionOp[] {
  if (field === 'temperature' || field === 'humidity') {
    return ['any_on', 'none_on', 'gt', 'lt', 'eq'];
  }
  if (field === 'motion') return ['any_on', 'none_on'];
  return ['any_on', 'none_on', 'count_gt'];
}

function needsValue(op: DisplayConditionOp): boolean {
  return op === 'count_gt' || op === 'gt' || op === 'lt' || op === 'eq';
}

type ColorKey = 'accent_color' | 'border_color' | 'background_color' | 'icon_color';

@customElement('stratum-conditions-editor')
export class StratumConditionsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public conditions: DisplayConditionConfig[] = [];

  /** Który rząd jest rozwinięty w edycji (domyślnie żaden). */
  @state() private _openRow = -1;

  private _emit(next: DisplayConditionConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('conditions-changed', {
        detail: { conditions: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _add(): void {
    const next: DisplayConditionConfig[] = [
      ...this.conditions,
      { field: 'lights', when: 'any_on', accent_color: 'amber' },
    ];
    this._openRow = next.length - 1;
    this._emit(next);
  }

  private _remove(index: number): void {
    this._emit(this.conditions.filter((_, i) => i !== index));
    if (this._openRow === index) this._openRow = -1;
  }

  private _move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.conditions.length) return;
    const next = [...this.conditions];
    [next[index], next[target]] = [next[target]!, next[index]!];
    this._emit(next);
  }

  private _toggleOpen(index: number): void {
    this._openRow = this._openRow === index ? -1 : index;
  }

  private _patch(index: number, patch: Partial<DisplayConditionConfig>): void {
    const next = this.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    const updated = next[index]!;
    // Jeśli zmiana pola wymusza inny operator — resetuj.
    const allowedOps = opsFor(updated.field);
    if (!allowedOps.includes(updated.when)) {
      updated.when = allowedOps[0]!;
    }
    if (!needsValue(updated.when)) {
      delete updated.value;
    }
    this._emit(next);
  }

  private _onFieldChip(index: number, field: TileField): void {
    this._patch(index, { field });
  }

  private _onOpChip(index: number, when: DisplayConditionOp): void {
    this._patch(index, { when });
  }

  private _onValueInput(index: number, ev: Event): void {
    const raw = (ev.target as HTMLInputElement).value;
    const value = raw === '' ? undefined : parseFloat(raw);
    this._patch(index, { value });
  }

  private _onColorSwatch(index: number, key: ColorKey, value: string): void {
    const current = this.conditions[index]?.[key];
    // Klik w aktywny swatch wyłącza go.
    this._patch(index, { [key]: current === value ? undefined : value } as Partial<DisplayConditionConfig>);
  }

  private _onColorCustom(index: number, key: ColorKey, ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this._patch(index, { [key]: v === '' ? undefined : v } as Partial<DisplayConditionConfig>);
  }

  private _onColorClear(index: number, key: ColorKey): void {
    this._patch(index, { [key]: undefined } as Partial<DisplayConditionConfig>);
  }

  private _onBorderWidth(index: number, ev: Event): void {
    const v = parseInt((ev.target as HTMLInputElement).value, 10);
    this._patch(index, { border_width: v === 0 ? undefined : v });
  }

  private _onPulseToggle(index: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._patch(index, { pulse: checked || undefined });
  }

  protected render(): TemplateResult {
    return html`
      ${this.conditions.length === 0
        ? html`<div class="stratum-empty">
            Brak reguł. Dodaj pierwszą, np. „Okna — dowolna aktywna → czerwony border".
          </div>`
        : nothing}

      <div class="stratum-list">
        ${this.conditions.map((cond, idx) => this._renderRow(cond, idx))}
      </div>

      <button type="button" class="stratum-add-btn" @click=${this._add}>
        <ha-icon .icon=${'mdi:plus-circle-outline'}></ha-icon>
        Dodaj regułę
      </button>
    `;
  }

  private _renderRow(cond: DisplayConditionConfig, idx: number): TemplateResult {
    const isOpen = this._openRow === idx;
    const summary = this._summarize(cond);
    const canMoveUp = idx > 0;
    const canMoveDown = idx < this.conditions.length - 1;
    return html`
      <div class="stratum-row stratum-condition-row active">
        <div class="stratum-row-head" @click=${() => this._toggleOpen(idx)}>
          <span class="stratum-row-avatar">
            <ha-icon .icon=${FIELD_META.find((f) => f.value === cond.field)?.icon ?? 'mdi:function-variant'}></ha-icon>
          </span>
          <div class="stratum-condition-summary">
            <span class="stratum-row-title">${summary.title}</span>
            ${summary.hint
              ? html`<span class="stratum-condition-hint">${summary.hint}</span>`
              : nothing}
          </div>
          <div class="stratum-row-actions" @click=${(e: Event) => e.stopPropagation()}>
            <button
              type="button"
              class="stratum-icon-btn"
              title="W górę"
              ?disabled=${!canMoveUp}
              @click=${() => this._move(idx, -1)}
            >
              <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
            </button>
            <button
              type="button"
              class="stratum-icon-btn"
              title="W dół"
              ?disabled=${!canMoveDown}
              @click=${() => this._move(idx, 1)}
            >
              <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
            </button>
            <button
              type="button"
              class="stratum-icon-btn ${isOpen ? 'accent' : ''}"
              title=${isOpen ? 'Zwiń' : 'Edytuj'}
              @click=${() => this._toggleOpen(idx)}
            >
              <ha-icon .icon=${isOpen ? 'mdi:chevron-up' : 'mdi:pencil'}></ha-icon>
            </button>
            <button
              type="button"
              class="stratum-icon-btn danger"
              title="Usuń"
              @click=${() => this._remove(idx)}
            >
              <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
            </button>
          </div>
        </div>
        ${isOpen ? html`<div class="stratum-row-sub">${this._renderSub(cond, idx)}</div>` : nothing}
      </div>
    `;
  }

  private _renderSub(cond: DisplayConditionConfig, idx: number): TemplateResult {
    const allowedOps = opsFor(cond.field);
    const showValue = needsValue(cond.when);
    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">Pole</label>
        <div class="stratum-chip-row">
          ${FIELD_META.map(
            (f) => html`<button
              type="button"
              class="stratum-chip ${cond.field === f.value ? 'on' : ''}"
              @click=${() => this._onFieldChip(idx, f.value)}
            >
              <ha-icon .icon=${f.icon}></ha-icon>
              <span>${f.label}</span>
            </button>`,
          )}
        </div>
      </div>

      <div class="stratum-group">
        <label class="stratum-group-label">Warunek</label>
        <div class="stratum-chip-row">
          ${allowedOps.map(
            (op) => html`<button
              type="button"
              class="stratum-chip ${cond.when === op ? 'on' : ''}"
              @click=${() => this._onOpChip(idx, op)}
            >
              ${OP_LABELS[op]}
            </button>`,
          )}
        </div>
      </div>

      ${showValue
        ? html`<div class="stratum-group">
            <label class="stratum-group-label">Wartość</label>
            <input
              type="number"
              class="num-input"
              step="0.5"
              .value=${cond.value !== undefined ? String(cond.value) : ''}
              @input=${(ev: Event) => this._onValueInput(idx, ev)}
            />
          </div>`
        : nothing}

      <div class="style-header">Styl gdy reguła spełniona</div>

      ${this._renderColorRow('Kolor akcentu', 'accent_color', cond.accent_color, idx)}
      ${this._renderColorRow('Kolor borderu', 'border_color', cond.border_color, idx)}

      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Grubość borderu</label>
        <div class="stratum-slider-value">
          ${cond.border_width !== undefined ? `${cond.border_width} px` : 'bez zmiany'}
        </div>
        <input
          type="range"
          class="stratum-slider"
          min="0"
          max="8"
          step="1"
          .value=${String(cond.border_width ?? 0)}
          @input=${(ev: Event) => this._onBorderWidth(idx, ev)}
        />
      </div>

      ${this._renderColorRow('Kolor tła', 'background_color', cond.background_color, idx)}

      <div class="stratum-group">
        <label class="stratum-group-label">Ikona (override)</label>
        <ha-form
          .hass=${this.hass}
          .data=${{ icon: cond.icon ?? '' }}
          .schema=${[{ name: 'icon', selector: { icon: {} } }]}
          .computeLabel=${() => ''}
          @value-changed=${(ev: CustomEvent<{ value: { icon?: string } }>) => {
            ev.stopPropagation();
            this._patch(idx, { icon: ev.detail.value.icon || undefined });
          }}
        ></ha-form>
      </div>

      ${this._renderColorRow('Kolor ikony', 'icon_color', cond.icon_color, idx)}

      <div class="stratum-toggles-row">
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${cond.pulse === true}
            @change=${(ev: Event) => this._onPulseToggle(idx, ev)}
          />
          <span>Pulsuj (animacja glow)</span>
        </label>
      </div>
    `;
  }

  private _renderColorRow(
    label: string,
    key: ColorKey,
    value: string | undefined,
    idx: number,
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
              @click=${() => this._onColorSwatch(idx, key, s.key)}
            ></button>`,
          )}
          <input
            type="text"
            class="custom-input"
            placeholder="#hex lub var(--color)"
            .value=${custom}
            @change=${(ev: Event) => this._onColorCustom(idx, key, ev)}
          />
          ${value
            ? html`<button
                type="button"
                class="stratum-chip subtle"
                title="Wyłącz override"
                @click=${() => this._onColorClear(idx, key)}
              >
                <ha-icon .icon=${'mdi:close'}></ha-icon>
              </button>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _summarize(cond: DisplayConditionConfig): { title: string; hint: string } {
    const fieldLabel = FIELD_META.find((f) => f.value === cond.field)?.label ?? cond.field;
    const opLabel = OP_LABELS[cond.when];
    const valuePart =
      needsValue(cond.when) && typeof cond.value === 'number' ? ` ${cond.value}` : '';
    const stylePieces: string[] = [];
    if (cond.accent_color) stylePieces.push(`akcent: ${cond.accent_color}`);
    if (cond.border_color) stylePieces.push(`border: ${cond.border_color}`);
    if (cond.background_color) stylePieces.push(`tło: ${cond.background_color}`);
    if (cond.icon) stylePieces.push(`ikona: ${cond.icon}`);
    if (cond.icon_color) stylePieces.push(`icon: ${cond.icon_color}`);
    if (cond.pulse) stylePieces.push('pulsuj');
    return {
      title: `${fieldLabel} — ${opLabel}${valuePart}`,
      hint: stylePieces.join(' · '),
    };
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .stratum-condition-row {
        border-left: 3px solid var(--primary-color, #ff9b42);
      }

      .stratum-row-head {
        cursor: pointer;
      }

      .stratum-condition-summary {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }

      .stratum-condition-hint {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .stratum-icon-btn.danger:hover {
        color: var(--error-color, #e53935);
      }

      .style-header {
        margin: 16px 0 8px;
        padding-top: 10px;
        border-top: 1px dashed var(--divider-color);
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.05em;
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

      .num-input {
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 14px;
        max-width: 120px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-conditions-editor': StratumConditionsEditor;
  }
}
