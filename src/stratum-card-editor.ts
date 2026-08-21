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

const ROW_TAP_SCHEMA: readonly FormSchemaItem[] = [
  { name: 'room_tap_action', selector: { ui_action: {} } },
];

const ICON_TAP_SCHEMA: readonly FormSchemaItem[] = [
  { name: 'room_icon_tap_action', selector: { ui_action: {} } },
];

/** Szybkie presety akcji kliknięcia (wiersz / ikona). */
type TapChoice = 'default' | 'popup' | 'toggle-lights' | 'none' | 'custom';

const LABELS: Record<string, string> = {
  floor_id: 'Piętro (floor)',
  area_id: 'Pojedyncza strefa (area) — alternatywa',
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  room_tap_action: 'Akcja po kliknięciu w wiersz pomieszczenia',
  room_icon_tap_action: 'Akcja po kliknięciu w ikonę pomieszczenia',
};

const HELPERS: Record<string, string> = {
  floor_id:
    'Główny tryb — karta agreguje wszystkie strefy tego piętra. Wymaga HA 2024.3+.',
  area_id:
    'Użyj zamiast floor_id gdy chcesz kartę na jeden pokój. Wybierz JEDNO z pól.',
  name: 'Pozostaw puste, żeby użyć nazwy piętra/strefy z HA.',
  icon: 'Pozostaw puste, żeby użyć ikony piętra/strefy z HA (fallback: mdi:home).',
  room_tap_action:
    'Dowolna akcja HA: Przejdź, Więcej info, Wywołaj usługę itd. Dotyczy wierszy i kafli; nadpisanie per pokój w sekcji „Pomieszczenia".',
  room_icon_tap_action:
    'Dowolna akcja HA dla samej ikony. Gdy ustawiona, klik w ikonę nie odpala akcji wiersza.',
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
    // accent_mode: default = 'lights' (bez koloru) / 'static' (z kolorem).
    // Zapisujemy tylko odstępstwa od tej reguły.
    if (raw.accent_mode === 'static' && !raw.accent_color) {
      out.accent_mode = 'static';
    } else if (raw.accent_mode === 'lights' && raw.accent_color) {
      out.accent_mode = 'lights';
    }
    // Preset wiersza — 'fill' jest defaultem, zapisujemy tylko inne.
    if (!isTile && raw.preset && raw.preset !== 'fill') out.preset = raw.preset;
    // Suwak gestem — default true, zapisujemy tylko wyłączenie.
    if (!isTile && raw.slider === false) out.slider = false;
    // Mini-switch świateł (H4) — default false, zapisujemy tylko włączenie.
    if (!isTile && raw.lights_switch === true) out.lights_switch = true;
    if (
      !isTile &&
      typeof raw.lights_switch_glow_on === 'number' &&
      raw.lights_switch_glow_on !== 100
    ) {
      out.lights_switch_glow_on = raw.lights_switch_glow_on;
    }
    if (
      !isTile &&
      typeof raw.lights_switch_glow_off === 'number' &&
      raw.lights_switch_glow_off !== 30
    ) {
      out.lights_switch_glow_off = raw.lights_switch_glow_off;
    }
    if (!isTile && raw.lights_switch_show_off === false) {
      out.lights_switch_show_off = false;
    }
    // Kolory pól sekcji info — zapisujemy niepustą mapę (row i tile).
    if (raw.field_colors && Object.keys(raw.field_colors).length > 0) {
      out.field_colors = raw.field_colors;
    }
    // Układ statusów — default 'right', zapisujemy tylko 'two-line'.
    if (!isTile && raw.status_layout === 'two-line') {
      out.status_layout = 'two-line';
    }
    if (raw.show_icon === false) out.show_icon = false;
    if (raw.show_name === false) out.show_name = false;
    const defaultRadius = isTile ? 14 : 6;
    const defaultPadding = isTile ? 12 : 10;
    const defaultMinH = isTile ? 110 : 85;
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

  // ===== Belka popupu pomieszczenia (popup_header) =====

  private _updatePopupHeader(
    patch: Partial<import('./types.js').PopupHeaderConfig>,
  ): void {
    if (!this._config) return;
    const merged: import('./types.js').PopupHeaderConfig = {
      ...(this._config.popup_header ?? {}),
      ...patch,
    };
    // Cleanup defaultów — trzymamy w configu tylko odstępstwa.
    const effStyle = merged.style ?? 'classic';
    // subtitle 'none' jest znaczący dla stylu avatar (jego default = areas).
    if (!merged.subtitle || (merged.subtitle === 'none' && effStyle !== 'avatar')) {
      delete merged.subtitle;
    }
    if (merged.style === 'classic') delete merged.style;
    if (merged.title_size === 'md') delete merged.title_size;
    if (merged.title_weight === 600) delete merged.title_weight;
    if (!merged.title_color) delete merged.title_color;
    if (!merged.hide_icon) delete merged.hide_icon;
    if (merged.icon_size === undefined) delete merged.icon_size;
    if (!merged.icon_color) delete merged.icon_color;
    if (!merged.icon_bg_color) delete merged.icon_bg_color;
    if (merged.padding === undefined) delete merged.padding;
    if (merged.chips_position === 'inline') delete merged.chips_position;
    if (merged.divider !== false) delete merged.divider;
    if (!merged.accent_bar) delete merged.accent_bar;
    if (!merged.accent_color) delete merged.accent_color;
    const next: StratumCardConfig = { ...this._config };
    if (Object.keys(merged).length === 0) delete next.popup_header;
    else next.popup_header = merged;
    this._emitConfig(next);
  }

  private _phSeg<T extends string | number>(
    label: string,
    options: Array<{ value: T; label: string }>,
    current: T,
    onPick: (v: T) => void,
    hint?: string,
  ): TemplateResult {
    return html`<div class="stratum-group">
      <label class="stratum-group-label">${label}</label>
      <div class="stratum-chip-row">
        ${options.map(
          (o) => html`<button
            type="button"
            class="stratum-chip ${current === o.value ? 'on' : ''}"
            @click=${() => onPick(o.value)}
          >
            <span>${o.label}</span>
          </button>`,
        )}
      </div>
      ${hint ? html`<p class="stratum-group-hint">${hint}</p>` : nothing}
    </div>`;
  }

  private _phColorInput(
    label: string,
    value: string | undefined,
    onChange: (v: string | undefined) => void,
  ): TemplateResult {
    return html`<div class="stratum-group">
      <label class="stratum-group-label">${label}</label>
      <input
        type="text"
        class="ph-input"
        placeholder="#hex, nazwa albo var(--color) — puste = domyślny"
        .value=${value ?? ''}
        @change=${(ev: Event) => {
          const v = (ev.target as HTMLInputElement).value.trim();
          onChange(v || undefined);
        }}
      />
    </div>`;
  }

  private _renderPopupHeaderPanel(): TemplateResult {
    const ph = this._config?.popup_header ?? {};
    const style = ph.style ?? 'classic';
    return html`
      ${this._phSeg(
        'Styl belki',
        [
          { value: 'classic', label: 'Klasyczny' },
          { value: 'avatar', label: 'Avatar' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'compact', label: 'Kompakt' },
        ] as const,
        style,
        (v) => this._updatePopupHeader({ style: v }),
        'Avatar = ikona w kółku + podtytuł; Gradient = belka podbarwiona akcentem; Kompakt = niska belka.',
      )}
      ${this._phSeg(
        'Rozmiar tytułu',
        [
          { value: 'sm', label: 'Mały' },
          { value: 'md', label: 'Średni' },
          { value: 'lg', label: 'Duży' },
        ] as const,
        ph.title_size ?? 'md',
        (v) => this._updatePopupHeader({ title_size: v }),
      )}
      ${this._phSeg(
        'Waga tytułu',
        [
          { value: 400, label: 'Normalna' },
          { value: 500, label: 'Średnia' },
          { value: 600, label: 'Semi-bold' },
          { value: 700, label: 'Bold' },
        ] as const,
        ph.title_weight ?? 600,
        (v) => this._updatePopupHeader({ title_weight: v }),
      )}
      ${this._phColorInput('Kolor tytułu', ph.title_color, (v) =>
        this._updatePopupHeader({ title_color: v }),
      )}
      ${this._phSeg(
        'Pozycja chipów',
        [
          { value: 'inline', label: 'Przy tytule' },
          { value: 'below', label: 'Druga linia' },
          { value: 'hidden', label: 'Ukryte' },
        ] as const,
        ph.chips_position ?? 'inline',
        (v) => this._updatePopupHeader({ chips_position: v }),
        'Druga linia = chipy pod tytułem, przewijane — najlepsze na telefonie przy wielu chipach.',
      )}
      ${this._phSeg(
        'Podtytuł pod nazwą',
        [
          { value: 'none', label: 'Brak' },
          { value: 'areas', label: 'Strefy scalone' },
          { value: 'entities', label: 'Liczba encji' },
        ] as const,
        ph.subtitle ?? (style === 'avatar' ? 'areas' : 'none'),
        (v) => this._updatePopupHeader({ subtitle: v }),
      )}
      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Rozmiar ikony</label>
        <div class="stratum-slider-value">${ph.icon_size ?? 28} px</div>
        <input
          type="range"
          class="stratum-slider"
          min="14"
          max="40"
          step="1"
          .value=${String(ph.icon_size ?? 28)}
          @input=${(ev: Event) =>
            this._updatePopupHeader({
              icon_size: parseInt((ev.target as HTMLInputElement).value, 10),
            })}
        />
      </div>
      <div class="stratum-slider-row">
        <label class="stratum-slider-label">Padding belki (dół)</label>
        <div class="stratum-slider-value">${ph.padding ?? 12} px</div>
        <input
          type="range"
          class="stratum-slider"
          min="4"
          max="24"
          step="1"
          .value=${String(ph.padding ?? 12)}
          @input=${(ev: Event) =>
            this._updatePopupHeader({
              padding: parseInt((ev.target as HTMLInputElement).value, 10),
            })}
        />
      </div>
      ${this._phColorInput('Kolor ikony', ph.icon_color, (v) =>
        this._updatePopupHeader({ icon_color: v }),
      )}
      ${this._phColorInput(
        'Kolor tła ikony (avatar/gradient)',
        ph.icon_bg_color,
        (v) => this._updatePopupHeader({ icon_bg_color: v }),
      )}
      ${this._phColorInput(
        'Kolor akcentu (gradient / pasek / tło ikony)',
        ph.accent_color,
        (v) => this._updatePopupHeader({ accent_color: v }),
      )}
      <div class="stratum-toggles-row">
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${ph.hide_icon === true}
            @change=${(ev: Event) =>
              this._updatePopupHeader({
                hide_icon: (ev.target as HTMLInputElement).checked || undefined,
              })}
          />
          <span>Ukryj ikonę pomieszczenia</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${ph.divider !== false}
            @change=${(ev: Event) =>
              this._updatePopupHeader({
                divider: (ev.target as HTMLInputElement).checked ? undefined : false,
              })}
          />
          <span>Separator pod belką</span>
        </label>
        <label class="stratum-toggle">
          <input
            type="checkbox"
            .checked=${ph.accent_bar === true}
            @change=${(ev: Event) =>
              this._updatePopupHeader({
                accent_bar: (ev.target as HTMLInputElement).checked || undefined,
              })}
          />
          <span>Akcentowy pasek z lewej</span>
        </label>
      </div>
    `;
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
    // Default = 0 (wyłączone — zwijaniem rządzi mechanizm sesyjny);
    // zapisujemy tylko gdy user jawnie ustawi timer.
    this._updateField('auto_collapse', v === 0 ? undefined : v);
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

  private _onRoomsSceneSize(value: 'sm' | 'md' | 'lg'): void {
    // Default = 'sm', więc zapisujemy tylko gdy inne.
    this._updateField('rooms_scene_size', value === 'sm' ? undefined : value);
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

          <div class="stratum-group">
            <label class="stratum-group-label">Kafle scen — rozmiar (globalnie)</label>
            <div class="stratum-chip-row">
              ${(
                [
                  { value: 'sm', label: 'Mały' },
                  { value: 'md', label: 'Średni' },
                  { value: 'lg', label: 'Duży' },
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
              Rozmiar kafli scen w popupach wszystkich pomieszczeń. Nadpisujesz
              per pomieszczenie w edycji pokoju → Sceny → „Rozmiar tile".
            </p>
          </div>

          <div class="stratum-group">
            <label class="stratum-group-label">Kafle scen — gradient (bez grafiki)</label>
            <div class="stratum-chip-row">
              ${(
                [
                  { value: 'mesh', label: 'Mgławica' },
                  { value: 'linear', label: 'Ukos' },
                  { value: 'glow', label: 'Poświata' },
                  { value: 'horizon', label: 'Horyzont' },
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
              Styl mieszania kolorów sceny na kaflach bez własnej grafiki.
              Mgławica = rozmyte plamy jak w aplikacji Hue. Nadpisujesz per
              pomieszczenie w edycji pokoju → Sceny.
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
          <p class="stratum-group-hint">
            Karta zwija się sama przy wyjściu z widoku i wygaszeniu ekranu
            (mechanizm sesyjny) — timer jest opcjonalnym dodatkiem, np. dla
            tabletu ściennego. „Wyłączone" = tylko mechanizm sesyjny.
          </p>

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
        ? [{ v: 'popup' as TapChoice, l: 'Popup pokoju', icon: 'mdi:dock-window' }]
        : []),
      { v: 'toggle-lights', l: 'Przełącz światła', icon: 'mdi:lightbulb-multiple-outline' },
      { v: 'none', l: 'Nic', icon: 'mdi:cancel' },
      { v: 'custom', l: 'Niestandardowa…', icon: 'mdi:tune' },
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
        ?open=${this._openSections.has('popup-header')}
        @toggle=${(ev: Event) => this._onSectionToggle('popup-header', ev)}
      >
        <summary class="stratum-panel-header">
          <span class="stratum-panel-avatar header-avatar">
            <ha-icon .icon=${'mdi:dock-top'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Belka popupu pomieszczenia</h3>
            <p class="stratum-panel-hint">
              Nagłówek popupu: styl, tytuł, ikona, pozycja chipów, podtytuł,
              separator, akcent. Obowiązuje we wszystkich pokojach.
            </p>
          </div>
        </summary>
        <div class="stratum-panel-body">${this._renderPopupHeaderPanel()}</div>
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
          ${this._renderTapGroup(
            'room_tap_action',
            'Klik na wiersz',
            'Popup pokoju (domyślnie)',
            'Reakcja na kliknięcie całego wiersza. Dotyczy też kafli. Per pokój nadpiszesz w sekcji „Pomieszczenia".',
          )}
          ${this._renderTapGroup(
            'room_icon_tap_action',
            'Klik na ikonę',
            'Tak jak wiersz (domyślnie)',
            'Osobna reakcja dla stadionu ikony — np. ikona otwiera popup, a wiersz przełącza światła.',
          )}
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
          <p class="stratum-group-hint">
            Pasek pokazuje się między nagłówkiem a listą pomieszczeń
            (pozycja „Na górze"). Lista niżej to sceny wykryte ze WSZYSTKICH
            pomieszczeń piętra — ukryj okiem to, czego nie chcesz, dodaj
            separatory z nazwami pokoi albo sceny spoza piętra. Pierwsza
            zmiana utrwala listę i włącza pasek na karcie.
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

      /* Belka popupu — input koloru. */
      .ph-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.14));
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
        color: var(--primary-text-color);
        font: inherit;
        font-size: 13px;
      }
      .ph-input::placeholder {
        color: var(--secondary-text-color);
        opacity: 0.6;
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
