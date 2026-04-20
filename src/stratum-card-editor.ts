// Wizualny editor karty Stratum.
//
// Renderuje natywny `<ha-form>` z deklaratywnym schema. HA dostarcza wszystkie
// selektory (area, icon, boolean, text), my tylko opisujemy strukturę i etykiety.
// Każda zmiana wartości emituje event `config-changed` z pełnym configiem —
// tak wymaga dashboard editor HA.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  DisplayConditionConfig,
  DisplayConfig,
  HomeAssistant,
  RoomConfig,
  SceneBarConfig,
  StratumCardConfig,
} from './types.js';
import './stratum-card-rooms-editor.js';
import './stratum-scene-editor.js';
import './stratum-conditions-editor.js';
import './stratum-display-editor.js';
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

const SCHEMA: readonly FormSchemaItem[] = [
  { name: 'floor_id', selector: { floor: {} } },
  { name: 'area_id', selector: { area: {} } },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'expanded', selector: { boolean: {} } },
      { name: 'debug', selector: { boolean: {} } },
    ],
  },
  {
    name: 'auto_collapse',
    selector: {
      number: { min: 0, max: 600, step: 5, unit_of_measurement: 's', mode: 'slider' },
    },
  },
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'rooms_display',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'row', label: 'Wiersz (poziomy, pełna szerokość)' },
              { value: 'tile', label: 'Kafel (card z licznikami)' },
            ],
          },
        },
      },
      {
        name: 'rooms_tile_min_width',
        selector: {
          number: { min: 120, max: 280, step: 10, unit_of_measurement: 'px', mode: 'box' },
        },
      },
    ],
  },
  { name: 'room_tap_action', selector: { ui_action: {} } },
];

const LABELS: Record<string, string> = {
  floor_id: 'Piętro (floor)',
  area_id: 'Pojedyncza strefa (area) — alternatywa',
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  expanded: 'Rozwinięta domyślnie',
  debug: 'Debug log w konsoli',
  auto_collapse: 'Auto-zwijanie po (s)',
  rooms_display: 'Forma pozycji pomieszczeń',
  rooms_tile_min_width: 'Min. szerokość kafla (px)',
  room_tap_action: 'Akcja po kliknięciu w wiersz pomieszczenia',
};

const HELPERS: Record<string, string> = {
  floor_id:
    'Główny tryb — karta agreguje wszystkie strefy tego piętra. Wymaga HA 2024.3+.',
  area_id:
    'Użyj zamiast floor_id gdy chcesz kartę na jeden pokój. Wybierz JEDNO z pól.',
  name: 'Pozostaw puste, żeby użyć nazwy piętra/strefy z HA.',
  icon: 'Pozostaw puste, żeby użyć ikony piętra/strefy z HA (fallback: mdi:home).',
  expanded: 'Czy expander startuje otwarty.',
  debug: 'Włącza console.log z encjami area — pomocne w configu.',
  auto_collapse:
    'Karta zwija się sama po N sekundach bez interakcji. 0 = wyłączone. Domyślnie 60 s.',
  rooms_display:
    'Domyślny wygląd pomieszczeń — wiersz albo kafel. Możesz nadpisać per pomieszczenie w sekcji poniżej.',
  rooms_tile_min_width:
    'Minimalna szerokość kafla — wpływa na liczbę kolumn (auto-fill). Default 160px.',
  room_tap_action:
    'Określa co się dzieje po kliknięciu wiersza pomieszczenia. Bez ustawienia klik nic nie robi. Dla "Przejdź" wypełnij pole „Ścieżka", np. /dashboard-domek/home#{area_id} — {area_id} i {area_name} są podmieniane automatycznie.',
};

@customElement('stratum-card-editor')
export class StratumCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumCardConfig;

  public setConfig(config: StratumCardConfig): void {
    this._config = config;
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

  private _displayConfigChanged(
    ev: CustomEvent<{ config: DisplayConfig }>,
  ): void {
    ev.stopPropagation();
    if (!this._config) return;
    const raw = ev.detail.config ?? {};
    const cleaned: DisplayConfig = {};

    if (raw.fields && raw.fields.length > 0) cleaned.fields = raw.fields;
    if (raw.aspect && raw.aspect.trim() !== '' && raw.aspect !== '1/1') {
      cleaned.aspect = raw.aspect;
    }
    if (raw.accent_color && raw.accent_color.trim() !== '') {
      cleaned.accent_color = raw.accent_color;
    }
    if (raw.background_image && raw.background_image.trim() !== '') {
      cleaned.background_image = raw.background_image;
    }
    if (raw.show_icon === false) cleaned.show_icon = false;
    if (raw.show_name === false) cleaned.show_name = false;

    if (typeof raw.border_radius === 'number' && raw.border_radius !== 14) {
      cleaned.border_radius = raw.border_radius;
    }
    if (typeof raw.padding === 'number' && raw.padding !== 12) {
      cleaned.padding = raw.padding;
    }
    if (typeof raw.min_height === 'number' && raw.min_height !== 110) {
      cleaned.min_height = raw.min_height;
    }
    if (typeof raw.icon_size === 'number' && raw.icon_size !== 22) {
      cleaned.icon_size = raw.icon_size;
    }
    if (raw.icon_style && raw.icon_style !== 'bubble') {
      cleaned.icon_style = raw.icon_style;
    }
    if (raw.icon_position && raw.icon_position !== 'top-left') {
      cleaned.icon_position = raw.icon_position;
    }
    if (raw.hover_effect && raw.hover_effect !== 'subtle') {
      cleaned.hover_effect = raw.hover_effect;
    }
    if (typeof raw.press_scale === 'number' && raw.press_scale !== 0.98) {
      cleaned.press_scale = raw.press_scale;
    }
    if (raw.conditions && raw.conditions.length > 0) {
      cleaned.conditions = raw.conditions;
    }

    const next: StratumCardConfig = { ...this._config };
    if (Object.keys(cleaned).length === 0) delete next.display_config;
    else next.display_config = cleaned;
    this._emitConfig(next);
  }

  private _conditionsChanged(
    ev: CustomEvent<{ conditions: DisplayConditionConfig[] }>,
  ): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumCardConfig = { ...this._config };
    const list = ev.detail.conditions;
    const current: DisplayConfig = { ...(next.display_config ?? {}) };
    if (list.length === 0) delete current.conditions;
    else current.conditions = list;
    if (Object.keys(current).length === 0) delete next.display_config;
    else next.display_config = current;
    this._emitConfig(next);
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
    // Merge defaults tak, żeby slider auto_collapse pokazywał 60 gdy config
    // nie ma tego pola (default = włączone 60s). Config-przesłania wygrywa.
    const formData = {
      auto_collapse: 60,
      ...this._config,
    };
    return html`
      <div class="stratum-panel base-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:home-floor-0'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Karta Stratum</h3>
            <p class="stratum-panel-hint">
              Wybierz piętro lub strefę, dostosuj nagłówek, domyślne zachowanie.
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <ha-form
            .hass=${this.hass}
            .data=${formData}
            .schema=${SCHEMA}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._valueChanged}
          ></ha-form>
        </div>
      </div>

      <div class="stratum-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:image-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Wygląd pomieszczeń (globalny)</h3>
            <p class="stratum-panel-hint">
              Jedno ustawienie dla całej karty — dotyczy zarówno wiersza jak i
              kafla. Per-pomieszczenie wybierzesz tylko formę i ewentualny CSS.
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <stratum-display-editor
            .config=${this._config.display_config ?? {}}
            @display-config-changed=${this._displayConfigChanged}
          ></stratum-display-editor>
        </div>
      </div>

      <div class="stratum-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:function-variant'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Warunki — styl zależny od encji</h3>
            <p class="stratum-panel-hint">
              Reguły zmieniające border, akcent lub tło w zależności od stanu.
              Pierwsza spełniona reguła wygrywa.
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <stratum-conditions-editor
            .hass=${this.hass}
            .conditions=${this._config.display_config?.conditions ?? []}
            @conditions-changed=${this._conditionsChanged}
          ></stratum-conditions-editor>
        </div>
      </div>

      <div class="stratum-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:view-list-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Pomieszczenia</h3>
            <p class="stratum-panel-hint">
              Zaznacz, posortuj, dostosuj widok popup per pomieszczenie. Brak zaznaczeń = auto-discover.
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <stratum-card-rooms-editor
            .hass=${this.hass}
            .floorId=${this._config.floor_id ?? ''}
            .areaId=${this._config.area_id ?? ''}
            .rooms=${this._config.rooms ?? []}
            @rooms-changed=${this._roomsChanged}
          ></stratum-card-rooms-editor>
        </div>
      </div>

      <div class="stratum-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:palette-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>Sceny</h3>
            <p class="stratum-panel-hint">
              Pasek scen w karcie. Każda scena ma obrazek (lub preset), własną ikonę i akcję.
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <stratum-scene-editor
            .hass=${this.hass}
            .config=${this._config.scenes ?? { items: [] }}
            @scenes-changed=${this._scenesChanged}
          ></stratum-scene-editor>
        </div>
      </div>
    `;
  }

  static styles = [
    editorSharedStyles,
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
