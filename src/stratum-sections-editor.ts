// Editor sekcji w room-card.
//
// Lista sekcji z dodawaniem/usuwaniem/reorder. Per sekcja:
// dropdown typu → dynamiczny sub-form z polami właściwymi typowi (entities,
// mode, columns, icon, title, summary fields).

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  RoomSectionConfig,
  RoomSectionType,
  SummaryField,
} from './types.js';
import { SECTION_LABEL, SECTION_ICON } from './section-defaults.js';
import { getCustomCardOptionsForSection } from './custom-cards.js';
import {
  SECTION_PRESETS,
  CATEGORY_LABELS,
  isCardInstalled,
  type PresetCategory,
  type SectionPreset,
} from './section-presets.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const TYPE_OPTIONS = [
  { value: 'summary', label: 'Podsumowanie' },
  { value: 'scenes', label: 'Sceny' },
  { value: 'lights', label: 'Światła' },
  { value: 'covers', label: 'Rolety' },
  { value: 'windows', label: 'Okna' },
  { value: 'doors', label: 'Drzwi' },
  { value: 'climate', label: 'Klimat' },
  { value: 'media', label: 'Media' },
  { value: 'fans', label: 'Wentylacja' },
  { value: 'switches', label: 'Przełączniki' },
  { value: 'custom', label: 'Karta custom (HA/HACS)' },
];

const SUMMARY_FIELD_OPTIONS = [
  { value: 'motion', label: 'Ruch / obecność' },
  { value: 'temperature', label: 'Temperatura' },
  { value: 'humidity', label: 'Wilgotność' },
  { value: 'lights_on', label: 'Światła włączone' },
  { value: 'windows_open', label: 'Otwarte okna' },
  { value: 'doors_open', label: 'Otwarte drzwi' },
  { value: 'battery_low', label: 'Bateria (ostrzeż)' },
  { value: 'leak', label: 'Wyciek wody' },
];

/** Opcje trybu wyświetlania dostępne per typ sekcji. */
const MODE_OPTIONS_BY_TYPE: Partial<Record<RoomSectionType, Array<{ value: string; label: string }>>> = {
  lights: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'slider', label: 'Slider (brightness)' },
    { value: 'ambient', label: 'Ambient (kolor + jasność w tle)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  covers: [
    { value: 'tile', label: 'Tile (kafel z przyciskami)' },
    { value: 'slider', label: 'Slider (pozycja)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (open/close)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  switches: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  fans: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  media: [
    { value: 'tile', label: 'Tile (play/pause)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (play/pause)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  windows: [
    { value: 'tile', label: 'Tile (kafel ze statusem)' },
    { value: 'chips', label: 'Chips (status readonly)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  doors: [
    { value: 'tile', label: 'Tile (kafel ze statusem)' },
    { value: 'chips', label: 'Chips (status readonly)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  scenes: [
    { value: 'tile', label: 'Tile (przycisk aktywuj)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (przycisk aktywuj)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  summary: [
    { value: 'cards', label: 'Cards (kafle z labelem + value)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
  ],
};

function buildSchema(section: RoomSectionConfig) {
  const entityDomains = entityDomainsForType(section.type);
  const common = [
    {
      name: 'type',
      selector: { select: { mode: 'dropdown', options: TYPE_OPTIONS } },
    },
    {
      type: 'grid',
      name: '',
      schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ],
    },
  ];

  const nativeModeOpts = MODE_OPTIONS_BY_TYPE[section.type];
  const customCardOpts =
    nativeModeOpts && section.type !== 'summary'
      ? getCustomCardOptionsForSection(section.type)
      : [];
  const modeOpts = nativeModeOpts
    ? customCardOpts.length > 0
      ? [
          ...nativeModeOpts,
          { value: '__sep__', label: '──── Custom cards (HACS) ────', disabled: true },
          ...customCardOpts,
        ]
      : nativeModeOpts
    : undefined;
  const modeField = modeOpts
    ? [
        {
          name: 'mode',
          selector: { select: { mode: 'dropdown', options: modeOpts } },
        },
      ]
    : [];

  if (section.type === 'custom') {
    // Dla custom card pokazujemy tylko type + title. Pole `card` obsługujemy
    // przez osobny ha-yaml-editor w template (bo ha-form nie ma selector
    // na dowolny YAML object).
    return common;
  }

  if (section.type === 'summary') {
    return [
      ...common,
      {
        name: 'fields',
        selector: {
          select: { multiple: true, mode: 'list', options: SUMMARY_FIELD_OPTIONS },
        },
      },
      ...modeField,
    ];
  }

  const extra: Array<Record<string, unknown>> = [];
  if (entityDomains.length > 0) {
    extra.push({
      name: 'entities',
      selector: {
        entity: {
          multiple: true,
          filter: entityDomains.map((d) => ({ domain: d })),
        },
      },
    });
  }
  extra.push({
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'columns',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'auto', label: 'Auto' },
              { value: 1, label: '1 kolumna' },
              { value: 2, label: '2 kolumny' },
              { value: 3, label: '3 kolumny' },
            ],
          },
        },
      },
      ...modeField,
    ],
  });

  return [...common, ...extra];
}

function entityDomainsForType(type: RoomSectionType): string[] {
  switch (type) {
    case 'lights':
      return ['light'];
    case 'covers':
      return ['cover'];
    case 'windows':
    case 'doors':
      return ['binary_sensor'];
    case 'climate':
      return ['climate'];
    case 'media':
      return ['media_player'];
    case 'fans':
      return ['fan'];
    case 'switches':
      return ['switch'];
    case 'scenes':
      return ['scene', 'script'];
    case 'summary':
    case 'custom':
      return [];
  }
}

const LABELS: Record<string, string> = {
  type: 'Typ sekcji',
  title: 'Nazwa (override)',
  icon: 'Ikona (override)',
  entities: 'Ograniczenie do encji',
  columns: 'Liczba kolumn',
  mode: 'Tryb wyświetlania',
  fields: 'Co pokazać w podsumowaniu',
};

const HELPERS: Record<string, string> = {
  entities: 'Puste = wszystkie encje tego typu z pomieszczenia. Wybranie kilku ogranicza.',
  mode: 'Slider działa dla light (brightness) i cover (position).',
};

@customElement('stratum-sections-editor')
export class StratumSectionsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public sections: RoomSectionConfig[] = [];

  @state() private _open = new Set<number>();

  @state() private _showPresets = false;

  private _emit(next: RoomSectionConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('sections-changed', {
        detail: { sections: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _updateAt(index: number, patch: Partial<RoomSectionConfig>): void {
    const next = [...this.sections];
    const prev = next[index]!;
    const merged: RoomSectionConfig = { ...prev, ...patch };
    if (!merged.title) delete merged.title;
    if (!merged.icon) delete merged.icon;
    if (!merged.entities || merged.entities.length === 0) delete merged.entities;
    if (!merged.fields || (merged.fields as SummaryField[]).length === 0) {
      delete merged.fields;
    }
    if (!merged.mode) delete merged.mode;
    if (!merged.columns || merged.columns === 'auto') delete merged.columns;
    if (merged.card && Object.keys(merged.card).length === 0) delete merged.card;
    if (merged.card_template && Object.keys(merged.card_template).length === 0) {
      delete merged.card_template;
    }
    next[index] = merged;
    this._emit(next);
  }

  private _onFieldChange(
    index: number,
    ev: CustomEvent<{ value: Partial<RoomSectionConfig> }>,
  ): void {
    ev.stopPropagation();
    this._updateAt(index, ev.detail.value);
  }

  private _add(): void {
    // Klasyczny przycisk — dodaje pustą sekcję Światła (fallback gdy picker zwinięty).
    const next = [...this.sections, { type: 'lights' } as RoomSectionConfig];
    this._emit(next);
    this._open = new Set([...this._open, next.length - 1]);
    this._showPresets = false;
  }

  private _addPreset(preset: SectionPreset): void {
    // Clone configu — presety są immutable.
    const clone: RoomSectionConfig = JSON.parse(JSON.stringify(preset.config));
    const next = [...this.sections, clone];
    this._emit(next);
    this._open = new Set([...this._open, next.length - 1]);
    this._showPresets = false;
  }

  private _remove(index: number): void {
    const next = this.sections.filter((_, i) => i !== index);
    this._emit(next);
    const open = new Set<number>();
    for (const i of this._open) {
      if (i === index) continue;
      open.add(i > index ? i - 1 : i);
    }
    this._open = open;
  }

  private _move(index: number, dir: -1 | 1): void {
    const target = index + dir;
    if (target < 0 || target >= this.sections.length) return;
    const next = [...this.sections];
    [next[index], next[target]] = [next[target]!, next[index]!];
    this._emit(next);
    const open = new Set<number>();
    for (const i of this._open) {
      if (i === index) open.add(target);
      else if (i === target) open.add(index);
      else open.add(i);
    }
    this._open = open;
  }

  private _toggleHidden(index: number): void {
    this._updateAt(index, { hidden: !this.sections[index]?.hidden });
  }

  private _toggleEdit(index: number): void {
    const next = new Set(this._open);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this._open = next;
  }

  protected render(): TemplateResult {
    return html`
      <div class="stratum-list">
        ${this.sections.map((section, idx) => {
          const open = this._open.has(idx);
          const label = section.title ?? SECTION_LABEL[section.type];
          const icon = section.icon ?? SECTION_ICON[section.type];
          const rowClass = `stratum-row ${!section.hidden ? 'active' : ''} ${section.hidden ? 'section-hidden' : ''}`;
          return html`
            <div class=${rowClass}>
              <div class="stratum-row-head">
                <span class="stratum-row-avatar">
                  <ha-icon .icon=${icon}></ha-icon>
                </span>
                <span class="stratum-row-title">${label}</span>
                ${section.hidden
                  ? html`<span class="stratum-badge ghost">ukryta</span>`
                  : nothing}
                <div class="stratum-row-actions">
                  <button
                    class="stratum-icon-btn"
                    title="Przesuń w górę"
                    ?disabled=${idx === 0}
                    @click=${() => this._move(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title="Przesuń w dół"
                    ?disabled=${idx === this.sections.length - 1}
                    @click=${() => this._move(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title=${section.hidden ? 'Pokaż' : 'Ukryj'}
                    @click=${() => this._toggleHidden(idx)}
                  >
                    <ha-icon
                      .icon=${section.hidden ? 'mdi:eye-off-outline' : 'mdi:eye-outline'}
                    ></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn ${open ? 'accent' : ''}"
                    title=${open ? 'Zwiń' : 'Edytuj'}
                    @click=${() => this._toggleEdit(idx)}
                  >
                    <ha-icon .icon=${open ? 'mdi:chevron-up' : 'mdi:pencil'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn danger"
                    title="Usuń"
                    @click=${() => this._remove(idx)}
                  >
                    <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
                  </button>
                </div>
              </div>
              ${open
                ? html`<div class="stratum-row-sub">
                    <ha-form
                      .hass=${this.hass}
                      .data=${{ columns: 'auto', ...section }}
                      .schema=${buildSchema(section)}
                      .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
                      .computeHelper=${(s: { name: string }) => HELPERS[s.name] ?? ''}
                      @value-changed=${(ev: CustomEvent<{ value: Partial<RoomSectionConfig> }>) =>
                        this._onFieldChange(idx, ev)}
                    ></ha-form>
                    ${section.type === 'custom'
                      ? html`<div class="card-yaml">
                          <label>Konfiguracja karty (YAML)</label>
                          <p class="card-hint">
                            Wklej dowolny config karty HA/HACS:
                            <code>type: media-control</code>,
                            <code>type: custom:mushroom-light-card</code>,
                            <code>type: custom:bubble-card</code> itd.
                          </p>
                          <ha-yaml-editor
                            .defaultValue=${section.card ?? {}}
                            @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown>; isValid: boolean }>) =>
                              ev.detail.isValid &&
                              this._updateAt(idx, { card: ev.detail.value })}
                          ></ha-yaml-editor>
                        </div>`
                      : nothing}
                    ${section.type !== 'custom' &&
                    section.type !== 'summary' &&
                    (section.mode ?? '').startsWith('custom:')
                      ? html`<div class="card-yaml">
                          <label>Template karty (YAML)</label>
                          <p class="card-hint">
                            Extra pola merge'owane z auto-configiem per encja.
                            Np. dla <code>custom:mushroom-light-card</code>:
                            <code>fill_container: true</code>,
                            <code>icon_color: amber</code>,
                            <code>use_light_color: true</code>. Nie wpisuj
                            <code>type</code> ani <code>entity</code> — wygrywa
                            auto-config.
                          </p>
                          <ha-yaml-editor
                            .defaultValue=${section.card_template ?? {}}
                            @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown>; isValid: boolean }>) =>
                              ev.detail.isValid &&
                              this._updateAt(idx, { card_template: ev.detail.value })}
                          ></ha-yaml-editor>
                        </div>`
                      : nothing}
                  </div>`
                : nothing}
            </div>
          `;
        })}
      </div>
      ${this._showPresets ? this._renderPresetsPicker() : nothing}
      <div class="add-row">
        <button
          class="stratum-add-btn"
          @click=${() => (this._showPresets = !this._showPresets)}
        >
          <ha-icon .icon=${this._showPresets ? 'mdi:close' : 'mdi:playlist-star'}></ha-icon>
          ${this._showPresets ? 'Ukryj presety' : 'Dodaj sekcję z presetu'}
        </button>
        <button
          class="stratum-add-btn empty-add"
          title="Dodaj pustą sekcję Światła"
          @click=${this._add}
        >
          <ha-icon .icon=${'mdi:plus'}></ha-icon>
          Pusta
        </button>
      </div>
    `;
  }

  private _renderPresetsPicker(): TemplateResult {
    const categories: PresetCategory[] = ['builtin', 'mushroom', 'bubble', 'other'];
    return html`
      <div class="presets-wrap">
        ${categories.map((cat) => {
          const items = SECTION_PRESETS.filter((p) => p.category === cat);
          if (items.length === 0) return nothing;
          return html`
            <div class="preset-group">
              <div class="preset-category">${CATEGORY_LABELS[cat]}</div>
              <div class="presets-grid">
                ${items.map((preset) => this._renderPresetCard(preset))}
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderPresetCard(preset: SectionPreset): TemplateResult {
    const installed = !preset.requires || isCardInstalled(preset.requires);
    return html`
      <button
        class="preset-card ${installed ? '' : 'unavailable'}"
        ?disabled=${!installed}
        @click=${() => this._addPreset(preset)}
        title=${installed
          ? preset.hint
          : `Wymaga zainstalowanej karty: ${preset.requires}`}
      >
        <span class="preset-avatar preset-avatar-${preset.category}">
          <ha-icon .icon=${preset.avatar}></ha-icon>
        </span>
        <span class="preset-body">
          <span class="preset-title">${preset.label}</span>
          <span class="preset-hint">${preset.hint}</span>
          ${!installed
            ? html`<span class="preset-missing">Brak: ${preset.requires}</span>`
            : nothing}
        </span>
      </button>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .section-hidden {
        opacity: 0.55;
      }

      .card-yaml {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--divider-color);
      }

      .card-yaml label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
      }

      .card-hint {
        margin: 0 0 8px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .card-yaml code {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 11px;
      }

      ha-yaml-editor {
        display: block;
      }

      .add-row {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }

      .add-row .stratum-add-btn {
        flex: 1;
        margin-top: 0;
      }

      .add-row .empty-add {
        flex: 0 0 auto;
        padding-left: 14px;
        padding-right: 14px;
      }

      .presets-wrap {
        margin-top: 10px;
        padding: 12px;
        border: 1.5px dashed color-mix(in srgb, var(--primary-color, #ff9b42) 40%, var(--divider-color));
        border-radius: 10px;
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 4%, transparent);
      }

      .preset-group + .preset-group {
        margin-top: 14px;
      }

      .preset-category {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--primary-color, #ff9b42);
        margin-bottom: 8px;
      }

      .presets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 6px;
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
        color: var(--primary-text-color);
        transition: border-color 0.12s ease, background 0.12s ease, transform 0.08s ease;
      }

      .preset-card:hover:not(:disabled) {
        border-color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 6%, transparent);
      }

      .preset-card:active:not(:disabled) {
        transform: scale(0.98);
      }

      .preset-card.unavailable {
        opacity: 0.45;
        cursor: not-allowed;
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

      .preset-avatar-mushroom {
        background: color-mix(in srgb, #d48fff 22%, transparent);
        color: #d48fff;
      }

      .preset-avatar-bubble {
        background: color-mix(in srgb, #64b5f6 22%, transparent);
        color: #64b5f6;
      }

      .preset-avatar-builtin {
        background: color-mix(in srgb, #ffb74d 22%, transparent);
        color: #ffb74d;
      }

      .preset-avatar-other {
        background: color-mix(in srgb, #81c784 22%, transparent);
        color: #81c784;
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
      }

      .preset-hint {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .preset-missing {
        font-size: 10px;
        color: var(--error-color, #e53935);
        margin-top: 2px;
        font-style: italic;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-sections-editor': StratumSectionsEditor;
  }
}
