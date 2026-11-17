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
import { ENTITY_UI_ACTIONS, ROW_UI_ACTIONS } from './tap-action.js';
import { DEFAULT_CHIPS } from './chip-defaults.js';
import {
  LAST_CHANGED_CHIP_TYPES,
  SENSOR_CHIP_TYPES,
  chipFromForm,
} from './chip-editor-ops.js';
import { removeAt, restoreRemoved } from './editor-list-ops.js';
import { EditorUndoController, renderUndoBar } from './editor-undo.js';
import { lookup } from './localize/localize.js';
import { editorMessages, localizeUi, type UiKey } from './localize/editor-localize.js';

interface ChipQuickPick {
  type: ChipConfig['type'];
  /** Klucz słownika (src/localize/). */
  label: UiKey;
  icon: string;
  /** Subtype tylko dla built-in. */
  builtin?: BuiltInChipType;
}

const QUICK_PICKS: ChipQuickPick[] = [
  { type: 'lights', label: 'editor.chips.picks.lights', icon: 'mdi:lightbulb-on', builtin: 'lights' },
  { type: 'motion', label: 'editor.chips.picks.motion', icon: 'mdi:motion-sensor', builtin: 'motion' },
  { type: 'occupancy', label: 'editor.chips.picks.occupancy', icon: 'mdi:account-check', builtin: 'occupancy' },
  { type: 'windows', label: 'editor.chips.picks.windows', icon: 'mdi:window-open-variant', builtin: 'windows' },
  { type: 'doors', label: 'editor.chips.picks.doors', icon: 'mdi:door-open', builtin: 'doors' },
  { type: 'leak', label: 'editor.chips.picks.leak', icon: 'mdi:water-alert', builtin: 'leak' },
  { type: 'smoke', label: 'editor.chips.picks.smoke', icon: 'mdi:smoke-detector-variant', builtin: 'smoke' },
  { type: 'gas', label: 'editor.chips.picks.gas', icon: 'mdi:gas-cylinder', builtin: 'gas' },
  { type: 'co', label: 'editor.chips.picks.co', icon: 'mdi:molecule-co', builtin: 'co' },
  { type: 'problem', label: 'editor.chips.picks.problem', icon: 'mdi:alert-circle-outline', builtin: 'problem' },
  { type: 'battery_low', label: 'editor.chips.picks.battery_low', icon: 'mdi:battery-alert-variant-outline', builtin: 'battery_low' },
  { type: 'temperature', label: 'editor.chips.picks.temperature', icon: 'mdi:thermometer', builtin: 'temperature' },
  { type: 'humidity', label: 'editor.chips.picks.humidity', icon: 'mdi:water-percent', builtin: 'humidity' },
  { type: 'entity', label: 'editor.chips.picks.entity', icon: 'mdi:pencil-outline' },
  { type: 'filter', label: 'editor.chips.picks.filter', icon: 'mdi:filter-variant' },
  { type: 'template', label: 'editor.chips.picks.template', icon: 'mdi:code-braces' },
];

// Tytuły wierszy chipów: grupa `editor.chips.types` słownika.

const CHIP_ICONS: Record<string, string> = {
  lights: 'mdi:lightbulb-on',
  motion: 'mdi:motion-sensor',
  occupancy: 'mdi:account-check',
  windows: 'mdi:window-open-variant',
  doors: 'mdi:door-open',
  leak: 'mdi:water-alert',
  smoke: 'mdi:smoke-detector-variant',
  gas: 'mdi:gas-cylinder',
  co: 'mdi:molecule-co',
  problem: 'mdi:alert-circle-outline',
  battery_low: 'mdi:battery-alert-variant-outline',
  temperature: 'mdi:thermometer',
  humidity: 'mdi:water-percent',
  entity: 'mdi:label-outline',
  filter: 'mdi:filter-variant',
  template: 'mdi:code-braces',
};

@customElement('stratum-chips-editor')
export class StratumChipsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public chips: ChipConfig[] = [];

  /**
   * Zestaw, który karta NAPRAWDĘ pokaże przy pustym `chips` — podgląd
   * w edytorze i baza pierwszej edycji. Belka piętra: `DEFAULT_CHIPS`;
   * popup pokoju podaje swoje `autoRoomChips` (obecność jako „x min temu",
   * temperatura/wilgotność). Wspólny podgląd dla obu sprawiał, że pierwszy
   * dodany w popupie chip kasował mu temperaturę i wilgotność.
   */
  @property({ attribute: false }) public defaults: ChipConfig[] = DEFAULT_CHIPS;

  @state() private _openRow = -1;
  @state() private _showAddMenu = false;

  private _undo = new EditorUndoController(this);

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
    // Kopie obiektów — zmaterializowany default nie może dzielić
    // referencji ze stałą DEFAULT_CHIPS.
    return this.defaults.map((c) => ({ ...c }));
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
      // Alarmowe typy domyślnie ukryte gdy wartość 0 — pokazują się tylko
      // gdy coś się dzieje. Lights/motion widoczne zawsze.
      const alarmTypes: Array<typeof pick.builtin> = [
        'windows',
        'doors',
        'leak',
        'smoke',
        'gas',
        'co',
        'problem',
        'battery_low',
      ];
      if (alarmTypes.includes(pick.builtin)) {
        return { type: pick.builtin, show_when_zero: false };
      }
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
    const before = [...(this.chips ?? [])];
    const { next, removed } = removeAt(this._effective(), index);
    if (!removed) return;
    this._emit(next);
    const prevOpen = this._openRow;
    if (this._openRow === index) this._openRow = -1;
    else if (this._openRow > index) this._openRow -= 1;
    // Usunięcie dalej jest natychmiastowe, ale odwracalne — dlaczego nie
    // dialog potwierdzenia: patrz editor-undo.ts.
    this._undo.offer(this._chipLabel(removed.type), () => {
      // Usunięcie ostatniego chipa daje [], a rodzic kasuje wtedy klucz —
      // _effective() pokazuje domyślny zestaw. To nadal „nic się nie
      // zmieniło", więc wracamy dokładnie do `before`, a nie wklejamy
      // chipa do całego zestawu domyślnego.
      const raw = this.chips ?? [];
      const current = raw.length === 0 && next.length === 0 ? next : this._effective();
      const restored = restoreRemoved(current, next, before, index, removed);
      this._emit(restored);
      // Dokładny powrót = ten sam wiersz rozwinięty co przed usunięciem;
      // inaczej zwijamy, żeby nie otworzyć formularza innego chipa.
      this._openRow = JSON.stringify(restored) === JSON.stringify(before) ? prevOpen : -1;
    });
  }

  private _move(index: number, delta: -1 | 1): void {
    const base = this._effective();
    const target = index + delta;
    if (target < 0 || target >= base.length) return;
    const next = [...base];
    [next[index], next[target]] = [next[target]!, next[index]!];
    // Rozwinięty formularz jedzie razem ze swoim chipem.
    if (this._openRow === index) this._openRow = target;
    else if (this._openRow === target) this._openRow = index;
    this._emit(next);
  }

  private _toggleOpen(index: number): void {
    this._openRow = this._openRow === index ? -1 : index;
  }

  private _onChange(index: number, ev: CustomEvent<{ value: Partial<ChipConfig> }>): void {
    ev.stopPropagation();
    const base = this._effective();
    const existing = base[index];
    if (!existing) return;
    // Reguły „puste pole = usuń klucz" i defaultów toggle'i siedzą
    // w chipFromForm (testy: tests/chip-editor-ops.test.ts).
    const value = (ev.detail.value ?? {}) as Record<string, unknown>;
    this._emit(base.map((c, i) => (i === index ? chipFromForm(existing, value) : c)));
  }

  /** Dane dla ha-form — wypełnia defaulty żeby toggle odzwierciedlał realny stan. */
  private _formDataFor(chip: ChipConfig): Record<string, unknown> {
    const listSupported = chip.type !== 'entity' && chip.type !== 'template';
    return {
      // show_when_zero domyślnie ON — chipy widoczne nawet gdy wartość 0.
      // User wyłącza aby chip znikał gdy nic się nie dzieje (np. alarm-only).
      show_when_zero: chip.show_when_zero !== false,
      // show_list domyślnie ON dla typów wspierających listę.
      ...(listSupported ? { show_list: chip.show_list !== false } : {}),
      ...chip,
    };
  }

  private _schemaFor(chip: ChipConfig) {
    const listSupported =
      chip.type !== 'entity' && chip.type !== 'template';
    // `more-info` / `toggle` tylko gdy chip ma encję (chip encji albo
    // temperatura/wilgotność z jawnym sensorem) — chip licznika nie ma
    // czego otworzyć. `assist` pomijamy zawsze: karta go nie obsługuje.
    const hasEntity =
      chip.type === 'entity' || Boolean((chip as { entity?: string }).entity);
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
      // „x min temu" zamiast licznika — popup pokoju ma to domyślnie dla
      // obecności; bez przełącznika nie dało się tego ani zobaczyć, ani
      // przywrócić po edycji.
      ...(LAST_CHANGED_CHIP_TYPES.has(chip.type)
        ? [{ name: 'show_last_changed', selector: { boolean: {} } }]
        : []),
      ...(listSupported ? [{ name: 'show_list', selector: { boolean: {} } }] : []),
      {
        name: 'tap_action',
        selector: { ui_action: { actions: hasEntity ? ENTITY_UI_ACTIONS : ROW_UI_ACTIONS } },
      },
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
    if (SENSOR_CHIP_TYPES.has(chip.type)) {
      // Jawny sensor (`entity`) — typ go wspierał, ale bez pola w UI
      // dało się go ustawić tylko w YAML-u.
      return [
        {
          name: 'entity',
          selector: {
            entity: { filter: [{ domain: 'sensor', device_class: chip.type }] },
          },
        },
        ...common,
      ];
    }
    // built-in
    return common;
  }

  private _t(key: UiKey, vars?: Record<string, string | number>): string {
    return localizeUi(this.hass, key, vars);
  }

  private _chipLabel(type: string): string {
    return lookup(editorMessages(this.hass).chips.types, type) ?? type;
  }

  private _labelFor = (
    schema: { name: string },
    data?: { type?: ChipConfig['type'] },
  ): string => {
    if (schema.name === 'entity' && data?.type && SENSOR_CHIP_TYPES.has(data.type)) {
      return this._t('editor.chips.sensor_entity');
    }
    return lookup(editorMessages(this.hass).chips.labels, schema.name) ?? schema.name;
  };

  protected render(): TemplateResult {
    const effective = this._effective();
    const showingDefaults = this._isShowingDefaults;
    return html`
      ${showingDefaults
        ? html`<div class="defaults-hint">
            <ha-icon .icon=${'mdi:information-outline'} aria-hidden="true"></ha-icon>
            <span>
              ${this._t('editor.chips.defaults_hint_1')}
              <strong>${this._t('editor.chips.defaults_hint_add')}</strong>
              ${this._t('editor.chips.defaults_hint_2')}
            </span>
          </div>`
        : nothing}

      <div class="stratum-list">${effective.map((c, i) => this._renderChipRow(c, i, effective.length))}</div>

      ${renderUndoBar(this._undo, this.hass)}

      ${this._showAddMenu
        ? html`<div class="add-menu">
            ${QUICK_PICKS.map(
              (p) => html`<button
                type="button"
                class="add-menu-item"
                @click=${() => this._add(p)}
              >
                <ha-icon .icon=${p.icon} aria-hidden="true"></ha-icon>
                <span>${this._t(p.label)}</span>
              </button>`,
            )}
            <button
              type="button"
              class="add-menu-close"
              @click=${() => (this._showAddMenu = false)}
            >
              <ha-icon .icon=${'mdi:close'} aria-hidden="true"></ha-icon>
              ${this._t('editor.chips.cancel')}
            </button>
          </div>`
        : html`<button
            type="button"
            class="stratum-add-btn"
            @click=${() => (this._showAddMenu = true)}
          >
            <ha-icon .icon=${'mdi:plus-circle-outline'} aria-hidden="true"></ha-icon>
            ${this._t('editor.chips.add')}
          </button>`}

      ${!showingDefaults
        ? html`<button
            type="button"
            class="reset-btn"
            @click=${() => this._emit([])}
            title=${this._t('editor.chips.reset_title')}
          >
            <ha-icon .icon=${'mdi:restore'} aria-hidden="true"></ha-icon>
            ${this._t('editor.chips.reset')}
          </button>`
        : nothing}
    `;
  }

  private _renderChipRow(chip: ChipConfig, idx: number, total: number): TemplateResult {
    const isOpen = this._openRow === idx;
    const label = this._chipLabel(chip.type);
    const icon = chip.icon ?? CHIP_ICONS[chip.type] ?? 'mdi:label-outline';
    const summary =
      chip.type === 'entity'
        ? (chip as { entity?: string }).entity || '—'
        : chip.type === 'filter'
        ? `${(chip as { domain?: string }).domain ?? '*'}${
            (chip as { device_class?: string }).device_class
              ? ` / ${(chip as { device_class?: string }).device_class}`
              : ''
          }`
        : chip.type === 'template'
        ? 'Jinja2'
        : this._t('editor.chips.builtin');
    const subId = `chip-sub-${idx}`;
    // Nagłówek wiersza to prawdziwy <button> (klawiatura, czytnik ekranu,
    // aria-expanded) zamiast klikalnego diva — i dlatego osobny ołówek
    // „Edytuj" zniknął z akcji: mniej ikon obok kosza = mniej chybień.
    return html`
      <div class="stratum-row">
        <div class="stratum-row-head">
          <button
            type="button"
            class="stratum-row-toggle"
            aria-expanded=${isOpen ? 'true' : 'false'}
            aria-controls=${subId}
            @click=${() => this._toggleOpen(idx)}
          >
            <span class="stratum-row-avatar">
              <ha-icon .icon=${icon} aria-hidden="true"></ha-icon>
            </span>
            <span class="chip-summary">
              <span class="stratum-row-title">${label}</span>
              <span class="chip-sub">${summary}</span>
            </span>
            <ha-icon
              class="stratum-row-chevron"
              .icon=${isOpen ? 'mdi:chevron-up' : 'mdi:pencil-outline'}
              aria-hidden="true"
            ></ha-icon>
          </button>
          <div class="stratum-row-actions">
            <button
              type="button"
              class="stratum-icon-btn"
              title=${this._t('editor.chips.up')}
              aria-label=${this._t('editor.chips.up_named', { label })}
              ?disabled=${idx === 0}
              @click=${() => this._move(idx, -1)}
            >
              <ha-icon .icon=${'mdi:chevron-up'} aria-hidden="true"></ha-icon>
            </button>
            <button
              type="button"
              class="stratum-icon-btn"
              title=${this._t('editor.chips.down')}
              aria-label=${this._t('editor.chips.down_named', { label })}
              ?disabled=${idx >= total - 1}
              @click=${() => this._move(idx, 1)}
            >
              <ha-icon .icon=${'mdi:chevron-down'} aria-hidden="true"></ha-icon>
            </button>
            <button
              type="button"
              class="stratum-icon-btn danger"
              title=${this._t('editor.common.remove')}
              aria-label=${this._t('editor.chips.remove_named', { label })}
              @click=${() => this._remove(idx)}
            >
              <ha-icon .icon=${'mdi:delete-outline'} aria-hidden="true"></ha-icon>
            </button>
          </div>
        </div>
        ${isOpen
          ? html`<div class="stratum-row-sub" id=${subId}>
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
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .add-menu {
        margin-top: 10px;
        padding: 10px;
        border: 1.5px dashed var(--primary-color);
        border-radius: 10px;
        background: color-mix(in srgb, var(--primary-color) 5%, transparent);
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .add-menu-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 40px;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease,
          transform 0.1s ease;
      }

      .add-menu-item ha-icon {
        --mdc-icon-size: 14px;
      }

      .add-menu-item:hover {
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .add-menu-close {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
        min-height: 40px;
        padding: 6px 12px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s ease, transform 0.1s ease;
      }

      .add-menu-close:hover {
        background: var(--secondary-background-color);
      }

      .add-menu-item:active,
      .add-menu-close:active,
      .reset-btn:active {
        transform: scale(0.97);
      }

      .add-menu-item:focus-visible,
      .add-menu-close:focus-visible,
      .reset-btn:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      .defaults-hint {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        margin-bottom: 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
        color: var(--primary-text-color);
        font-size: 12px;
        line-height: 1.5;
      }

      .defaults-hint ha-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
        flex-shrink: 0;
      }

      .reset-btn {
        margin-top: 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 6px 14px;
        border: 1px solid var(--divider-color);
        background: transparent;
        color: var(--secondary-text-color);
        border-radius: 999px;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s, transform 0.1s ease;
      }

      .reset-btn:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .reset-btn ha-icon {
        --mdc-icon-size: 16px;
      }

      @media (prefers-reduced-motion: reduce) {
        .add-menu-item,
        .add-menu-close,
        .reset-btn {
          transition: none;
        }
        .add-menu-item:active,
        .add-menu-close:active,
        .reset-btn:active {
          transform: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-chips-editor': StratumChipsEditor;
  }
}
