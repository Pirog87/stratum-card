// Edytor listy chipów w belce nagłówka (`chips`).
//
// Chipy mogą być 4 typów: built-in (lights/motion/windows/doors), entity,
// filter, template. Każdy ma type-specific formularz + wspólne pola
// (icon, color, show_when_zero, tap_action). Lista z add/remove/reorder.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  BuiltInChipType,
  ChipConfig,
  HomeAssistant,
} from './types.js';
import { editorSharedStyles } from './editor-shared-styles.js';

interface ChipQuickPick {
  type: ChipConfig['type'];
  label: string;
  icon: string;
  /** Subtype tylko dla built-in. */
  builtin?: BuiltInChipType;
}

const QUICK_PICKS: ChipQuickPick[] = [
  { type: 'lights', label: 'Światła', icon: 'mdi:lightbulb-on', builtin: 'lights' },
  { type: 'motion', label: 'Obecność', icon: 'mdi:motion-sensor', builtin: 'motion' },
  { type: 'occupancy', label: 'Zajętość', icon: 'mdi:account-check', builtin: 'occupancy' },
  { type: 'windows', label: 'Okna', icon: 'mdi:window-open-variant', builtin: 'windows' },
  { type: 'doors', label: 'Drzwi', icon: 'mdi:door-open', builtin: 'doors' },
  { type: 'entity', label: 'Encja', icon: 'mdi:pencil-outline' },
  { type: 'filter', label: 'Filtr', icon: 'mdi:filter-variant' },
  { type: 'template', label: 'Template', icon: 'mdi:code-braces' },
];

const CHIP_LABELS: Record<string, string> = {
  lights: 'Światła',
  motion: 'Obecność (motion)',
  occupancy: 'Zajętość (occupancy)',
  windows: 'Okna',
  doors: 'Drzwi',
  entity: 'Encja',
  filter: 'Filtr',
  template: 'Template',
};

const CHIP_ICONS: Record<string, string> = {
  lights: 'mdi:lightbulb-on',
  motion: 'mdi:motion-sensor',
  occupancy: 'mdi:account-check',
  windows: 'mdi:window-open-variant',
  doors: 'mdi:door-open',
  entity: 'mdi:label-outline',
  filter: 'mdi:filter-variant',
  template: 'mdi:code-braces',
};

@customElement('stratum-chips-editor')
export class StratumChipsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public chips: ChipConfig[] = [];

  @state() private _openRow = -1;
  @state() private _showAddMenu = false;

  private _emit(next: ChipConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('chips-changed', {
        detail: { chips: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _add(pick: ChipQuickPick): void {
    const chip = this._makeChip(pick);
    const next = [...this.chips, chip];
    this._openRow = next.length - 1;
    this._showAddMenu = false;
    this._emit(next);
  }

  private _makeChip(pick: ChipQuickPick): ChipConfig {
    if (pick.builtin) {
      return { type: pick.builtin };
    }
    if (pick.type === 'entity') {
      return { type: 'entity', entity: '' };
    }
    if (pick.type === 'filter') {
      return { type: 'filter', domain: 'light' };
    }
    return { type: 'template', value: "{{ states('sensor.example') }}" };
  }

  private _remove(index: number): void {
    this._emit(this.chips.filter((_, i) => i !== index));
    if (this._openRow === index) this._openRow = -1;
  }

  private _move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.chips.length) return;
    const next = [...this.chips];
    [next[index], next[target]] = [next[target]!, next[index]!];
    this._emit(next);
  }

  private _toggleOpen(index: number): void {
    this._openRow = this._openRow === index ? -1 : index;
  }

  private _patch(index: number, patch: Partial<ChipConfig>): void {
    const next = this.chips.map((c, i) => {
      if (i !== index) return c;
      return { ...c, ...patch } as ChipConfig;
    });
    this._emit(next);
  }

  private _onChange(index: number, ev: CustomEvent<{ value: Partial<ChipConfig> }>): void {
    ev.stopPropagation();
    const value = ev.detail.value ?? {};
    // ha-form wrzuca puste stringi — wyczyszczamy je żeby nie zapisywać śmieci.
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === '' || v == null) continue;
      cleaned[k] = v;
    }
    this._patch(index, cleaned as Partial<ChipConfig>);
  }

  private _schemaFor(chip: ChipConfig) {
    const common = [
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'icon', selector: { icon: {} } },
          { name: 'color', selector: { text: {} } },
        ],
      },
      { name: 'show_when_zero', selector: { boolean: {} } },
      { name: 'tap_action', selector: { ui_action: {} } },
    ];
    if (chip.type === 'entity') {
      return [
        { name: 'entity', selector: { entity: {} } },
        {
          type: 'grid',
          name: '',
          schema: [
            {
              name: 'format',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: [
                    { value: 'state', label: 'state' },
                    { value: 'attribute', label: 'attribute' },
                  ],
                },
              },
            },
            { name: 'attribute', selector: { text: {} } },
          ],
        },
        { name: 'suffix', selector: { text: {} } },
        ...common,
      ];
    }
    if (chip.type === 'filter') {
      return [
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'domain', selector: { text: {} } },
            { name: 'device_class', selector: { text: {} } },
          ],
        },
        { name: 'state', selector: { text: {} } },
        ...common,
      ];
    }
    if (chip.type === 'template') {
      return [
        { name: 'value', selector: { template: {} } },
        { name: 'active_template', selector: { template: {} } },
        ...common,
      ];
    }
    // built-in
    return common;
  }

  private _labelFor = (schema: { name: string }): string => {
    const map: Record<string, string> = {
      icon: 'Ikona (override)',
      color: 'Kolor',
      show_when_zero: 'Pokazuj też gdy wartość 0',
      tap_action: 'Akcja po kliknięciu',
      entity: 'Encja',
      format: 'Format',
      attribute: 'Atrybut',
      suffix: 'Sufiks (np. °C)',
      domain: 'Domena (np. light)',
      device_class: 'Device class (np. motion)',
      state: 'Stan aktywny (default "on")',
      value: 'Jinja2 template',
      active_template: 'Template aktywności (zwraca bool)',
    };
    return map[schema.name] ?? schema.name;
  };

  protected render(): TemplateResult {
    return html`
      ${this.chips.length === 0
        ? html`<div class="stratum-empty">
            Brak chipów. Domyślnie pokazywane: Światła, Motion, Okna, Drzwi.
            Dodaj własne żeby nadpisać domyślny set.
          </div>`
        : nothing}

      <div class="stratum-list">${this.chips.map((c, i) => this._renderChipRow(c, i))}</div>

      ${this._showAddMenu
        ? html`<div class="add-menu">
            ${QUICK_PICKS.map(
              (p) => html`<button
                type="button"
                class="add-menu-item"
                @click=${() => this._add(p)}
              >
                <ha-icon .icon=${p.icon}></ha-icon>
                <span>${p.label}</span>
              </button>`,
            )}
            <button
              type="button"
              class="add-menu-close"
              @click=${() => (this._showAddMenu = false)}
            >
              <ha-icon .icon=${'mdi:close'}></ha-icon>
              Anuluj
            </button>
          </div>`
        : html`<button
            type="button"
            class="stratum-add-btn"
            @click=${() => (this._showAddMenu = true)}
          >
            <ha-icon .icon=${'mdi:plus-circle-outline'}></ha-icon>
            Dodaj chip
          </button>`}
    `;
  }

  private _renderChipRow(chip: ChipConfig, idx: number): TemplateResult {
    const isOpen = this._openRow === idx;
    const label = CHIP_LABELS[chip.type] ?? chip.type;
    const icon = chip.icon ?? CHIP_ICONS[chip.type] ?? 'mdi:label-outline';
    const summary =
      chip.type === 'entity'
        ? (chip as { entity?: string }).entity ?? '—'
        : chip.type === 'filter'
        ? `${(chip as { domain?: string }).domain ?? '*'}${
            (chip as { device_class?: string }).device_class
              ? ` / ${(chip as { device_class?: string }).device_class}`
              : ''
          }`
        : chip.type === 'template'
        ? 'Jinja2'
        : 'built-in';
    return html`
      <div class="stratum-row">
        <div class="stratum-row-head" @click=${() => this._toggleOpen(idx)}>
          <span class="stratum-row-avatar">
            <ha-icon .icon=${icon}></ha-icon>
          </span>
          <div class="chip-summary">
            <span class="stratum-row-title">${label}</span>
            <span class="chip-sub">${summary}</span>
          </div>
          <div class="stratum-row-actions" @click=${(e: Event) => e.stopPropagation()}>
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
              ?disabled=${idx >= this.chips.length - 1}
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
        ${isOpen
          ? html`<div class="stratum-row-sub">
              <ha-form
                .hass=${this.hass}
                .data=${chip}
                .schema=${this._schemaFor(chip)}
                .computeLabel=${this._labelFor}
                @value-changed=${(ev: CustomEvent<{ value: Partial<ChipConfig> }>) =>
                  this._onChange(idx, ev)}
              ></ha-form>
            </div>`
          : nothing}
      </div>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .stratum-row-head {
        cursor: pointer;
      }

      .chip-summary {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }

      .chip-sub {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
        font-variant-numeric: tabular-nums;
      }

      .stratum-icon-btn.danger:hover {
        color: var(--error-color, #e53935);
      }

      .add-menu {
        margin-top: 10px;
        padding: 10px;
        border: 1.5px dashed var(--primary-color, #ff9b42);
        border-radius: 10px;
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 5%, transparent);
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }

      .add-menu-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease;
      }

      .add-menu-item ha-icon {
        --mdc-icon-size: 14px;
      }

      .add-menu-item:hover {
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 10%, transparent);
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
      }

      .add-menu-close {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
        padding: 6px 10px;
        border: 0;
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 11px;
        cursor: pointer;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-chips-editor': StratumChipsEditor;
  }
}
