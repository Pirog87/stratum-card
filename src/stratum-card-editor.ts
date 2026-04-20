// Wizualny editor karty Stratum.
//
// Renderuje natywny `<ha-form>` z deklaratywnym schema. HA dostarcza wszystkie
// selektory (area, icon, boolean, text), my tylko opisujemy strukturę i etykiety.
// Każda zmiana wartości emituje event `config-changed` z pełnym configiem —
// tak wymaga dashboard editor HA.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  RoomConfig,
  SceneBarConfig,
  StratumCardConfig,
} from './types.js';
import './stratum-card-rooms-editor.js';
import './stratum-scene-editor.js';

interface FormSchemaItem {
  name: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  type?: string;
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
      <ha-form
        .hass=${this.hass}
        .data=${formData}
        .schema=${SCHEMA}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <div class="rooms-section">
        <h3>Pomieszczenia</h3>
        <p class="hint">
          Zaznacz pomieszczenia które mają się pokazać na liście. Możesz nadpisać
          nazwę, ikonę i akcję klik per pomieszczenie. Brak zaznaczeń = wszystkie
          pomieszczenia floor-a (auto-discover).
        </p>
        <stratum-card-rooms-editor
          .hass=${this.hass}
          .floorId=${this._config.floor_id ?? ''}
          .areaId=${this._config.area_id ?? ''}
          .rooms=${this._config.rooms ?? []}
          @rooms-changed=${this._roomsChanged}
        ></stratum-card-rooms-editor>
      </div>

      <div class="scenes-section">
        <h3>Sceny</h3>
        <p class="hint">
          Pasek scen w karcie — ponad lub pod listą pomieszczeń. Każda scena
          może mieć obrazek, własną ikonę i kolor.
        </p>
        <stratum-scene-editor
          .hass=${this.hass}
          .config=${this._config.scenes ?? { items: [] }}
          @scenes-changed=${this._scenesChanged}
        ></stratum-scene-editor>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-form {
      display: block;
    }
    .rooms-section {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--divider-color);
    }
    .rooms-section h3,
    .scenes-section h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
    }
    .scenes-section {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--divider-color);
    }
    .hint {
      margin: 0 0 10px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-editor': StratumCardEditor;
  }
}
