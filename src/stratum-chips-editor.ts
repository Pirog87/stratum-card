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
  { type: 'leak', label: 'Wycieki', icon: 'mdi:water-alert', builtin: 'leak' },
  { type: 'entity', label: 'Encja', icon: 'mdi:pencil-outline' },
  { type: 'filter', label: 'Filtr', icon: 'mdi:filter-variant' },
  { type: 'template', label: 'Template', icon: 'mdi:code-braces' },
];

/**
 * Domyślny set chipów gdy user nic nie skonfigurował — lustrzane odbicie
 * `DEFAULT_CHIPS` z `chip-defaults.ts`. Pokazujemy je w edytorze żeby user
 * widział co jest i mógł dostosować bez szukania w runtime.
 */
const DEFAULT_CHIPS_PREVIEW: ChipConfig[] = [
  { type: 'lights' },
  { type: 'motion' },
  { type: 'windows' },
  { type: 'doors' },
];

const CHIP_LABELS: Record<string, string> = {
  lights: 'Światła',
  motion: 'Obecność (motion)',
  occupancy: 'Zajętość (occupancy)',
  windows: 'Okna',
  doors: 'Drzwi',
  leak: 'Wycieki (moisture)',
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
  leak: 'mdi:water-alert',
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

  /** Zwraca effective chips — rzeczywiste albo domyślne gdy user nic nie ustawił. */
  private _effective(): ChipConfig[] {
    if (this.chips && this.chips.length > 0) return [...this.chips];
    return [...DEFAULT_CHIPS_PREVIEW];
  }

  private get _isShowingDefaults(): boolean {
    return !this.chips || this.chips.length === 0;
  }

  private _add(pick: ChipQuickPick): void {
    const chip = this._makeChip(pick);
    const base = this._effective();
    const next = [...base, chip];
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
    const base = this._effective();
    this._emit(base.filter((_, i) => i !== index));
    if (this._openRow === index) this._openRow = -1;
  }

  private _move(index: number, delta: -1 | 1): void {
    const base = this._effective();
    const target = index + delta;
    if (target < 0 || target >= base.length) return;
    const next = [...base];
    [next[index], next[target]] = [next[target]!, next[index]!];
    this._emit(next);
  }

  private _toggleOpen(index: number): void {
    this._openRow = this._openRow === index ? -1 : index;
  }

  private _patch(index: number, patch: Partial<ChipConfig>): void {
    const base = this._effective();
    const next = base.map((c, i) => {
      if (i !== index) return c;
      const merged = { ...c, ...patch } as Record<string, unknown>;
      // Klucze z wartością undefined usuwamy z obiektu (YAML-friendly).
      for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) delete merged[key];
      }
      return merged as unknown as ChipConfig;
    });
    this._emit(next);
  }

  private _onChange(index: number, ev: CustomEvent<{ value: Partial<ChipConfig> }>): void {
    ev.stopPropagation();
    const value = ev.detail.value ?? {};
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === '' || v == null) continue;
      // `show_list: true` to default — nie zapisujemy do YAML, zostaje niepotrzebny szum.
      if (k === 'show_list' && v === true) continue;
      cleaned[k] = v;
    }
    // Kasujemy pola które były ustawione a teraz nie są w value (user cofnął).
    // Szczególnie: show_list true domyślnie → gdy user wyłączy, value ma show_list:false
    // → zapiszemy false. Gdy z powrotem włączy, value ma show_list:true → pomijamy, trzeba usunąć istniejące.
    const existing = this.chips[index];
    if (existing && 'show_list' in existing && value.show_list !== false) {
      // explicitnie usuń — trafi do _patch jako undefined (spread go skasuje).
      (cleaned as { show_list?: undefined }).show_list = undefined;
    }
    this._patch(index, cleaned as Partial<ChipConfig>);
  }

  /** Dane dla ha-form — wypełnia defaulty żeby toggle odzwierciedlał realny stan. */
  private _formDataFor(chip: ChipConfig): Record<string, unknown> {
    const listSupported = chip.type !== 'entity' && chip.type !== 'template';
    return {
      // show_list domyślnie ON dla typów wspierających listę.
      ...(listSupported ? { show_list: chip.show_list !== false } : {}),
      ...chip,
    };
  }

  private _schemaFor(chip: ChipConfig) {
    const listSupported =
      chip.type !== 'entity' && chip.type !== 'template';
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
      ...(listSupported ? [{ name: 'show_list', selector: { boolean: {} } }] : []),
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
      show_list: 'Popup z listą po kliknięciu (default ON)',
      tap_action: 'Akcja po kliknięciu (nadpisuje listę)',
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
    const effective = this._effective();
    const showingDefaults = this._isShowingDefaults;
    return html`
      ${showingDefaults
        ? html`<div class="defaults-hint">
            <ha-icon .icon=${'mdi:information-outline'}></ha-icon>
            <span>
              Pokazujemy domyślny zestaw. Kliknij <strong>Edytuj</strong>,
              <strong>Usuń</strong> albo <strong>Dodaj chip</strong> żeby
              dostosować — po pierwszej zmianie konfiguracja się
              „materializuje" i zapisze do YAML-a.
            </span>
          </div>`
        : nothing}

      <div class="stratum-list">${effective.map((c, i) => this._renderChipRow(c, i))}</div>

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

      ${!showingDefaults
        ? html`<button
            type="button"
            class="reset-btn"
            @click=${() => this._emit([])}
            title="Przywróć domyślny zestaw"
          >
            <ha-icon .icon=${'mdi:restore'}></ha-icon>
            Przywróć domyślne
          </button>`
        : nothing}
    `;
  }

  private _renderChipRow(chip: ChipConfig, idx: number): TemplateResult {
    const isOpen = this._openRow === idx;
    const total = this._effective().length;
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
              ?disabled=${idx >= total - 1}
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
                .data=${this._formDataFor(chip)}
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

      .defaults-hint {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        margin-bottom: 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--primary-color, #ff9b42) 30%, transparent);
        color: var(--primary-text-color);
        font-size: 12px;
        line-height: 1.5;
      }

      .defaults-hint ha-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color, #ff9b42);
        flex-shrink: 0;
      }

      .reset-btn {
        margin-top: 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: 1px solid var(--divider-color);
        background: transparent;
        color: var(--secondary-text-color);
        border-radius: 999px;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }

      .reset-btn:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .reset-btn ha-icon {
        --mdc-icon-size: 16px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-chips-editor': StratumChipsEditor;
  }
}
