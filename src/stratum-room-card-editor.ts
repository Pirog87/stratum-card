// Wizualny editor karty stratum-room-card.
//
// Pole area_id jest wymagane. merge_with (multi-area) i sections siedzą w
// expandable — ukrywają zaawansowane opcje gdy user ich nie potrzebuje.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  RoomSectionConfig,
  RoomSectionType,
  SceneBarConfig,
  StratumRoomCardConfig,
} from './types.js';
import './stratum-scene-editor.js';
import './stratum-sections-editor.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import { langOf, lookup, messages, type Lang } from './localize/localize.js';
import { editorMessages, localizeUi } from './localize/editor-localize.js';

interface FormSchemaItem {
  name: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  type?: string;
  schema?: FormSchemaItem[];
  title?: string;
  icon?: string;
}

// Schemat zależy od języka (tytuły sekcji formularza, nazwy typów sekcji).
// Budujemy go raz na język — ha-form przebudowuje się przy nowej tożsamości
// schematu, więc świeża tablica przy każdym renderze gubiłaby fokus pola.
const SCHEMA_CACHE = new Map<Lang, readonly FormSchemaItem[]>();
const SECTION_OPTIONS: RoomSectionType[] = [
  'scenes',
  'lights',
  'covers',
  'windows',
  'doors',
  'climate',
  'media',
  'fans',
  'switches',
];

function schemaFor(lang: Lang): readonly FormSchemaItem[] {
  let schema = SCHEMA_CACHE.get(lang);
  if (!schema) {
    schema = buildSchema(lang);
    SCHEMA_CACHE.set(lang, schema);
  }
  return schema;
}

const buildSchema = (lang: Lang): readonly FormSchemaItem[] => [
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
    title: localizeUi(lang, 'editor.room_card.merge'),
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
    title: localizeUi(lang, 'editor.room_card.sections_auto'),
    icon: 'mdi:view-dashboard-outline',
    schema: [
      {
        name: 'sections',
        selector: {
          select: {
            multiple: true,
            mode: 'list',
            options: SECTION_OPTIONS.map((value) => ({
              value,
              label: messages(lang).sections[value],
            })),
          },
        },
      },
    ],
  },
  { name: 'debug', selector: { boolean: {} } },
];





@customElement('stratum-room-card-editor')
export class StratumRoomCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumRoomCardConfig;

  public setConfig(config: StratumRoomCardConfig): void {
    this._config = config;
  }

  private _computeLabel = (schema: FormSchemaItem): string =>
    lookup(editorMessages(this.hass).room_card.labels, schema.name) ?? schema.name;

  private _computeHelper = (schema: FormSchemaItem): string =>
    lookup(editorMessages(this.hass).room_card.helpers, schema.name) ?? '';

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

  private _scenesChanged(ev: CustomEvent<{ scenes: SceneBarConfig }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumRoomCardConfig = { ...this._config };
    const items = ev.detail.scenes.items ?? [];
    if (items.length === 0) delete next.scenes;
    else next.scenes = ev.detail.scenes;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _sectionsChanged(ev: CustomEvent<{ sections: RoomSectionConfig[] }>): void {
    ev.stopPropagation();
    if (!this._config) return;
    const next: StratumRoomCardConfig = { ...this._config };
    if (ev.detail.sections.length === 0) delete next.sections;
    else next.sections = ev.detail.sections;
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
      <div class="stratum-panel base-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:floor-plan'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${localizeUi(this.hass, 'editor.room_card.room')}</h3>
            <p class="stratum-panel-hint">
              ${localizeUi(this.hass, 'editor.room_card.room_hint')}
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <ha-form
            .hass=${this.hass}
            .data=${this._config}
            .schema=${schemaFor(langOf(this.hass))}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._valueChanged}
          ></ha-form>
        </div>
      </div>

      <div class="stratum-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:view-dashboard-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${localizeUi(this.hass, 'editor.room_card.sections')}</h3>
            <p class="stratum-panel-hint">
              ${localizeUi(this.hass, 'editor.room_card.sections_hint')}
            </p>
          </div>
        </div>
        <div class="stratum-panel-body">
          <stratum-sections-editor
            .hass=${this.hass}
            .sections=${this._normalizedSections()}
            @sections-changed=${this._sectionsChanged}
          ></stratum-sections-editor>
        </div>
      </div>

      <div class="stratum-panel">
        <div class="stratum-panel-header">
          <span class="stratum-panel-avatar">
            <ha-icon .icon=${'mdi:palette-outline'}></ha-icon>
          </span>
          <div class="stratum-panel-title">
            <h3>${localizeUi(this.hass, 'editor.room_card.scenes')}</h3>
            <p class="stratum-panel-hint">
              ${localizeUi(this.hass, 'editor.room_card.scenes_hint')}
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

  private _normalizedSections(): RoomSectionConfig[] {
    const raw = this._config?.sections ?? [];
    return raw.map((s) => (typeof s === 'string' ? { type: s } : s));
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
    'stratum-room-card-editor': StratumRoomCardEditor;
  }
}
