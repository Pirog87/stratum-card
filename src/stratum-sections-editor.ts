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
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
  ],
  covers: [
    { value: 'tile', label: 'Tile (kafel z przyciskami)' },
    { value: 'slider', label: 'Slider (pozycja)' },
    { value: 'chips', label: 'Chips (open/close)' },
  ],
  switches: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
  ],
  fans: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
  ],
  media: [
    { value: 'tile', label: 'Tile (play/pause)' },
    { value: 'chips', label: 'Chips (play/pause)' },
  ],
  windows: [
    { value: 'tile', label: 'Tile (kafel ze statusem)' },
    { value: 'chips', label: 'Chips (status readonly)' },
  ],
  doors: [
    { value: 'tile', label: 'Tile (kafel ze statusem)' },
    { value: 'chips', label: 'Chips (status readonly)' },
  ],
  scenes: [
    { value: 'tile', label: 'Tile (przycisk aktywuj)' },
    { value: 'chips', label: 'Chips (przycisk aktywuj)' },
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

  const modeOpts = MODE_OPTIONS_BY_TYPE[section.type];
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
    const next = [...this.sections, { type: 'lights' } as RoomSectionConfig];
    this._emit(next);
    this._open = new Set([...this._open, next.length - 1]);
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
      <div class="sections">
        ${this.sections.map((section, idx) => {
          const open = this._open.has(idx);
          const label = section.title ?? SECTION_LABEL[section.type];
          const icon = section.icon ?? SECTION_ICON[section.type];
          return html`
            <div class="section ${open ? 'open' : ''} ${section.hidden ? 'hidden' : ''}">
              <div class="row">
                <ha-icon .icon=${icon}></ha-icon>
                <span class="name">${label}</span>
                <div class="actions">
                  <button
                    class="icon-btn"
                    title="Przesuń w górę"
                    ?disabled=${idx === 0}
                    @click=${() => this._move(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                  </button>
                  <button
                    class="icon-btn"
                    title="Przesuń w dół"
                    ?disabled=${idx === this.sections.length - 1}
                    @click=${() => this._move(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                  </button>
                  <button
                    class="icon-btn ${section.hidden ? '' : 'active-eye'}"
                    title=${section.hidden ? 'Pokaż' : 'Ukryj'}
                    @click=${() => this._toggleHidden(idx)}
                  >
                    <ha-icon
                      .icon=${section.hidden ? 'mdi:eye-off-outline' : 'mdi:eye-outline'}
                    ></ha-icon>
                  </button>
                  <button
                    class="icon-btn edit ${open ? 'active' : ''}"
                    title=${open ? 'Zwiń' : 'Edytuj'}
                    @click=${() => this._toggleEdit(idx)}
                  >
                    <ha-icon .icon=${open ? 'mdi:chevron-up' : 'mdi:pencil'}></ha-icon>
                  </button>
                  <button
                    class="icon-btn danger"
                    title="Usuń"
                    @click=${() => this._remove(idx)}
                  >
                    <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
                  </button>
                </div>
              </div>
              ${open
                ? html`<div class="sub">
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
                          <p class="hint">
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
                  </div>`
                : nothing}
            </div>
          `;
        })}
      </div>
      <button class="add-btn" @click=${this._add}>
        <ha-icon .icon=${'mdi:plus'}></ha-icon>
        Dodaj sekcję
      </button>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    .sections {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .section {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 6px 10px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.02));
    }

    .section.open {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
    }

    .section.hidden {
      opacity: 0.55;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
    }

    .row > ha-icon {
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }

    .name {
      flex: 1;
      font-weight: 500;
    }

    .actions {
      display: flex;
      gap: 2px;
      margin-left: auto;
    }

    .icon-btn {
      background: transparent;
      border: 0;
      padding: 4px;
      cursor: pointer;
      color: var(--secondary-text-color);
      border-radius: 4px;
      display: inline-flex;
    }

    .icon-btn:hover:not(:disabled) {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      color: var(--primary-text-color);
    }

    .icon-btn.active-eye {
      color: var(--primary-text-color);
    }

    .icon-btn.edit.active {
      background: var(--primary-color, #ff9b42);
      color: #fff;
    }

    .icon-btn.danger:hover {
      background: rgba(244, 67, 54, 0.15);
      color: #f44336;
    }

    .icon-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .icon-btn ha-icon {
      --mdc-icon-size: 18px;
    }

    .sub {
      padding: 8px 0 4px 28px;
      border-top: 1px dashed var(--divider-color);
      margin-top: 4px;
    }

    .add-btn {
      margin-top: 10px;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px dashed var(--divider-color);
      background: transparent;
      color: var(--primary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }

    .add-btn:hover {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      border-color: var(--primary-color);
      color: var(--primary-color);
    }

    .add-btn ha-icon {
      --mdc-icon-size: 18px;
    }

    .card-yaml {
      margin-top: 10px;
      padding-top: 8px;
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

    .card-yaml .hint {
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-sections-editor': StratumSectionsEditor;
  }
}
