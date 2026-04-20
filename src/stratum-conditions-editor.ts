// Edytor listy reguł warunkowego stylu (`conditions`).
//
// Każda reguła = pole + operator + wartość + overrides stylu pogrupowane
// w sekcje (Pozycja / Ikona / Tekst). Presety u góry dla szybkiego startu.
// Pierwsza pasująca reguła wygrywa.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  AnimationType,
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
  { value: 'leak', label: 'Wyciek', icon: 'mdi:water-alert' },
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

const TILE_ANIMATIONS: Array<{ value: AnimationType; label: string; icon: string }> = [
  { value: 'none', label: 'Brak', icon: 'mdi:close' },
  { value: 'pulse', label: 'Pulse', icon: 'mdi:pulse' },
  { value: 'blink', label: 'Blink', icon: 'mdi:eye-off-outline' },
  { value: 'shake', label: 'Shake', icon: 'mdi:vibrate' },
  { value: 'glow', label: 'Glow', icon: 'mdi:flash-outline' },
  { value: 'bounce', label: 'Bounce', icon: 'mdi:arrow-expand-vertical' },
];

const ICON_ANIMATIONS: Array<{ value: AnimationType; label: string; icon: string }> = [
  { value: 'none', label: 'Brak', icon: 'mdi:close' },
  { value: 'pulse', label: 'Pulse', icon: 'mdi:pulse' },
  { value: 'blink', label: 'Blink', icon: 'mdi:eye-off-outline' },
  { value: 'shake', label: 'Shake', icon: 'mdi:vibrate' },
  { value: 'bounce', label: 'Bounce', icon: 'mdi:arrow-expand-vertical' },
  { value: 'spin', label: 'Spin', icon: 'mdi:rotate-right' },
  { value: 'glow', label: 'Glow', icon: 'mdi:flash-outline' },
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

type ColorKey =
  | 'accent_color'
  | 'border_color'
  | 'background_color'
  | 'icon_color'
  | 'text_color';

/** Presety typowych scenariuszy — klik dodaje nową regułę z pre-fillem. */
const PRESETS: Array<{
  id: string;
  label: string;
  hint: string;
  icon: string;
  config: DisplayConditionConfig;
}> = [
  {
    id: 'alert_window',
    label: 'Alarm — okno otwarte',
    hint: 'windows any_on → czerwony border + pulse',
    icon: 'mdi:window-open-variant',
    config: {
      field: 'windows',
      when: 'any_on',
      border_color: 'red',
      border_width: 2,
      icon: 'mdi:window-open-variant',
      icon_color: 'red',
      animation: 'pulse',
    },
  },
  {
    id: 'alert_door',
    label: 'Alarm — drzwi otwarte',
    hint: 'doors any_on → pomarańczowy + shake',
    icon: 'mdi:door-open',
    config: {
      field: 'doors',
      when: 'any_on',
      border_color: 'orange',
      icon: 'mdi:door-open',
      icon_color: 'orange',
      animation: 'shake',
    },
  },
  {
    id: 'lights_active',
    label: 'Światła aktywne',
    hint: 'lights any_on → amber glow',
    icon: 'mdi:lightbulb-on',
    config: {
      field: 'lights',
      when: 'any_on',
      accent_color: 'amber',
      icon_color: 'amber',
      animation: 'glow',
    },
  },
  {
    id: 'motion_live',
    label: 'Obecność — live',
    hint: 'motion any_on → zielony akcent + pulsująca ikona',
    icon: 'mdi:motion-sensor',
    config: {
      field: 'motion',
      when: 'any_on',
      accent_color: 'green',
      icon_color: 'green',
      icon_animation: 'pulse',
    },
  },
  {
    id: 'hot',
    label: 'Gorąco (> 25 °C)',
    hint: 'temperature > 25 → czerwony akcent',
    icon: 'mdi:thermometer-high',
    config: {
      field: 'temperature',
      when: 'gt',
      value: 25,
      accent_color: 'red',
      icon: 'mdi:thermometer-high',
      icon_color: 'red',
    },
  },
  {
    id: 'cold',
    label: 'Zimno (< 18 °C)',
    hint: 'temperature < 18 → niebieski akcent',
    icon: 'mdi:snowflake',
    config: {
      field: 'temperature',
      when: 'lt',
      value: 18,
      accent_color: 'blue',
      icon: 'mdi:snowflake',
      icon_color: 'blue',
    },
  },
  {
    id: 'humid',
    label: 'Wilgotno (> 65%)',
    hint: 'humidity > 65 → morski akcent',
    icon: 'mdi:water',
    config: {
      field: 'humidity',
      when: 'gt',
      value: 65,
      accent_color: 'teal',
      icon_color: 'teal',
      icon_animation: 'pulse',
    },
  },
  {
    id: 'inactive',
    label: 'Wyciszenie gdy puste',
    hint: 'lights none_on → opacity 0.5',
    icon: 'mdi:eye-off-outline',
    config: {
      field: 'lights',
      when: 'none_on',
      opacity: 0.5,
    },
  },
];

@customElement('stratum-conditions-editor')
export class StratumConditionsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public conditions: DisplayConditionConfig[] = [];

  @state() private _openRow = -1;
  @state() private _showPresets = false;

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

  private _addPreset(presetId: string): void {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next: DisplayConditionConfig[] = [...this.conditions, { ...preset.config }];
    this._openRow = next.length - 1;
    this._showPresets = false;
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
    this._patch(index, {
      [key]: current === value ? undefined : value,
    } as Partial<DisplayConditionConfig>);
  }

  private _onColorCustom(index: number, key: ColorKey, ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this._patch(index, {
      [key]: v === '' ? undefined : v,
    } as Partial<DisplayConditionConfig>);
  }

  private _onColorClear(index: number, key: ColorKey): void {
    this._patch(index, { [key]: undefined } as Partial<DisplayConditionConfig>);
  }

  private _onSliderChange(
    index: number,
    key: 'border_width' | 'opacity' | 'icon_size_scale',
    ev: Event,
  ): void {
    const v = parseFloat((ev.target as HTMLInputElement).value);
    this._patch(index, { [key]: v } as Partial<DisplayConditionConfig>);
  }

  private _onSliderClear(
    index: number,
    key: 'border_width' | 'opacity' | 'icon_size_scale',
  ): void {
    this._patch(index, { [key]: undefined } as Partial<DisplayConditionConfig>);
  }

  private _onAnimationChip(
    index: number,
    key: 'animation' | 'icon_animation',
    value: AnimationType,
  ): void {
    this._patch(index, {
      [key]: value === 'none' ? undefined : value,
    } as Partial<DisplayConditionConfig>);
  }

  protected render(): TemplateResult {
    return html`
      ${this.conditions.length === 0
        ? html`<div class="stratum-empty">
            Brak reguł. Zacznij od presetu albo dodaj regułę od zera.
          </div>`
        : nothing}

      <div class="stratum-list">
        ${this.conditions.map((cond, idx) => this._renderRow(cond, idx))}
      </div>

      <div class="action-row">
        <button type="button" class="stratum-add-btn" @click=${this._add}>
          <ha-icon .icon=${'mdi:plus-circle-outline'}></ha-icon>
          Dodaj regułę
        </button>
        <button
          type="button"
          class="stratum-add-btn preset-btn ${this._showPresets ? 'open' : ''}"
          @click=${() => (this._showPresets = !this._showPresets)}
        >
          <ha-icon .icon=${'mdi:playlist-star'}></ha-icon>
          Presety
        </button>
      </div>

      ${this._showPresets ? this._renderPresets() : nothing}
    `;
  }

  private _renderPresets(): TemplateResult {
    return html`
      <div class="presets-grid">
        ${PRESETS.map(
          (p) => html`<button
            type="button"
            class="preset-card"
            @click=${() => this._addPreset(p.id)}
          >
            <span class="preset-avatar">
              <ha-icon .icon=${p.icon}></ha-icon>
            </span>
            <span class="preset-body">
              <span class="preset-title">${p.label}</span>
              <span class="preset-hint">${p.hint}</span>
            </span>
          </button>`,
        )}
      </div>
    `;
  }

  private _renderRow(cond: DisplayConditionConfig, idx: number): TemplateResult {
    const isOpen = this._openRow === idx;
    const summary = this._summarize(cond);
    const canMoveUp = idx > 0;
    const canMoveDown = idx < this.conditions.length - 1;
    const fieldIcon =
      FIELD_META.find((f) => f.value === cond.field)?.icon ?? 'mdi:function-variant';
    return html`
      <div class="stratum-row stratum-condition-row active">
        <div class="stratum-row-head" @click=${() => this._toggleOpen(idx)}>
          <span class="stratum-row-avatar">
            <ha-icon .icon=${fieldIcon}></ha-icon>
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

      <div class="section-header">
        <ha-icon .icon=${'mdi:square-outline'}></ha-icon>
        <span>Styl pozycji (wiersz / kafel)</span>
      </div>

      ${this._renderColorRow('Kolor akcentu', 'accent_color', cond.accent_color, idx)}
      ${this._renderColorRow('Kolor borderu', 'border_color', cond.border_color, idx)}
      ${this._renderSlider(
        'Grubość borderu',
        'border_width',
        cond.border_width,
        0,
        8,
        1,
        'px',
        idx,
      )}
      ${this._renderColorRow('Kolor tła', 'background_color', cond.background_color, idx)}
      ${this._renderSlider(
        'Przezroczystość',
        'opacity',
        cond.opacity,
        0.2,
        1,
        0.05,
        '×',
        idx,
      )}
      ${this._renderAnimationRow(
        'Animacja pozycji',
        'animation',
        cond.animation,
        TILE_ANIMATIONS,
        idx,
      )}

      <div class="section-header">
        <ha-icon .icon=${'mdi:image-outline'}></ha-icon>
        <span>Styl ikony</span>
      </div>

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
      ${this._renderSlider(
        'Skala ikony',
        'icon_size_scale',
        cond.icon_size_scale,
        0.5,
        2,
        0.1,
        '×',
        idx,
      )}
      ${this._renderAnimationRow(
        'Animacja ikony',
        'icon_animation',
        cond.icon_animation,
        ICON_ANIMATIONS,
        idx,
      )}

      <div class="section-header">
        <ha-icon .icon=${'mdi:format-color-text'}></ha-icon>
        <span>Styl tekstu</span>
      </div>

      ${this._renderColorRow('Kolor tekstu', 'text_color', cond.text_color, idx)}
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
                title="Wyłącz"
                @click=${() => this._onColorClear(idx, key)}
              >
                <ha-icon .icon=${'mdi:close'}></ha-icon>
              </button>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderSlider(
    label: string,
    key: 'border_width' | 'opacity' | 'icon_size_scale',
    value: number | undefined,
    min: number,
    max: number,
    step: number,
    unit: string,
    idx: number,
  ): TemplateResult {
    const displayed =
      value === undefined
        ? 'bez zmiany'
        : unit === '×'
        ? value.toFixed(2)
        : `${value} ${unit}`;
    const current = value ?? (min === 0 ? 0 : min);
    return html`
      <div class="stratum-slider-row">
        <label class="stratum-slider-label">${label}</label>
        <div class="stratum-slider-value">
          ${displayed}
          ${value !== undefined
            ? html`<button
                type="button"
                class="clear-mini"
                title="Wyłącz"
                @click=${() => this._onSliderClear(idx, key)}
              >
                <ha-icon .icon=${'mdi:close'}></ha-icon>
              </button>`
            : nothing}
        </div>
        <input
          type="range"
          class="stratum-slider"
          min=${min}
          max=${max}
          step=${step}
          .value=${String(current)}
          @input=${(ev: Event) => this._onSliderChange(idx, key, ev)}
        />
      </div>
    `;
  }

  private _renderAnimationRow(
    label: string,
    key: 'animation' | 'icon_animation',
    value: AnimationType | undefined,
    options: Array<{ value: AnimationType; label: string; icon: string }>,
    idx: number,
  ): TemplateResult {
    const current = value ?? 'none';
    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">${label}</label>
        <div class="stratum-chip-row">
          ${options.map(
            (o) => html`<button
              type="button"
              class="stratum-chip anim-chip anim-${o.value} ${current === o.value
                ? 'on'
                : ''}"
              @click=${() => this._onAnimationChip(idx, key, o.value)}
            >
              <ha-icon .icon=${o.icon}></ha-icon>
              <span>${o.label}</span>
            </button>`,
          )}
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
    if (cond.icon) stylePieces.push(`ikona`);
    if (cond.icon_color) stylePieces.push(`kolor ikony`);
    if (cond.text_color) stylePieces.push(`tekst: ${cond.text_color}`);
    if (cond.animation) stylePieces.push(`anim: ${cond.animation}`);
    if (cond.icon_animation) stylePieces.push(`anim ikony: ${cond.icon_animation}`);
    if (typeof cond.opacity === 'number') stylePieces.push(`op: ${cond.opacity}`);
    if (cond.pulse) stylePieces.push('pulse');
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
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .stratum-icon-btn.danger:hover {
        color: var(--error-color, #e53935);
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 18px 0 10px;
        padding-top: 12px;
        border-top: 1px dashed var(--divider-color);
        font-size: 11px;
        font-weight: 700;
        color: var(--primary-color, #ff9b42);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .section-header ha-icon {
        --mdc-icon-size: 16px;
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

      .clear-mini {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;
        width: 18px;
        height: 18px;
        border: 0;
        border-radius: 50%;
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
        color: var(--secondary-text-color);
        cursor: pointer;
        padding: 0;
      }
      .clear-mini ha-icon {
        --mdc-icon-size: 12px;
      }

      .action-row {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .preset-btn {
        flex: 0 0 auto;
        width: auto;
        padding: 10px 14px;
      }

      .preset-btn.open {
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 6%, transparent);
      }

      .presets-grid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 8px;
      }

      .preset-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        cursor: pointer;
        text-align: left;
        transition: border-color 0.12s ease, background 0.12s ease, transform 0.08s ease;
      }

      .preset-card:hover {
        border-color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 6%, transparent);
      }

      .preset-card:active {
        transform: scale(0.98);
      }

      .preset-avatar {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 18%, transparent);
        color: var(--primary-color, #ff9b42);
        flex-shrink: 0;
      }

      .preset-avatar ha-icon {
        --mdc-icon-size: 18px;
      }

      .preset-body {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .preset-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .preset-hint {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Subtelna ilustracja animacji na chipach (tylko gdy nie "none"/"on") */
      .anim-chip ha-icon {
        transition: transform 0.2s ease;
      }
      .anim-chip.anim-pulse.on ha-icon {
        animation: hint-pulse 1.4s ease-in-out infinite;
      }
      .anim-chip.anim-spin.on ha-icon {
        animation: hint-spin 2s linear infinite;
      }
      .anim-chip.anim-shake.on ha-icon {
        animation: hint-shake 0.6s ease-in-out infinite;
      }
      @keyframes hint-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }
      @keyframes hint-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes hint-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .anim-chip.on ha-icon { animation: none; }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-conditions-editor': StratumConditionsEditor;
  }
}
