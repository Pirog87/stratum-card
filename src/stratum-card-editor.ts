// Wizualny editor karty Stratum.
//
// Renderuje natywny `<ha-form>` z deklaratywnym schema. HA dostarcza wszystkie
// selektory (area, icon, boolean, text), my tylko opisujemy strukturę i etykiety.
// Każda zmiana wartości emituje event `config-changed` z pełnym configiem —
// tak wymaga dashboard editor HA.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ChipConfig,
  DisplayConditionConfig,
  HeaderConfig,
  HomeAssistant,
  RoomConfig,
  RowDisplayConfig,
  SceneBarConfig,
  StratumCardConfig,
  TileDisplayConfig,
} from './types.js';
import './stratum-popup-header-editor.js';
import './stratum-card-rooms-editor.js';
import './stratum-scene-editor.js';
import './stratum-conditions-editor.js';
import './stratum-display-editor.js';
import './stratum-header-editor.js';
import './stratum-chips-editor.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import { ROW_UI_ACTIONS } from './tap-action.js';
import { cleanDisplayStyle } from './display-config-clean.js';
import { langOf, localize, lookup, messages, type MessageKey } from './localize/localize.js';

interface FormSchemaItem {
  name: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  type?: string;
  title?: string;
  icon?: string;
  schema?: FormSchemaItem[];
}

const SOURCE_SCHEMA: readonly FormSchemaItem[] = [
  { name: 'floor_id', selector: { floor: {} } },
  { name: 'area_id', selector: { area: {} } },
];

const IDENTITY_SCHEMA: readonly FormSchemaItem[] = [
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
];

// Wiersz pokoju nie ma jednej encji — `more-info` / `toggle` nie miałyby
// czego otworzyć ani przełączyć, a `assist` karta nie obsługuje. Edytor
// HA oferowałby je domyślnie i zapisywał akcję, która nic nie robi.
const ROW_TAP_SCHEMA: readonly FormSchemaItem[] = [
  { name: 'room_tap_action', selector: { ui_action: { actions: ROW_UI_ACTIONS } } },
];

const ICON_TAP_SCHEMA: readonly FormSchemaItem[] = [
  { name: 'room_icon_tap_action', selector: { ui_action: { actions: ROW_UI_ACTIONS } } },
];

/** Szybkie presety akcji kliknięcia (wiersz / ikona). */
type TapChoice = 'default' | 'popup' | 'toggle-lights' | 'none' | 'custom';

// Etykiety i podpowiedzi pól ha-form: `editor.card.labels` / `helpers` w słowniku.

// `label: null` = „Auto" ze słownika; cyfry są takie same w każdym języku.
const COLUMN_CHIPS: Array<{ value: 'auto' | 1 | 2 | 3 | 4 | 5 | 6; label: string | null }> = [
  { value: 'auto', label: null },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
];

@customElement('stratum-card-editor')
export class StratumCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  private _t(key: MessageKey, vars?: Record<string, string | number>): string {
    return localize(this.hass, key, vars);
  }

  @state() private _config?: StratumCardConfig;

  /** Stan rozwinięcia collapsible paneli (Wygląd — Wiersz, Wygląd — Kafel). */
  @state() private _openSections = new Set<string>();

  /** Klucze akcji z otwartym trybem „Niestandardowa" (pełny ha-form). */
  @state() private _customTapOpen = new Set<string>();

  public setConfig(config: StratumCardConfig): void {
    this._config = config;
  }

  /** Zmiana jednego pola StratumCardConfig — kasuje klucz gdy wartość pusta. */
  private _updateField<K extends keyof StratumCardConfig>(
    key: K,
    value: StratumCardConfig[K] | undefined,
  ): void {
    if (!this._config) return;
    const next: StratumCardConfig = {
      ...this._config,
      type: this._config.type ?? 'custom:stratum-card',
    };
    const isEmpty =
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      delete next[key];
    } else {
      (next as unknown as Record<string, unknown>)[key as string] = value as unknown;
    }
    this._emitConfig(next);
  }

  private _computeLabel = (schema: FormSchemaItem): string =>
    lookup(messages(this.hass).editor.card.labels, schema.name) ?? schema.name;

  private _computeHelper = (schema: FormSchemaItem): string =>
    lookup(messages(this.hass).editor.card.helpers, schema.name) ?? '';

  private _valueChanged(ev: CustomEvent<{ value: StratumCardConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = {
      ...this._config,
      ...ev.detail.value,
      type: this._config.type ?? 'custom:stratum-card',
    };
    this._emitConfig(next);
  }

  // ===== Belka popupu pomieszczenia (popup_header) =====
  // Panel wydzielony do komponentu stratum-popup-header-editor;
  // tu zostaje tylko budowa configu podglądu i odbiór zmian.

  /** Pierwsza area do mini-podglądu popupu (rooms > floor > area). */
  private _previewAreaId(): string | undefined {
    const room = this._config?.rooms?.[0];
    if (room?.area_id) return room.area_id;
    if (this._config?.area_id) return this._config.area_id;
    if (this._config?.floor_id && this.hass) {
      const areas = Object.values(this.hass.areas ?? {}) as Array<{
        area_id: string;
        floor_id?: string;
      }>;
      return areas.find((a) => a.floor_id === this._config!.floor_id)?.area_id;
    }
    return undefined;
  }

  /** Config karty pokoju do mini-podglądu panelu belki. */
  private _popupPreviewConfig(): import('./types.js').StratumRoomCardConfig | undefined {
    const areaId = this._previewAreaId();
    if (!areaId || !this.hass) return undefined;
    const room = this._config?.rooms?.find((r) => r.area_id === areaId);
    return {
      type: 'custom:stratum-room-card',
      area_id: areaId,
      merge_with: room?.merge_with,
      popup_header: this._config?.popup_header,
      chips: room?.chips,
    };
  }

  private _onPopupHeaderChanged(
    ev: CustomEvent<{ value?: import('./types.js').PopupHeaderConfig }>,
  ): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    if (ev.detail.value) next.popup_header = ev.detail.value;
    else delete next.popup_header;
    this._emitConfig(next);
  }


  private _rowConfigChanged(ev: CustomEvent<{ config: RowDisplayConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    // Sprzątanie defaults w czystym module (display-config-clean.ts) —
    // testy pilnują, że żaden klucz czytany przez kartę nie ginie.
    const cleaned = cleanDisplayStyle(ev.detail.config ?? {}, false);
    const next: StratumCardConfig = { ...this._config };
    // Po pierwszym saveuj migracja display_config → row/tile_config
    delete next.display_config;
    if (Object.keys(cleaned).length === 0) delete next.row_config;
    else next.row_config = cleaned;
    this._emitConfig(next);
  }

  private _tileConfigChanged(ev: CustomEvent<{ config: TileDisplayConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const cleaned = cleanDisplayStyle(ev.detail.config ?? {}, true);
    const next: StratumCardConfig = { ...this._config };
    delete next.display_config;
    if (Object.keys(cleaned).length === 0) delete next.tile_config;
    else next.tile_config = cleaned;
    this._emitConfig(next);
  }

  private _headerChanged(ev: CustomEvent<{ config: HeaderConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    const raw = ev.detail.config ?? {};
    // Usuwamy empty keys żeby YAML był czysty.
    const cleaned: HeaderConfig = {};
    if (raw.title_size && raw.title_size !== 'md') cleaned.title_size = raw.title_size;
    if (raw.title_weight && raw.title_weight !== 500) {
      cleaned.title_weight = raw.title_weight;
    }
    if (raw.title_color && raw.title_color.trim() !== '') {
      cleaned.title_color = raw.title_color;
    }
    if (raw.icon_color && raw.icon_color.trim() !== '') {
      cleaned.icon_color = raw.icon_color;
    }
    if (typeof raw.icon_size === 'number' && raw.icon_size !== 22) {
      cleaned.icon_size = raw.icon_size;
    }
    if (typeof raw.padding === 'number' && raw.padding !== 14) {
      cleaned.padding = raw.padding;
    }
    if (raw.hide_expander === true) cleaned.hide_expander = true;
    if (raw.accent_bar === true) cleaned.accent_bar = true;
    if (raw.accent_bar_color && raw.accent_bar_color.trim() !== '') {
      cleaned.accent_bar_color = raw.accent_bar_color;
    }
    if (raw.style === 'stripes') {
      cleaned.style = 'stripes';
      // Opcje pasków zapisujemy tylko przy stylu `stripes` i tylko gdy
      // odbiegają od domyślnych — po powrocie do belki klasycznej znikają.
      if (typeof raw.stripes_max === 'number' && raw.stripes_max !== 3) {
        cleaned.stripes_max = raw.stripes_max;
      }
      if (raw.stripes_color === 'static') cleaned.stripes_color = 'static';
      if (raw.stripes_tap === 'none') cleaned.stripes_tap = 'none';
      if (raw.icon_glow === false) cleaned.icon_glow = false;
      if (raw.glow_color && raw.glow_color.trim() !== '') {
        cleaned.glow_color = raw.glow_color;
      }
    }
    if (Object.keys(cleaned).length === 0) delete next.header;
    else next.header = cleaned;
    this._emitConfig(next);
  }

  private _chipsChanged(ev: CustomEvent<{ chips: ChipConfig[] }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    if (ev.detail.chips.length === 0) delete next.chips;
    else next.chips = ev.detail.chips;
    this._emitConfig(next);
  }

  private _conditionsChanged(
    ev: CustomEvent<{ conditions: DisplayConditionConfig[] }>,
  ): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    const list = ev.detail.conditions;
    delete next.display_config; // migracja — conditions wędruje na top-level
    if (list.length === 0) delete next.conditions;
    else next.conditions = list;
    this._emitConfig(next);
  }

  /** Zwraca aktualne wartości row/tile config z uwzględnieniem migracji. */
  private _effectiveRowConfig(): RowDisplayConfig {
    const c = this._config;
    if (c?.row_config) return c.row_config;
    if (c?.display_config) {
      const { conditions: _c, aspect: _a, background_image: _bg, icon_position: _ip, ...rest } =
        c.display_config;
      void _c;
      void _a;
      void _bg;
      void _ip;
      return rest;
    }
    return {};
  }

  private _effectiveTileConfig(): TileDisplayConfig {
    const c = this._config;
    if (c?.tile_config) return c.tile_config;
    if (c?.display_config) {
      const { conditions: _c, ...rest } = c.display_config;
      void _c;
      return rest;
    }
    return {};
  }

  private _effectiveConditions(): DisplayConditionConfig[] {
    const c = this._config;
    if (c?.conditions) return c.conditions;
    return c?.display_config?.conditions ?? [];
  }

  private _roomsChanged(ev: CustomEvent<{ rooms: RoomConfig[] }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    if (ev.detail.rooms.length === 0) {
      delete next.rooms;
    } else {
      next.rooms = ev.detail.rooms;
    }
    this._emitConfig(next);
  }

  private _scenesChanged(ev: CustomEvent<{ scenes: SceneBarConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    const items = ev.detail.scenes.items ?? [];
    if (items.length === 0) delete next.scenes;
    else next.scenes = ev.detail.scenes;
    this._emitConfig(next);
  }

  private _onSectionToggle(key: string, ev: Event): void {
    const target = ev.target as HTMLDetailsElement;
    const next = new Set(this._openSections);
    if (target.open) next.add(key);
    else next.delete(key);
    this._openSections = next;
  }

  private _onAutoCollapseInput(ev: Event): void {
    const v = parseInt((ev.target as HTMLInputElement).value, 10);
    // Default = 0 (wyłączone — zwijaniem rządzi mechanizm sesyjny);
    // zapisujemy tylko gdy user jawnie ustawi timer.
    this._updateField('auto_collapse', v === 0 ? undefined : v);
  }

  private _onToggleChange(
    key: 'expanded' | 'debug' | 'unavailable_chip',
    ev: Event,
  ): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._updateField(key, checked ? true : undefined);
  }

  private _onRoomsDisplay(value: 'row' | 'tile'): void {
    // Default = 'row', więc zapisujemy tylko gdy tile.
    this._updateField('rooms_display', value === 'tile' ? 'tile' : undefined);
  }

  private _onRoomsSceneSize(value: 'sm' | 'md' | 'lg'): void {
    // Default = 'sm', więc zapisujemy tylko gdy inne.
    this._updateField('rooms_scene_size', value === 'sm' ? undefined : value);
  }

  private _onRoomsSceneColumns(value: 'auto' | 1 | 2 | 3 | 4 | 5 | 6): void {
    // Brak (auto) = dotychczasowe zachowanie; zapisujemy tylko liczby.
    this._updateField(
      'rooms_scene_columns',
      value === 'auto' ? undefined : value,
    );
  }

  private _onRoomsSceneGradient(
    value: 'mesh' | 'linear' | 'glow' | 'horizon',
  ): void {
    // Default = 'mesh', więc zapisujemy tylko gdy inne.
    this._updateField(
      'rooms_scene_gradient',
      value === 'mesh' ? undefined : value,
    );
  }

  private _onColumnsChange(value: 'auto' | 1 | 2 | 3 | 4 | 5 | 6): void {
    const next: StratumCardConfig = {
      ...this._config!,
      type: this._config!.type ?? 'custom:stratum-card',
    };
    if (value === 'auto') {
      delete next.rooms_tile_columns;
    } else {
      next.rooms_tile_columns = value;
    }
    // Przy migracji na columns — skasuj stary min_width z configu.
    delete next.rooms_tile_min_width;
    this._emitConfig(next);
  }

  private _renderBasePanel(): TemplateResult {
    const cfg = this._config!;
    const autoCollapse = cfg.auto_collapse ?? 0;
    const roomsDisplay = cfg.rooms_display ?? 'row';
    const cols: 'auto' | 1 | 2 | 3 | 4 | 5 | 6 =
      cfg.rooms_tile_columns ?? 'auto';

    return html`
      <details
        class="stratum-panel base-panel"
        ?open=${this._openSections.has('base')}
        @toggle=${(ev: Event) => this._onSectionToggle('base', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:cog-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.base')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.base_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <ha-form
            .hass=${this.hass}
            .data=${cfg}
            .schema=${SOURCE_SCHEMA}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._valueChanged}
          ></ha-form>

          <ha-form
            .hass=${this.hass}
            .data=${cfg}
            .schema=${IDENTITY_SCHEMA}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._valueChanged}
          ></ha-form>

          <div class="stratum-group">
            <label class="stratum-group-label">${this._t('editor.card.display')}</label>
            <div class="stratum-chip-row">
              <button
                type="button"
                class="stratum-chip ${roomsDisplay === 'row' ? 'on' : ''}"
                @click=${() => this._onRoomsDisplay('row')}
              >
                <ha-icon .icon=${'mdi:format-list-bulleted'}></ha-icon>
                <span>${this._t('editor.card.display_row')}</span>
              </button>
              <button
                type="button"
                class="stratum-chip ${roomsDisplay === 'tile' ? 'on' : ''}"
                @click=${() => this._onRoomsDisplay('tile')}
              >
                <ha-icon .icon=${'mdi:view-grid-outline'}></ha-icon>
                <span>${this._t('editor.card.display_tile')}</span>
              </button>
            </div>
            <p class="stratum-group-hint">
              ${this._t('editor.card.display_hint')}
            </p>
          </div>

          <div class="stratum-group">
            <label class="stratum-group-label">${this._t('editor.card.tile_columns')}</label>
            <div class="stratum-chip-row">
              ${COLUMN_CHIPS.map(
                (c) => html`<button
                  type="button"
                  class="stratum-chip ${cols === c.value ? 'on' : ''}"
                  @click=${() => this._onColumnsChange(c.value)}
                >
                  ${c.value === 'auto'
                    ? html`<ha-icon .icon=${'mdi:view-dashboard-variant-outline'}></ha-icon>`
                    : nothing}
                  <span>${c.label ?? this._t('editor.card.auto')}</span>
                </button>`,
              )}
            </div>
            <p class="stratum-group-hint">
              ${this._t('editor.card.tile_columns_hint')}
            </p>
          </div>

          <div class="stratum-group">
            <label class="stratum-group-label">${this._t('editor.card.scene_size')}</label>
            <div class="stratum-chip-row">
              ${(
                [
                  { value: 'sm', label: this._t('editor.header.size_sm') },
                  { value: 'md', label: this._t('editor.header.size_md') },
                  { value: 'lg', label: this._t('editor.header.size_lg') },
                ] as const
              ).map(
                (c) => html`<button
                  type="button"
                  class="stratum-chip ${(cfg.rooms_scene_size ?? 'sm') === c.value ? 'on' : ''}"
                  @click=${() => this._onRoomsSceneSize(c.value)}
                >
                  <span>${c.label}</span>
                </button>`,
              )}
            </div>
            <p class="stratum-group-hint">
              ${this._t('editor.card.scene_size_hint')}
            </p>
          </div>

          <div class="stratum-group">
            <label class="stratum-group-label">${this._t('editor.card.scene_columns')}</label>
            <div class="stratum-chip-row">
              ${(
                [
                  { value: 'auto', label: this._t('editor.card.auto') },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                  { value: 4, label: '4' },
                  { value: 5, label: '5' },
                  { value: 6, label: '6' },
                ] as const
              ).map(
                (c) => html`<button
                  type="button"
                  class="stratum-chip ${(cfg.rooms_scene_columns ?? 'auto') === c.value ? 'on' : ''}"
                  @click=${() => this._onRoomsSceneColumns(c.value)}
                >
                  <span>${c.label}</span>
                </button>`,
              )}
            </div>
            <p class="stratum-group-hint">
              ${this._t('editor.card.scene_columns_hint')}
            </p>
          </div>

          <div class="stratum-group">
            <label class="stratum-group-label">${this._t('editor.card.scene_gradient')}</label>
            <div class="stratum-chip-row">
              ${(
                [
                  { value: 'mesh', label: this._t('editor.card.grad_mesh') },
                  { value: 'linear', label: this._t('editor.scene.grad_linear') },
                  { value: 'glow', label: this._t('editor.scene.grad_glow') },
                  { value: 'horizon', label: this._t('editor.scene.grad_horizon') },
                ] as const
              ).map(
                (c) => html`<button
                  type="button"
                  class="stratum-chip ${(cfg.rooms_scene_gradient ?? 'mesh') === c.value ? 'on' : ''}"
                  @click=${() => this._onRoomsSceneGradient(c.value)}
                >
                  <span>${c.label}</span>
                </button>`,
              )}
            </div>
            <p class="stratum-group-hint">
              ${this._t('editor.card.scene_gradient_hint')}
            </p>
          </div>

          <div class="stratum-slider-row">
            <label class="stratum-slider-label">${this._t('editor.card.auto_collapse')}</label>
            <div class="stratum-slider-value">
              ${autoCollapse === 0 ? this._t('editor.card.auto_collapse_off') : `${autoCollapse} s`}
            </div>
            <input
              type="range"
              class="stratum-slider"
              min="0"
              max="600"
              step="5"
              .value=${String(autoCollapse)}
              @input=${this._onAutoCollapseInput}
            />
          </div>
          <p class="stratum-group-hint">
            ${this._t('editor.card.auto_collapse_hint')}
          </p>

          <div class="stratum-toggles-row">
            <label class="stratum-toggle">
              <input
                type="checkbox"
                .checked=${cfg.expanded === true}
                @change=${(ev: Event) => this._onToggleChange('expanded', ev)}
              />
              <span>${this._t('editor.card.expanded')}</span>
            </label>
            <label class="stratum-toggle">
              <input
                type="checkbox"
                .checked=${cfg.debug === true}
                @change=${(ev: Event) => this._onToggleChange('debug', ev)}
              />
              <span>${this._t('editor.card.debug')}</span>
            </label>
          </div>
        </div>
      </details>
    `;
  }

  /** Mapuje wartość tap_action na preset chipa. */
  private _tapChoice(key: 'room_tap_action' | 'room_icon_tap_action'): TapChoice {
    if (this._customTapOpen.has(key)) return 'custom';
    const a = (this._config?.[key] as { action?: string } | undefined)?.action;
    if (!a || a === 'default') return 'default';
    if (a === 'popup') return 'popup';
    if (a === 'toggle-lights') return 'toggle-lights';
    if (a === 'none') return 'none';
    return 'custom';
  }

  private _setTapPreset(
    key: 'room_tap_action' | 'room_icon_tap_action',
    choice: TapChoice,
  ): void {
    const custom = new Set(this._customTapOpen);
    if (choice === 'custom') {
      custom.add(key);
      this._customTapOpen = custom;
      return; // wartość ustawi ha-form poniżej
    }
    custom.delete(key);
    this._customTapOpen = custom;
    if (choice === 'default') this._updateField(key, undefined);
    else this._updateField(key, { action: choice } as StratumCardConfig[typeof key]);
  }

  /** Grupa „Klik na wiersz" / „Klik na ikonę": chipy + opcjonalny ha-form. */
  private _renderTapGroup(
    key: 'room_tap_action' | 'room_icon_tap_action',
    label: string,
    defaultLabel: string,
    hint: string,
  ): TemplateResult {
    const choice = this._tapChoice(key);
    const chips: Array<{ v: TapChoice; l: string; icon?: string }> = [
      { v: 'default', l: defaultLabel },
      ...(key === 'room_icon_tap_action'
        ? [
            {
              v: 'popup' as TapChoice,
              l: this._t('editor.card.tap_popup'),
              icon: 'mdi:dock-window',
            },
          ]
        : []),
      {
        v: 'toggle-lights',
        l: this._t('editor.card.tap_toggle_lights'),
        icon: 'mdi:lightbulb-multiple-outline',
      },
      { v: 'none', l: this._t('editor.card.tap_none'), icon: 'mdi:cancel' },
      { v: 'custom', l: this._t('editor.card.tap_custom'), icon: 'mdi:tune' },
    ];
    return html`
      <div class="stratum-group">
        <label class="stratum-group-label">${label}</label>
        <div class="stratum-chip-row">
          ${chips.map(
            (c) => html`<button
              type="button"
              class="stratum-chip ${choice === c.v ? 'on' : ''}"
              @click=${() => this._setTapPreset(key, c.v)}
            >
              ${c.icon ? html`<ha-icon .icon=${c.icon}></ha-icon>` : nothing}
              <span>${c.l}</span>
            </button>`,
          )}
        </div>
        ${choice === 'custom'
          ? html`<ha-form
              .hass=${this.hass}
              .data=${this._config}
              .schema=${key === 'room_tap_action' ? ROW_TAP_SCHEMA : ICON_TAP_SCHEMA}
              .computeLabel=${this._computeLabel}
              .computeHelper=${this._computeHelper}
              @value-changed=${this._valueChanged}
            ></ha-form>`
          : html`<p class="stratum-group-hint">${hint}</p>`}
      </div>
    `;
  }

  private _emitConfig(config: StratumCardConfig): void {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) return html``;
    return html`
      ${this._renderBasePanel()}

      <details
        class="stratum-panel"
        ?open=${this._openSections.has('header')}
        @toggle=${(ev: Event) => this._onSectionToggle('header', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar header-avatar">
            <ha-icon .icon=${'mdi:page-layout-header'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.header')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.header_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-header-editor
            .uiLang=${langOf(this.hass)}
            .config=${this._config.header ?? {}}
            @header-config-changed=${this._headerChanged}
          ></stratum-header-editor>
        </div>
      </details>

      <details
        class="stratum-panel"
        ?open=${this._openSections.has('popup-header')}
        @toggle=${(ev: Event) => this._onSectionToggle('popup-header', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar header-avatar">
            <ha-icon .icon=${'mdi:dock-top'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.popup_header')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.popup_header_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-popup-header-editor
            .hass=${this.hass}
            .value=${this._config?.popup_header}
            .previewConfig=${this._popupPreviewConfig()}
            @popup-header-changed=${this._onPopupHeaderChanged}
          ></stratum-popup-header-editor>
        </div>
      </details>

      <details
        class="stratum-panel"
        ?open=${this._openSections.has('chips')}
        @toggle=${(ev: Event) => this._onSectionToggle('chips', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar chips-avatar">
            <ha-icon .icon=${'mdi:label-multiple-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.chips')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.chips_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-chips-editor
            .hass=${this.hass}
            .chips=${this._config.chips ?? []}
            @chips-changed=${this._chipsChanged}
          ></stratum-chips-editor>

          <div class="stratum-toggles-row">
            <label class="stratum-toggle">
              <input
                type="checkbox"
                .checked=${this._config.unavailable_chip === true}
                @change=${(ev: Event) =>
                  this._onToggleChange('unavailable_chip', ev)}
              />
              <span>${this._t('editor.card.unavailable_chip')}</span>
            </label>
          </div>
          <p class="stratum-panel-hint">
            ${this._t('editor.card.unavailable_chip_hint')}
          </p>
        </div>
      </details>

      <details class="stratum-panel" ?open=${this._openSections.has('row')}
        @toggle=${(ev: Event) => this._onSectionToggle('row', ev)}>
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar row-avatar">
            <ha-icon .icon=${'mdi:format-list-bulleted'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.row')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.row_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          ${this._renderTapGroup(
            'room_tap_action',
            this._t('editor.card.row_tap'),
            this._t('editor.card.row_tap_default'),
            this._t('editor.card.row_tap_hint'),
          )}
          ${this._renderTapGroup(
            'room_icon_tap_action',
            this._t('editor.card.icon_tap'),
            this._t('editor.card.icon_tap_default'),
            this._t('editor.card.icon_tap_hint'),
          )}
          <stratum-display-editor
            mode="row"
            .uiLang=${langOf(this.hass)}
            .config=${this._effectiveRowConfig()}
            @display-config-changed=${this._rowConfigChanged}
          ></stratum-display-editor>
        </div>
      </details>

      <details class="stratum-panel" ?open=${this._openSections.has('tile')}
        @toggle=${(ev: Event) => this._onSectionToggle('tile', ev)}>
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar tile-avatar">
            <ha-icon .icon=${'mdi:view-grid-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.tile')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.tile_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-display-editor
            mode="tile"
            .uiLang=${langOf(this.hass)}
            .config=${this._effectiveTileConfig()}
            @display-config-changed=${this._tileConfigChanged}
          ></stratum-display-editor>
        </div>
      </details>

      <details
        class="stratum-panel"
        ?open=${this._openSections.has('conditions')}
        @toggle=${(ev: Event) => this._onSectionToggle('conditions', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:function-variant'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.conditions')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.conditions_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-conditions-editor
            .hass=${this.hass}
            .conditions=${this._effectiveConditions()}
            @conditions-changed=${this._conditionsChanged}
          ></stratum-conditions-editor>
        </div>
      </details>

      <details
        class="stratum-panel"
        ?open=${this._openSections.has('rooms')}
        @toggle=${(ev: Event) => this._onSectionToggle('rooms', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:view-list-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.rooms')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.rooms_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-card-rooms-editor
            .hass=${this.hass}
            .floorId=${this._config.floor_id ?? ''}
            .areaId=${this._config.area_id ?? ''}
            .rooms=${this._config.rooms ?? []}
            @rooms-changed=${this._roomsChanged}
          ></stratum-card-rooms-editor>
        </div>
      </details>

      <details
        class="stratum-panel"
        ?open=${this._openSections.has('scenes')}
        @toggle=${(ev: Event) => this._onSectionToggle('scenes', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:palette-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${this._t('editor.card.scenes')}</h3>
            <p class="stratum-panel-hint">
              ${this._t('editor.card.scenes_hint')}
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <p class="stratum-group-hint">
            ${this._t('editor.card.scenes_body_hint')}
          </p>
          <stratum-scene-editor
            .hass=${this.hass}
            .floorId=${this._config.floor_id ?? ''}
            .areaId=${this._config.area_id ?? ''}
            .config=${this._config.scenes ?? { items: [] }}
            @scenes-changed=${this._scenesChanged}
          ></stratum-scene-editor>
        </div>
      </details>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      .stratum-panel-avatar.row-avatar {
        background: color-mix(in srgb, #2196f3 22%, transparent);
        color: #64b5f6;
      }
      .stratum-panel-avatar.tile-avatar {
        background: color-mix(in srgb, #ff9800 22%, transparent);
        color: #ffb74d;
      }
      .stratum-panel-avatar.header-avatar {
        background: color-mix(in srgb, #9c27b0 22%, transparent);
        color: #ce93d8;
      }
      .stratum-panel-avatar.chips-avatar {
        background: color-mix(in srgb, #4caf50 22%, transparent);
        color: #81c784;
      }
    `,
    css`
      :host {
        display: block;
      }
      ha-form {
        display: block;
      }
      .base-panel {
        margin-top: 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-editor': StratumCardEditor;
  }
}
