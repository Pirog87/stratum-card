// Edytor listy reguł warunkowego stylu (`display_config.conditions`).
//
// Każda reguła = pole + operator + opcjonalna wartość + overrides (border
// color/width, accent color, background color). Kolejność w tablicy znaczy:
// pierwsza pasująca reguła wygrywa.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type {
  DisplayConditionConfig,
  DisplayConditionOp,
  HomeAssistant,
  TileField,
} from './types.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const FIELD_LABELS: Record<TileField, string> = {
  temperature: 'Temperatura',
  humidity: 'Wilgotność',
  lights: 'Światła',
  motion: 'Obecność (motion)',
  windows: 'Okna',
  doors: 'Drzwi',
};

const OP_LABELS: Record<DisplayConditionOp, string> = {
  any_on: 'Dowolna encja aktywna',
  none_on: 'Żadna encja aktywna',
  count_gt: 'Liczba aktywnych > …',
  gt: 'Wartość > …',
  lt: 'Wartość < …',
  eq: 'Wartość = …',
};

// Operatory dostępne per pole.
const BINARY_FIELDS: TileField[] = ['lights', 'motion', 'windows', 'doors'];

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

@customElement('stratum-conditions-editor')
export class StratumConditionsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public conditions: DisplayConditionConfig[] = [];

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
    const next = [
      ...this.conditions,
      {
        field: 'lights',
        when: 'any_on',
        accent_color: 'amber',
      } as DisplayConditionConfig,
    ];
    this._emit(next);
  }

  private _remove(index: number): void {
    const next = this.conditions.filter((_, i) => i !== index);
    this._emit(next);
  }

  private _move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.conditions.length) return;
    const next = [...this.conditions];
    [next[index], next[target]] = [next[target]!, next[index]!];
    this._emit(next);
  }

  private _update(index: number, patch: Partial<DisplayConditionConfig>): void {
    const next = this.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    // Jeśli field zmienił się na coś, co nie wspiera obecnego `when` —
    // resetuj when do pierwszego dostępnego.
    const updated = next[index]!;
    const allowedOps = opsFor(updated.field);
    if (!allowedOps.includes(updated.when)) {
      updated.when = allowedOps[0]!;
    }
    // Usuń `value` jeśli operator go nie potrzebuje.
    if (!needsValue(updated.when)) {
      delete updated.value;
    }
    this._emit(next);
  }

  private _schemaFor(cond: DisplayConditionConfig) {
    const allowedOps = opsFor(cond.field);
    const baseSchema: Array<Record<string, unknown>> = [
      {
        type: 'grid',
        name: '',
        schema: [
          {
            name: 'field',
            selector: {
              select: {
                mode: 'dropdown',
                options: (Object.keys(FIELD_LABELS) as TileField[]).map((f) => ({
                  value: f,
                  label: FIELD_LABELS[f],
                })),
              },
            },
          },
          {
            name: 'when',
            selector: {
              select: {
                mode: 'dropdown',
                options: allowedOps.map((op) => ({ value: op, label: OP_LABELS[op] })),
              },
            },
          },
        ],
      },
    ];
    if (needsValue(cond.when)) {
      baseSchema.push({
        name: 'value',
        selector: { number: { step: 0.5, mode: 'box' } },
      });
    }
    baseSchema.push({
      type: 'grid',
      name: '',
      schema: [
        { name: 'accent_color', selector: { text: {} } },
        { name: 'border_color', selector: { text: {} } },
      ],
    });
    baseSchema.push({
      type: 'grid',
      name: '',
      schema: [
        {
          name: 'border_width',
          selector: {
            number: { min: 0, max: 8, step: 1, unit_of_measurement: 'px', mode: 'slider' },
          },
        },
        { name: 'background_color', selector: { text: {} } },
      ],
    });
    return baseSchema;
  }

  private _labelFor = (schema: { name: string }): string => {
    const map: Record<string, string> = {
      field: 'Pole',
      when: 'Warunek',
      value: 'Wartość',
      accent_color: 'Kolor akcentu',
      border_color: 'Kolor borderu',
      border_width: 'Grubość borderu',
      background_color: 'Kolor tła',
    };
    return map[schema.name] ?? schema.name;
  };

  protected render(): TemplateResult {
    return html`
      ${this.conditions.length === 0
        ? html`<div class="stratum-empty">
            Brak reguł. Dodaj pierwszą aby np. ustawić czerwony border gdy okno
            otwarte albo zielony akcent przy motion.
          </div>`
        : nothing}

      <div class="stratum-list">
        ${this.conditions.map((cond, idx) => {
          const isBinary = BINARY_FIELDS.includes(cond.field);
          const summary = this._summarize(cond);
          return html`
            <div class="stratum-row stratum-condition-row active">
              <div class="stratum-row-head">
                <span class="stratum-row-avatar">
                  <ha-icon
                    .icon=${isBinary ? 'mdi:toggle-switch-outline' : 'mdi:gauge'}
                  ></ha-icon>
                </span>
                <div class="stratum-condition-summary">
                  <span class="stratum-row-title">${summary.title}</span>
                  ${summary.hint
                    ? html`<span class="stratum-condition-hint">${summary.hint}</span>`
                    : nothing}
                </div>
                <div class="stratum-row-actions">
                  <button
                    type="button"
                    class="stratum-icon-btn"
                    title="W górę"
                    ?disabled=${idx === 0}
                    @click=${() => this._move(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                  </button>
                  <button
                    type="button"
                    class="stratum-icon-btn"
                    title="W dół"
                    ?disabled=${idx >= this.conditions.length - 1}
                    @click=${() => this._move(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
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
              <div class="stratum-row-sub">
                <ha-form
                  .hass=${this.hass}
                  .data=${cond}
                  .schema=${this._schemaFor(cond)}
                  .computeLabel=${this._labelFor}
                  @value-changed=${(ev: CustomEvent<{ value: DisplayConditionConfig }>) => {
                    ev.stopPropagation();
                    this._update(idx, ev.detail.value);
                  }}
                ></ha-form>
              </div>
            </div>
          `;
        })}
      </div>

      <button type="button" class="stratum-add-btn" @click=${this._add}>
        <ha-icon .icon=${'mdi:plus-circle-outline'}></ha-icon>
        Dodaj regułę
      </button>
    `;
  }

  private _summarize(cond: DisplayConditionConfig): { title: string; hint: string } {
    const fieldLabel = FIELD_LABELS[cond.field];
    const opLabel = OP_LABELS[cond.when];
    const valuePart = needsValue(cond.when) && typeof cond.value === 'number'
      ? ` ${cond.value}`
      : '';
    const stylePieces: string[] = [];
    if (cond.accent_color) stylePieces.push(`akcent: ${cond.accent_color}`);
    if (cond.border_color) stylePieces.push(`border: ${cond.border_color}`);
    if (cond.background_color) stylePieces.push(`tło: ${cond.background_color}`);
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-conditions-editor': StratumConditionsEditor;
  }
}
