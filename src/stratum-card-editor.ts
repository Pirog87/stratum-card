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
import './stratum-card-rooms-editor.js';
import './stratum-scene-editor.js';
import './stratum-conditions-editor.js';
import './stratum-display-editor.js';
import './stratum-header-editor.js';
import './stratum-chips-editor.js';
import { editorSharedStyles } from './editor-shared-styles.js';

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

const TAP_SCHEMA: readonly FormSchemaItem[] = [
  { name: 'room_tap_action', selector: { ui_action: {} } },
];

const LABELS: Record<string, string> = {
  floor_id: 'Piętro (floor)',
  area_id: 'Pojedyncza strefa (area) — alternatywa',
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  room_tap_action: 'Akcja po kliknięciu w wiersz pomieszczenia',
};

const HELPERS: Record<string, string> = {
  floor_id:
    'Główny tryb — karta agreguje wszystkie strefy tego piętra. Wymaga HA 2024.3+.',
  area_id:
    'Użyj zamiast floor_id gdy chcesz kartę na jeden pokój. Wybierz JEDNO z pól.',
  name: 'Pozostaw puste, żeby użyć nazwy piętra/strefy z HA.',
  icon: 'Pozostaw puste, żeby użyć ikony piętra/strefy z HA (fallback: mdi:home).',
  room_tap_action:
    'Domyślnie klik otwiera popup pokoju. Możesz nadpisać: Przejdź, Więcej info, Wywołaj serwis itd.',
};

const COLUMN_CHIPS: Array<{ value: 'auto' | 1 | 2 | 3 | 4 | 5 | 6; label: string }> = [
  { value: 'auto', label: 'Auto' },
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

  @state() private _config?: StratumCardConfig;

  /** Stan rozwinięcia collapsible paneli (Wygląd — Wiersz, Wygląd — Kafel). */
  @state() private _openSections = new Set<string>();

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
    LABELS[schema.name] ?? schema.name;

  private _computeHelper = (schema: FormSchemaItem): string =>
    HELPERS[schema.name] ?? '';

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

  /** Oczyszcza raw z defaults. Wspólna logika dla row/tile. */
  private _cleanStyle(raw: TileDisplayConfig, isTile: boolean): TileDisplayConfig {
    const out: TileDisplayConfig = {};
    if (raw.fields && raw.fields.length > 0) out.fields = raw.fields;
    if (raw.accent_color && raw.accent_color.trim() !== '') {
      out.accent_color = raw.accent_color;
    }
    if (raw.accent_mode === 'lights') out.accent_mode = 'lights';
    if (raw.show_icon === false) out.show_icon = false;
    if (raw.show_name === false) out.show_name = false;
    const defaultRadius = isTile ? 14 : 6;
    const defaultPadding = isTile ? 12 : 10;
    const defaultMinH = isTile ? 110 : 0;
    if (typeof raw.border_radius === 'number' && raw.border_radius !== defaultRadius) {
      out.border_radius = raw.border_radius;
    }
    if (typeof raw.padding === 'number' && raw.padding !== defaultPadding) {
      out.padding = raw.padding;
    }
    if (typeof raw.min_height === 'number' && raw.min_height !== defaultMinH) {
      out.min_height = raw.min_height;
    }
    if (typeof raw.icon_size === 'number' && raw.icon_size !== 22) {
      out.icon_size = raw.icon_size;
    }
    if (raw.icon_style && raw.icon_style !== 'bubble') {
      out.icon_style = raw.icon_style;
    }
    const defaultHover = isTile ? 'lift' : 'subtle';
    if (raw.hover_effect && raw.hover_effect !== defaultHover) {
      out.hover_effect = raw.hover_effect;
    }
    if (typeof raw.press_scale === 'number' && raw.press_scale !== 0.98) {
      out.press_scale = raw.press_scale;
    }
    // Tile-only fields
    if (isTile) {
      if (raw.aspect && raw.aspect.trim() !== '' && raw.aspect !== '1/1') {
        out.aspect = raw.aspect;
      }
      if (raw.background_image && raw.background_image.trim() !== '') {
        out.background_image = raw.background_image;
      }
      if (raw.icon_position && raw.icon_position !== 'top-left') {
        out.icon_position = raw.icon_position;
      }
    }
    return out;
  }

  private _rowConfigChanged(ev: CustomEvent<{ config: RowDisplayConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const cleaned = this._cleanStyle(ev.detail.config ?? {}, false);
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
    const cleaned = this._cleanStyle(ev.detail.config ?? {}, true);
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
    // Default = 60; zapisujemy tylko gdy inne.
    this._updateField('auto_collapse', v === 60 ? undefined : v);
  }

  private _onToggleChange(
    key: 'expanded' | 'debug',
    ev: Event,
  ): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._updateField(key, checked ? true : undefined);
  }

  private _onRoomsDisplay(value: 'row' | 'tile'): void {
    // Default = 'row', więc zapisujemy tylko gdy tile.
    this._updateField('rooms_display', value === 'tile' ? 'tile' : undefined);
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
    const autoCollapse = cfg.auto_collapse ?? 60;
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
            <h3>Ustawienia ogólne</h3>
            <p class="stratum-panel-hint">
              Piętro lub strefa, nagłówek karty, layout, auto-zwijanie.
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
            <label class="stratum-group-label">Domyślna forma pozycji</label>
            <div class="stratum-chip-row">
              <button
                type="button"
                class="stratum-chip ${roomsDisplay === 'row' ? 'on' : ''}"
                @click=${() => this._onRoomsDisplay('row')}
              >
                <ha-icon .icon=${'mdi:format-list-bulleted'}></ha-icon>
                <span>Wiersz</span>
              </button>
              <button
                type="button"
                class="stratum-chip ${roomsDisplay === 'tile' ? 'on' : ''}"
                @click=${() => this._onRoomsDisplay('tile')}
              >
                <ha-icon .icon=${'mdi:view-grid-outline'}></ha-icon>
                <span>Kafel</span>
              </button>
            </div>
            <p class="stratum-group-hint">
              Możesz nadpisać per pomieszczenie w sekcji „Pomieszczenia".
            </p>
          </div>

          <div class="stratum-group">
            <label class="stratum-group-label">Kafle — liczba kolumn</label>
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
                  <span>${c.label}</span>
                </button>`,
              )}
            </div>
            <p class="stratum-group-hint">
              Auto = auto-fill (dostosowuje liczbę kolumn do szerokości).
              Cyfra = sztywno N kolumn, szerokość kafli dzieli się równo.
            </p>
          </div>

          <div class="stratum-slider-row">
            <label class="stratum-slider-label">Auto-zwijanie po</label>
            <div class="stratum-slider-value">
              ${autoCollapse === 0 ? 'wyłączone' : `${autoCollapse} s`}
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

          <ha-form
            .hass=${this.hass}
            .data=${cfg}
            .schema=${TAP_SCHEMA}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._valueChanged}
          ></ha-form>

          <div class="stratum-toggles-row">
            <label class="stratum-toggle">
              <input
                type="checkbox"
                .checked=${cfg.expanded === true}
                @change=${(ev: Event) => this._onToggleChange('expanded', ev)}
              />
              <span>Rozwinięta domyślnie</span>
            </label>
            <label class="stratum-toggle">
              <input
                type="checkbox"
                .checked=${cfg.debug === true}
                @change=${(ev: Event) => this._onToggleChange('debug', ev)}
              />
              <span>Debug log w konsoli</span>
            </label>
          </div>
        </div>
      </details>
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
            <h3>Belka nagłówka</h3>
            <p class="stratum-panel-hint">
              Wygląd górnej belki: rozmiar/kolor tytułu, ikona area, padding,
              chevron, akcentowy pasek z lewej.
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-header-editor
            .config=${this._config.header ?? {}}
            @header-config-changed=${this._headerChanged}
          ></stratum-header-editor>
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
            <h3>Chipy w nagłówku</h3>
            <p class="stratum-panel-hint">
              Skróty po prawej stronie tytułu. Wbudowane: lights / motion /
              okna / drzwi. Możesz dodać encję, filtr, albo template.
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-chips-editor
            .hass=${this.hass}
            .chips=${this._config.chips ?? []}
            @chips-changed=${this._chipsChanged}
          ></stratum-chips-editor>
        </div>
      </details>

      <details class="stratum-panel" ?open=${this._openSections.has('row')}
        @toggle=${(ev: Event) => this._onSectionToggle('row', ev)}>
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar row-avatar">
            <ha-icon .icon=${'mdi:format-list-bulleted'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Wygląd — Wiersz (row)</h3>
            <p class="stratum-panel-hint">
              Konfiguracja formy kompaktowej — pola, kolory, zaokrąglenia,
              reakcje na dotyk.
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-display-editor
            mode="row"
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
            <h3>Wygląd — Kafel (tile)</h3>
            <p class="stratum-panel-hint">
              Dodatkowo proporcje kafla, obrazek tła i pozycja ikony.
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-display-editor
            mode="tile"
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
            <h3>Warunki — styl zależny od encji</h3>
            <p class="stratum-panel-hint">
              Wspólne reguły dla wiersza i kafla. Pierwsza spełniona reguła
              wygrywa.
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
            <h3>Pomieszczenia</h3>
            <p class="stratum-panel-hint">
              Zaznacz, posortuj, dostosuj widok popup per pomieszczenie.
              Brak zaznaczeń = auto-discover.
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
            <h3>Sceny</h3>
            <p class="stratum-panel-hint">
              Pasek scen w karcie. Każda scena ma obrazek (lub preset),
              własną ikonę i akcję.
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">
          <stratum-scene-editor
            .hass=${this.hass}
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
