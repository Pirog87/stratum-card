// Editor paska scen.
//
// Pola globalne: position / size / columns / aspect.
// Lista scen jako zwijane wiersze (jak rooms-editor): czek + chevron góra/dół
// + ołówek edycji, pod expanderem pola per-scena (entity/name/icon/image/color).

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  SceneBarConfig,
  SceneConfig,
  TapActionConfig,
} from './types.js';
import {
  SCENE_PRESETS,
  presetIdFromValue,
  resolveSceneImage,
} from './scene-presets.js';
import { getEntitiesInArea, filterByDomain } from './area-entities.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const GLOBAL_SCHEMA = [
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'position',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'top', label: 'Na górze' },
              { value: 'bottom', label: 'Na dole' },
            ],
          },
        },
      },
      {
        name: 'size',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'sm', label: 'Mały' },
              { value: 'md', label: 'Średni' },
              { value: 'lg', label: 'Duży' },
            ],
          },
        },
      },
    ],
  },
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'columns',
        selector: { number: { min: 1, max: 6, step: 1, mode: 'box' } },
      },
      { name: 'aspect', selector: { text: {} } },
    ],
  },
];

const GLOBAL_LABELS: Record<string, string> = {
  position: 'Pozycja paska',
  size: 'Rozmiar tile',
  columns: 'Kolumny',
  aspect: 'Proporcje tile (CSS)',
};

const GLOBAL_HELPERS: Record<string, string> = {
  aspect: 'Przykłady: 1/1 (kwadrat, default), 16/9, 270/150.',
};

const SCENE_FIELDS_SCHEMA = [
  { name: 'entity', required: true, selector: { entity: { domain: ['scene', 'script'] } } },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  { name: 'image', selector: { image: {} } },
  { name: 'color', selector: { text: {} } },
  { name: 'tap_action', selector: { ui_action: {} } },
];

const SCENE_LABELS: Record<string, string> = {
  entity: 'Encja sceny (scene.* lub script.*)',
  name: 'Nazwa (override)',
  icon: 'Ikona (gdy brak obrazu)',
  image: 'URL obrazu tła',
  color: 'Kolor tła (gdy brak obrazu)',
  tap_action: 'Akcja po kliknięciu (override)',
};

const SCENE_HELPERS: Record<string, string> = {
  image:
    'Wgraj plik (trafi do storage HA) albo wpisz ścieżkę z serwera, np. /local/img/HUE_Jasne.png. Puste = tryb ikona+kolor.',
  color: 'np. amber, #ff9b42. Domyślnie primary-color.',
  tap_action:
    'Domyślnie wywołuje scene.turn_on (lub script.turn_on). Nadpisuj tylko gdy potrzebujesz innego.',
};

@customElement('stratum-scene-editor')
export class StratumSceneEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public config: SceneBarConfig = { items: [] };

  /**
   * Obszar do auto-wykrywania scen. Gdy `config.items` puste, edytor pokazuje
   * sceny obszaru jako edytowalną listę — pierwsza zmiana (nazwa, grafika,
   * ukrycie, kolejność) utrwala całą listę w konfiguracji.
   */
  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @state() private _openScenes = new Set<number>();

  /** Sceny obszaru jako domyślne itemy (auto-discovery). */
  private _autoItems(): SceneConfig[] {
    if (!this.hass || !this.areaId) return [];
    return filterByDomain(getEntitiesInArea(this.hass, this.areaId), 'scene').map(
      (e) => ({ entity: e.entity_id }),
    );
  }

  /** Czy pracujemy na liście auto (nic nie zapisano w configu). */
  private get _isAuto(): boolean {
    return (this.config.items ?? []).length === 0;
  }

  /** Lista robocza: explicit z configu albo zmaterializowane auto. */
  private _workingItems(): SceneConfig[] {
    const items = this.config.items ?? [];
    return items.length > 0 ? items : this._autoItems();
  }

  private _computeGlobalLabel = (schema: { name: string }): string =>
    GLOBAL_LABELS[schema.name] ?? schema.name;

  private _computeGlobalHelper = (schema: { name: string }): string =>
    GLOBAL_HELPERS[schema.name] ?? '';

  private _computeSceneLabel = (schema: { name: string }): string =>
    SCENE_LABELS[schema.name] ?? schema.name;

  private _computeSceneHelper = (schema: { name: string }): string =>
    SCENE_HELPERS[schema.name] ?? '';

  private _emit(next: SceneBarConfig): void {
    this.dispatchEvent(
      new CustomEvent('scenes-changed', {
        detail: { scenes: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onGlobalChange(ev: CustomEvent<{ value: Partial<SceneBarConfig> }>): void {
    ev.stopPropagation();
    const next: SceneBarConfig = {
      ...this.config,
      ...ev.detail.value,
      items: this.config.items ?? [],
    };
    if (!next.position) delete next.position;
    if (!next.size) delete next.size;
    if (!next.columns) delete next.columns;
    if (!next.aspect) delete next.aspect;
    this._emit(next);
  }

  private _updateScene(index: number, patch: Partial<SceneConfig>): void {
    const items = [...this._workingItems()];
    if (index < 0 || index >= items.length) return;
    const prev = items[index]!;
    const merged: SceneConfig = { ...prev, ...patch };
    if (!merged.name) delete merged.name;
    if (!merged.icon) delete merged.icon;
    if (!merged.image) delete merged.image;
    if (!merged.color) delete merged.color;
    if (!merged.hidden) delete merged.hidden;
    if (!merged.tap_action || (merged.tap_action as TapActionConfig).action === 'none') {
      delete merged.tap_action;
    }
    items[index] = merged;
    this._emit({ ...this.config, items });
  }

  private _onSceneFieldChange(
    index: number,
    ev: CustomEvent<{ value: Partial<SceneConfig> }>,
  ): void {
    ev.stopPropagation();
    this._updateScene(index, ev.detail.value);
  }

  private _addScene(): void {
    const items = [...this._workingItems(), { entity: '' } as SceneConfig];
    this._emit({ ...this.config, items });
    this._openScenes = new Set([...this._openScenes, items.length - 1]);
  }

  private _removeScene(index: number): void {
    const items = this._workingItems().filter((_, i) => i !== index);
    this._emit({ ...this.config, items });
    const nextOpen = new Set<number>();
    for (const i of this._openScenes) {
      if (i === index) continue;
      nextOpen.add(i > index ? i - 1 : i);
    }
    this._openScenes = nextOpen;
  }

  /** Powrót do auto-wykrywania — kasuje zapisaną listę scen. */
  private _resetToAuto(): void {
    this._openScenes = new Set();
    this._emit({ ...this.config, items: [] });
  }

  private _moveScene(index: number, direction: -1 | 1): void {
    const items = [...this._workingItems()];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
    this._emit({ ...this.config, items });
    // Przesuń też state _openScenes
    const nextOpen = new Set<number>();
    for (const i of this._openScenes) {
      if (i === index) nextOpen.add(target);
      else if (i === target) nextOpen.add(index);
      else nextOpen.add(i);
    }
    this._openScenes = nextOpen;
  }

  private _toggleEdit(index: number): void {
    const next = new Set(this._openScenes);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this._openScenes = next;
  }

  private _sceneTitle(scene: SceneConfig): string {
    if (scene.name) return scene.name;
    const state = this.hass?.states?.[scene.entity];
    return (state?.attributes?.friendly_name as string | undefined) ?? scene.entity ?? '(nowa scena)';
  }

  private _selectPreset(index: number, id: string | null): void {
    this._updateScene(index, { image: id ? `stratum:${id}` : undefined });
  }

  private _renderPresetPicker(index: number, scene: SceneConfig): TemplateResult {
    const selected = presetIdFromValue(scene.image);
    return html`
      <div class="preset-block">
        <div class="preset-head">
          <span>Wbudowane grafiki</span>
          ${selected
            ? html`<button class="reset" @click=${() => this._selectPreset(index, null)}>
                Wyczyść wybór
              </button>`
            : nothing}
        </div>
        <div class="preset-grid">
          ${SCENE_PRESETS.map(
            (p) => html`
              <button
                class="preset-thumb ${selected === p.id ? 'selected' : ''}"
                title=${p.label}
                @click=${() => this._selectPreset(index, p.id)}
              >
                <span
                  class="thumb-image"
                  style=${`background-image:url("${resolveSceneImage('stratum:' + p.id)}");`}
                ></span>
                <span class="thumb-label">${p.label}</span>
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  protected render(): TemplateResult {
    const items = this._workingItems();
    const auto = this._isAuto;
    return html`
      ${auto && items.length > 0
        ? html`<p class="auto-hint">
            <ha-icon .icon=${'mdi:auto-fix'}></ha-icon>
            Sceny wykryte automatycznie z obszaru (${items.length}). Każda
            zmiana — nazwa, grafika, ukrycie, kolejność — utrwali tę listę
            w konfiguracji pokoju.
          </p>`
        : nothing}
      ${!auto && items.length > 0
        ? html`<button class="reset-auto" @click=${this._resetToAuto}>
            <ha-icon .icon=${'mdi:auto-fix'}></ha-icon>
            Przywróć auto-wykrywanie z obszaru
          </button>`
        : nothing}
      ${items.length > 0
        ? html`<ha-form
            .hass=${this.hass}
            .data=${this.config}
            .schema=${GLOBAL_SCHEMA}
            .computeLabel=${this._computeGlobalLabel}
            .computeHelper=${this._computeGlobalHelper}
            @value-changed=${this._onGlobalChange}
          ></ha-form>`
        : nothing}

      <div class="stratum-list scenes-list">
        ${items.map((scene, idx) => {
          const open = this._openScenes.has(idx);
          const thumb = resolveSceneImage(scene.image);
          return html`
            <div class="stratum-row active ${scene.hidden ? 'scene-hidden' : ''}">
              <div class="stratum-row-head">
                <span
                  class="stratum-row-avatar ${thumb ? 'scene-thumb' : ''}"
                  style=${thumb ? `background-image:url("${thumb}");` : ''}
                >
                  ${thumb
                    ? nothing
                    : html`<ha-icon
                        .icon=${scene.icon ?? 'mdi:palette'}
                      ></ha-icon>`}
                </span>
                <span class="stratum-row-title">${this._sceneTitle(scene)}</span>
                ${scene.hidden
                  ? html`<span class="stratum-badge ghost">ukryta</span>`
                  : nothing}
                <div class="stratum-row-actions">
                  <button
                    class="stratum-icon-btn"
                    title=${scene.hidden ? 'Pokaż scenę' : 'Ukryj scenę'}
                    @click=${() =>
                      this._updateScene(idx, { hidden: !scene.hidden })}
                  >
                    <ha-icon
                      .icon=${scene.hidden ? 'mdi:eye-off' : 'mdi:eye'}
                    ></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title="Przesuń w górę"
                    ?disabled=${idx === 0}
                    @click=${() => this._moveScene(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title="Przesuń w dół"
                    ?disabled=${idx === items.length - 1}
                    @click=${() => this._moveScene(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn ${open ? 'accent' : ''}"
                    title=${open ? 'Zwiń' : 'Edytuj'}
                    @click=${() => this._toggleEdit(idx)}
                  >
                    <ha-icon .icon=${open ? 'mdi:chevron-up' : 'mdi:pencil'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn danger"
                    title="Usuń"
                    @click=${() => this._removeScene(idx)}
                  >
                    <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
                  </button>
                </div>
              </div>
              ${open
                ? html`<div class="stratum-row-sub">
                    <ha-form
                      .hass=${this.hass}
                      .data=${scene}
                      .schema=${SCENE_FIELDS_SCHEMA}
                      .computeLabel=${this._computeSceneLabel}
                      .computeHelper=${this._computeSceneHelper}
                      @value-changed=${(ev: CustomEvent<{ value: Partial<SceneConfig> }>) =>
                        this._onSceneFieldChange(idx, ev)}
                    ></ha-form>
                    ${this._renderPresetPicker(idx, scene)}
                  </div>`
                : nothing}
            </div>
          `;
        })}
      </div>
      <button class="stratum-add-btn" @click=${this._addScene}>
        <ha-icon .icon=${'mdi:plus'}></ha-icon>
        Dodaj scenę
      </button>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .scenes-list {
        margin-top: 12px;
      }

      .auto-hint {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 10px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px dashed var(--divider-color, rgba(255, 255, 255, 0.16));
        background: rgba(255, 255, 255, 0.03);
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .auto-hint ha-icon {
        --mdc-icon-size: 16px;
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--primary-color, #ff9b42);
      }

      .reset-auto {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 10px;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.16));
        background: transparent;
        font-size: 12px;
        color: var(--secondary-text-color);
        cursor: pointer;
      }

      .reset-auto:hover {
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
      }

      .reset-auto ha-icon {
        --mdc-icon-size: 14px;
      }

      .scene-thumb {
        background-size: cover;
        background-position: center;
      }

      .scene-hidden .stratum-row-title,
      .scene-hidden .stratum-row-avatar {
        opacity: 0.4;
      }

      .preset-block {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--divider-color);
      }

      .preset-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--secondary-text-color);
        margin-bottom: 6px;
      }

      .reset {
        background: transparent;
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 11px;
        color: var(--secondary-text-color);
        cursor: pointer;
        text-transform: none;
        letter-spacing: 0;
      }

      .reset:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .preset-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
        gap: 8px;
      }

      .preset-thumb {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: 0;
        border: 2px solid transparent;
        border-radius: 10px;
        background: transparent;
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.12s ease, border-color 0.12s ease,
          box-shadow 0.12s ease;
      }

      .preset-thumb:hover {
        transform: translateY(-1px);
        border-color: var(--divider-color);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
      }

      .preset-thumb.selected {
        border-color: var(--primary-color, #ff9b42);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color, #ff9b42) 25%, transparent);
      }

      .thumb-image {
        display: block;
        aspect-ratio: 16/9;
        background-size: cover;
        background-position: center;
        border-radius: 8px 8px 0 0;
      }

      .thumb-label {
        padding: 5px 0;
        font-size: 11px;
        font-weight: 500;
        color: var(--primary-text-color);
        text-align: center;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-scene-editor': StratumSceneEditor;
  }
}
