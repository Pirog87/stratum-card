// Wizualny editor karty stratum-room-card.
//
// Pole area_id jest wymagane. merge_with (multi-area) i sections siedzą w
// expandable — ukrywają zaawansowane opcje gdy user ich nie potrzebuje.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, StratumRoomCardConfig } from './types.js';

interface FormSchemaItem {
  name: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  type?: string;
  schema?: FormSchemaItem[];
  title?: string;
  icon?: string;
}

const SCHEMA: readonly FormSchemaItem[] = [
  { name: 'area_id', required: true, selector: { area: {} } },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Scal z innymi pomieszczeniami',
    icon: 'mdi:link-variant',
    schema: [
      {
        name: 'merge_with',
        selector: { area: { multiple: true } },
      },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Sekcje (auto-wykrycie gdy puste)',
    icon: 'mdi:view-dashboard-outline',
    schema: [
      {
        name: 'sections',
        selector: {
          select: {
            multiple: true,
            mode: 'list',
            options: [
              { value: 'scenes', label: 'Sceny' },
              { value: 'lights', label: 'Światła' },
              { value: 'covers', label: 'Rolety' },
              { value: 'windows', label: 'Okna' },
              { value: 'doors', label: 'Drzwi' },
              { value: 'climate', label: 'Klimat' },
              { value: 'media', label: 'Media' },
              { value: 'fans', label: 'Wentylacja' },
              { value: 'switches', label: 'Przełączniki' },
            ],
          },
        },
      },
    ],
  },
  { name: 'debug', selector: { boolean: {} } },
];

const LABELS: Record<string, string> = {
  area_id: 'Pomieszczenie (area)',
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  merge_with: 'Dodatkowe pomieszczenia scalane do tego widoku',
  sections: 'Sekcje do wyświetlenia',
  debug: 'Debug log w konsoli',
};

const HELPERS: Record<string, string> = {
  area_id: 'Primary area — źródło encji, nazwy i ikony.',
  merge_with:
    'Encje z tych area dolicza się do sekcji (np. Garderoba + Łazienka do Sypialni).',
  sections:
    'Zostaw pusto aby sekcje wybierały się same na podstawie encji w pomieszczeniu.',
  debug: 'console.log listy encji przy każdym renderze.',
};

@customElement('stratum-room-card-editor')
export class StratumRoomCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumRoomCardConfig;

  public setConfig(config: StratumRoomCardConfig): void {
    this._config = config;
  }

  private _computeLabel = (schema: FormSchemaItem): string =>
    LABELS[schema.name] ?? schema.name;

  private _computeHelper = (schema: FormSchemaItem): string =>
    HELPERS[schema.name] ?? '';

  private _valueChanged(ev: CustomEvent<{ value: StratumRoomCardConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumRoomCardConfig = {
      ...this._config,
      ...ev.detail.value,
      type: this._config.type ?? 'custom:stratum-room-card',
    };
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: next },
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
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-form {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-room-card-editor': StratumRoomCardEditor;
  }
}
