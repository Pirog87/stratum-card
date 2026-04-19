// Wizualny editor karty Stratum.
//
// Renderuje natywny `<ha-form>` z deklaratywnym schema. HA dostarcza wszystkie
// selektory (area, icon, boolean, text), my tylko opisujemy strukturę i etykiety.
// Każda zmiana wartości emituje event `config-changed` z pełnym configiem —
// tak wymaga dashboard editor HA.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, RoomConfig, StratumCardConfig } from './types.js';
import './stratum-card-rooms-editor.js';

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
  { name: 'room_tap_action', selector: { ui_action: {} } },
];

const LABELS: Record<string, string> = {
  floor_id: 'Piętro (floor)',
  area_id: 'Pojedyncza strefa (area) — alternatywa',
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  expanded: 'Rozwinięta domyślnie',
  debug: 'Debug log w konsoli',
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
  room_tap_action:
    'Navigate z placeholderami {area_id}/{area_name} — np. /dashboard-domek/home#{area_id}.',
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
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
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
    .rooms-section h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
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
