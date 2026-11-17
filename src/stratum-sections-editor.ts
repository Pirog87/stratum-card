// Editor sekcji w room-card.
//
// Lista sekcji z dodawaniem/usuwaniem/reorder. Per sekcja:
// dropdown typu → dynamiczny sub-form z polami właściwymi typowi (entities,
// mode, columns, icon, title, summary fields).

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  CoreSectionType,
  HomeAssistant,
  RoomSectionConfig,
  SectionVisibility,
  SummaryField,
} from './types.js';
import { isCoreSectionType } from './room-block-visibility.js';
import { SECTION_LABEL, SECTION_ICON } from './section-defaults.js';
import {
  SECTION_PRESETS,
  CATEGORY_LABELS,
  isCardInstalled,
  type PresetCategory,
  type SectionPreset,
} from './section-presets.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import {
  MODE_OPTIONS_BY_TYPE,
  entityDomainsForType,
  retypeSection,
} from './section-type-change.js';
import { removeAt, restoreRemoved } from './editor-list-ops.js';
import { EditorUndoController, renderUndoBar } from './editor-undo.js';

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

/**
 * Schema dla ha-form BEZ `mode` — mode renderujemy osobno jako wizualny picker.
 * `summary` nadal ma dropdown mode w ha-form (cards/chips są specyficzne dla
 * summary i nie trafiają do section-presets).
 */
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

  // Mode dla wszystkich typów oprócz summary renderujemy jako WIZUALNY picker
  // (grid presetów) poza ha-formem. Summary ma specjalny dropdown bo cards/chips
  // są specyficzne dla summary, nie trafiają do section-presets.
  const modeField =
    section.type === 'summary'
      ? [
          {
            name: 'mode',
            selector: {
              select: {
                mode: 'dropdown',
                options: MODE_OPTIONS_BY_TYPE.summary,
              },
            },
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
  // Media (mode player, default): wybór głównego odtwarzacza.
  if (section.type === 'media') {
    extra.push({
      name: 'entity',
      selector: { entity: { filter: [{ domain: 'media_player' }] } },
    });
  }
  // Covers: pasek akcji zbiorczych + szybkie pozycje %.
  if (section.type === 'covers') {
    extra.push({ name: 'master', selector: { boolean: {} } });
    extra.push({
      name: 'positions',
      selector: {
        select: {
          multiple: true,
          custom_value: true,
          options: [
            { value: '25', label: '25 %' },
            { value: '50', label: '50 %' },
            { value: '75', label: '75 %' },
          ],
        },
      },
    });
  }
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

const LABELS: Record<string, string> = {
  type: 'Typ sekcji',
  title: 'Nazwa (override)',
  icon: 'Ikona (override)',
  entity: 'Główny odtwarzacz',
  entities: 'Ograniczenie do encji',
  columns: 'Liczba kolumn',
  mode: 'Tryb wyświetlania',
  fields: 'Co pokazać w podsumowaniu',
  master: 'Pasek akcji zbiorczych (Otwórz / Stop / Zamknij)',
  positions: 'Szybkie pozycje (%)',
};

const HELPERS: Record<string, string> = {
  entity:
    'Puste = auto: ten, który aktualnie gra (playing > pauza > włączony). Reszta w zwijanym „Pozostałe".',
  entities: 'Puste = wszystkie encje tego typu z pomieszczenia. Wybranie kilku ogranicza.',
  mode: 'Slider działa dla light (brightness) i cover (position).',
  positions:
    'Przyciski ustawiające WSZYSTKIE rolety na zadany procent. Własna wartość: wpisz liczbę i Enter. Default: 50, 75.',
};

@customElement('stratum-sections-editor')
export class StratumSectionsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public sections: RoomSectionConfig[] = [];

  /**
   * Widoczność sekcji rdzeniowych (lights/covers/media/scenes) liczona
   * przez rodzica z bloków popupu. Gdy podana, oko tych sekcji pokazuje
   * ten stan i zamiast pisać `section.hidden` emituje `core-section-toggle`
   * — rodzic zapisuje to do `popup_order`, tego samego miejsca co oko
   * na nagłówku bloku. Bez tego były dwa niezależne przełączniki jednego
   * bloku, które się rozjeżdżały. Brak (edytor samodzielnej room-card,
   * bez nagłówków bloków) = dotychczasowe `section.hidden`.
   */
  @property({ attribute: false })
  public coreVisibility?: Partial<Record<CoreSectionType, SectionVisibility>>;

  @state() private _open = new Set<number>();

  @state() private _showPresets = false;

  private _undo = new EditorUndoController(this);

  private _emit(next: RoomSectionConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('sections-changed', {
        detail: { sections: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Dane dla ha-form — defaulty widoczne w formularzu + positions jako stringi. */
  private _formData(section: RoomSectionConfig): Record<string, unknown> {
    const d: Record<string, unknown> = { columns: 'auto', ...section };
    if (section.type === 'covers') {
      d.master = section.master ?? false;
      d.positions = (section.positions ?? [50, 75]).map(String);
    }
    return d;
  }

  private _updateAt(index: number, patch: Partial<RoomSectionConfig>): void {
    const next = [...this.sections];
    const prev = next[index]!;
    // Zmiana typu buduje sekcję od nowa (retypeSection) — merge zostawiłby
    // tryb i encje starego typu, np. lampy jako kafle rolet.
    const merged: RoomSectionConfig =
      patch.type && patch.type !== prev.type
        ? retypeSection(prev, patch.type)
        : { ...prev, ...patch };
    if (!merged.title) delete merged.title;
    if (!merged.icon) delete merged.icon;
    if (!merged.entity) delete merged.entity;
    if (!merged.entities || merged.entities.length === 0) delete merged.entities;
    // Covers: master default false (zapisujemy tylko true); positions z ha-form
    // przychodzą jako stringi — normalizujemy do liczb, default [50, 75] kasujemy.
    if (merged.master !== true) delete merged.master;
    if (merged.positions !== undefined) {
      const nums = (merged.positions as Array<string | number>)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0 && n < 100)
        .sort((a, b) => a - b);
      const isDefault = nums.length === 2 && nums[0] === 50 && nums[1] === 75;
      if (nums.length === 0 || isDefault) delete merged.positions;
      else merged.positions = nums;
    }
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

  /** Sprawdza czy preset jest „aktywny" dla aktualnej sekcji (mode match). */
  private _isPresetActive(
    section: RoomSectionConfig,
    preset: SectionPreset,
  ): boolean {
    if (section.type !== preset.config.type) return false;
    return (section.mode ?? '') === (preset.config.mode ?? '');
  }

  /** Aplikuje preset jako szybki mode-switch — zachowuje tytuł/ikonę/entities. */
  private _applyPresetMode(index: number, preset: SectionPreset): void {
    const current = this.sections[index];
    if (!current) return;
    const next: RoomSectionConfig = {
      ...current,
      type: preset.config.type,
      mode: preset.config.mode,
      card_template: preset.config.card_template,
    };
    if (!preset.config.mode) delete next.mode;
    if (!preset.config.card_template) delete next.card_template;
    this._updateAt(index, next);
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
    const before = [...this.sections];
    const { next, removed } = removeAt(before, index);
    if (!removed) return;
    this._emit(next);
    const prevOpen = new Set(this._open);
    // Natychmiast, ale z „Cofnij" — sekcja potrafi nieść tryb, encje
    // i szablon karty, a kosz stoi tuż obok ołówka (patrz editor-undo.ts).
    this._undo.offer(removed.title ?? SECTION_LABEL[removed.type] ?? removed.type, () => {
      const restored = restoreRemoved(this.sections, next, before, index, removed);
      this._emit(restored);
      // Dokładny powrót przywraca rozwinięte formularze; inaczej zwijamy,
      // żeby po cofnięciu nie otworzył się formularz innej sekcji.
      this._open = JSON.stringify(restored) === JSON.stringify(before) ? prevOpen : new Set();
    });
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

  /** Stan oka sekcji: z rodzica dla rdzeniowych (gdy podany), inaczej section.hidden. */
  private _visibility(section: RoomSectionConfig): SectionVisibility {
    const managed = this.coreVisibility && isCoreSectionType(section.type)
      ? this.coreVisibility[section.type]
      : undefined;
    if (managed) return managed;
    return section.hidden ? 'hidden' : 'visible';
  }

  private _toggleHidden(index: number): void {
    const section = this.sections[index];
    if (!section) return;
    if (this.coreVisibility && isCoreSectionType(section.type)) {
      this.dispatchEvent(
        new CustomEvent('core-section-toggle', {
          detail: { type: section.type },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }
    this._updateAt(index, { hidden: !section.hidden });
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
          const visibility = this._visibility(section);
          const hidden = visibility === 'hidden';
          const rowClass = `stratum-row ${!hidden ? 'active' : ''} ${hidden ? 'section-hidden' : ''}`;
          return html`
            <div class=${rowClass}>
              <div class="stratum-row-head">
                <span class="stratum-row-avatar">
                  <ha-icon .icon=${icon} aria-hidden="true"></ha-icon>
                </span>
                <span class="stratum-row-title">${label}</span>
                ${hidden
                  ? html`<span class="stratum-badge ghost">ukryta</span>`
                  : visibility === 'partial'
                  ? html`<span class="stratum-badge ghost">częściowo ukryta</span>`
                  : nothing}
                <div class="stratum-row-actions">
                  <button
                    type="button"
                    class="stratum-icon-btn"
                    title="Przesuń w górę"
                    aria-label=${`${label}: przesuń w górę`}
                    ?disabled=${idx === 0}
                    @click=${() => this._move(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'} aria-hidden="true"></ha-icon>
                  </button>
                  <button
                    type="button"
                    class="stratum-icon-btn"
                    title="Przesuń w dół"
                    aria-label=${`${label}: przesuń w dół`}
                    ?disabled=${idx === this.sections.length - 1}
                    @click=${() => this._move(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'} aria-hidden="true"></ha-icon>
                  </button>
                  <button
                    type="button"
                    class="stratum-icon-btn"
                    title=${hidden
                      ? 'Pokaż'
                      : visibility === 'partial'
                      ? 'Ukryj oba bloki świateł'
                      : 'Ukryj'}
                    aria-label=${`${label}: ukryta`}
                    aria-pressed=${hidden ? 'true' : visibility === 'partial' ? 'mixed' : 'false'}
                    @click=${() => this._toggleHidden(idx)}
                  >
                    <ha-icon
                      .icon=${hidden ? 'mdi:eye-off-outline' : 'mdi:eye-outline'}
                      aria-hidden="true"
                    ></ha-icon>
                  </button>
                  <button
                    type="button"
                    class="stratum-icon-btn ${open ? 'accent' : ''}"
                    title=${open ? 'Zwiń' : 'Edytuj'}
                    aria-label=${`${label}: ${open ? 'zwiń' : 'edytuj'}`}
                    aria-expanded=${open ? 'true' : 'false'}
                    @click=${() => this._toggleEdit(idx)}
                  >
                    <ha-icon .icon=${open ? 'mdi:chevron-up' : 'mdi:pencil'} aria-hidden="true"></ha-icon>
                  </button>
                  <button
                    type="button"
                    class="stratum-icon-btn danger"
                    title="Usuń"
                    aria-label=${`Usuń sekcję ${label}`}
                    @click=${() => this._remove(idx)}
                  >
                    <ha-icon .icon=${'mdi:delete-outline'} aria-hidden="true"></ha-icon>
                  </button>
                </div>
              </div>
              ${open
                ? html`<div class="stratum-row-sub">
                    ${this._renderModePicker(section, idx)}
                    <ha-form
                      .hass=${this.hass}
                      .data=${this._formData(section)}
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
      ${renderUndoBar(this._undo)}
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

  /**
   * Wizualny picker trybu dla aktualnej sekcji — grid presetów pasujących
   * do section.type z active state + availability check.
   */
  private _renderModePicker(
    section: RoomSectionConfig,
    idx: number,
  ): TemplateResult {
    // Summary i custom nie mają preset-based pickera.
    if (section.type === 'summary' || section.type === 'custom') {
      return html``;
    }
    const relevant = SECTION_PRESETS.filter(
      (p) => p.config.type === section.type,
    );
    if (relevant.length === 0) return html``;

    const currentMode = section.mode ?? '';
    const anyActive = relevant.some((p) => this._isPresetActive(section, p));

    return html`
      <div class="mode-picker">
        <label class="mode-picker-label">Tryb wyświetlania</label>
        <div class="presets-grid">
          ${relevant.map((p) => {
            const installed = !p.requires || isCardInstalled(p.requires);
            const active = this._isPresetActive(section, p);
            return html`<button
              class="preset-card preset-mode ${active ? 'active' : ''} ${installed
                ? ''
                : 'unavailable'}"
              ?disabled=${!installed}
              title=${installed
                ? p.hint
                : `Wymaga zainstalowanej karty: ${p.requires}`}
              @click=${() => this._applyPresetMode(idx, p)}
            >
              <span class="preset-avatar preset-avatar-${p.category}">
                <ha-icon .icon=${p.avatar}></ha-icon>
              </span>
              <span class="preset-body">
                <span class="preset-title">${p.label}</span>
                <span class="preset-hint">${p.hint}</span>
                ${!installed
                  ? html`<span class="preset-missing">Brak: ${p.requires}</span>`
                  : nothing}
              </span>
              ${active
                ? html`<span class="active-check">
                    <ha-icon .icon=${'mdi:check-circle'}></ha-icon>
                  </span>`
                : nothing}
            </button>`;
          })}
        </div>
        ${!anyActive && currentMode
          ? html`<p class="mode-picker-hint">
              <ha-icon .icon=${'mdi:information-outline'}></ha-icon>
              Aktualny tryb: <code>${currentMode}</code> — nie pasuje do żadnego
              presetu. Kliknij dowolny preset żeby podmienić.
            </p>`
          : nothing}
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

      .mode-picker {
        margin-bottom: 14px;
      }

      .mode-picker-label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--secondary-text-color);
        margin-bottom: 8px;
      }

      .preset-card.preset-mode {
        position: relative;
        padding-right: 32px;
      }

      .preset-card.preset-mode.active {
        border-color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 12%, transparent);
        box-shadow: 0 0 0 1px var(--primary-color, #ff9b42);
      }

      .active-check {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--primary-color, #ff9b42);
      }

      .active-check ha-icon {
        --mdc-icon-size: 18px;
      }

      .mode-picker-hint {
        margin: 8px 0 0;
        padding: 6px 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--warning-color, #ff9800) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 30%, transparent);
        font-size: 11px;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mode-picker-hint ha-icon {
        --mdc-icon-size: 14px;
        color: var(--warning-color, #ff9800);
      }

      .mode-picker-hint code {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.08));
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 10px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-sections-editor': StratumSectionsEditor;
  }
}
