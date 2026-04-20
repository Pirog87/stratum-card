// Editor listy pomieszczeń — podkomponent głównego stratum-card-editor.
//
// Po wyborze floor_id w nadrzędnym edytorze, ten komponent pokazuje listę
// area należących do floor-a z checkboxem "Pokaż" per area. Dla każdej
// zaznaczonej — expandable z polami: nazwa, ikona, tap_action.
//
// Emituje `rooms-changed` z pełną listą RoomConfig[] kiedy user cokolwiek zmienia.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getAreasInFloor } from './area-entities.js';
import type {
  HomeAssistant,
  RoomConfig,
  RoomSectionConfig,
  SceneBarConfig,
  TapActionConfig,
} from './types.js';
import './stratum-sections-editor.js';
import './stratum-scene-editor.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const ROOM_LABELS: Record<string, string> = {
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  display: 'Forma wyświetlania',
  tap_action: 'Akcja po kliknięciu (override)',
  merge_with: 'Połącz z innymi pomieszczeniami',
  aggregate: 'Sposób agregacji',
};

const ROOM_HELPERS: Record<string, string> = {
  merge_with:
    'Wybrane pomieszczenia znikną jako osobne wiersze; ich encje doliczą się do tego.',
  aggregate:
    '„Suma" — światła/motion/temperatura liczone łącznie. „Tylko główne" — tylko encje primary, merge jest hierarchiczny.',
};

@customElement('stratum-card-rooms-editor')
export class StratumCardRoomsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: String, attribute: 'floor-id' }) public floorId = '';

  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @property({ attribute: false }) public rooms: RoomConfig[] = [];

  /** Zbior area_id których edytor jest otwarty. Reset przy zmianie floor/area. */
  @state() private _openRooms = new Set<string>();

  private _toggleEdit(areaId: string): void {
    const next = new Set(this._openRooms);
    if (next.has(areaId)) next.delete(areaId);
    else next.add(areaId);
    this._openRooms = next;
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('floorId') || changed.has('areaId')) {
      this._openRooms = new Set();
    }
  }

  private _computeRoomLabel = (schema: { name: string }): string =>
    ROOM_LABELS[schema.name] ?? schema.name;

  private _computeRoomHelper = (schema: { name: string }): string =>
    ROOM_HELPERS[schema.name] ?? '';

  private _roomSchemaFor(currentAreaId: string) {
    const floorAreas = this._availableAreas();
    const otherAreaIds = floorAreas
      .filter((a) => a.area_id !== currentAreaId)
      .map((a) => a.area_id);
    return [
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'name', selector: { text: {} } },
          { name: 'icon', selector: { icon: {} } },
        ],
      },
      {
        name: 'display',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: '', label: 'Domyślnie (z ustawień karty)' },
              { value: 'row', label: 'Wiersz (kompaktowy)' },
              { value: 'tile', label: 'Kafel' },
            ],
          },
        },
      },
      { name: 'tap_action', selector: { ui_action: {} } },
      {
        type: 'expandable',
        name: '',
        title: 'Połącz z innymi pomieszczeniami',
        icon: 'mdi:link-variant',
        schema: [
          {
            name: 'merge_with',
            selector: {
              select: {
                multiple: true,
                mode: 'list',
                options: otherAreaIds.map((id) => ({
                  value: id,
                  label: this.hass?.areas?.[id]?.name ?? id,
                })),
              },
            },
          },
          {
            name: 'aggregate',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  { value: 'sum', label: 'Suma (default)' },
                  { value: 'primary_only', label: 'Tylko główne' },
                ],
              },
            },
          },
        ],
      },
    ];
  }

  private _availableAreas() {
    if (!this.hass) return [];
    if (this.floorId) return getAreasInFloor(this.hass, this.floorId);
    if (this.areaId) {
      const area = this.hass.areas?.[this.areaId];
      return area ? [area] : [];
    }
    return [];
  }

  private _isVisible(areaId: string): boolean {
    // Pusta tablica `rooms` = auto-discover: wszystkie area są widoczne.
    if (this.rooms.length === 0) return true;
    const found = this.rooms.find((r) => r.area_id === areaId);
    if (found) return !found.hidden;
    // Explicit lista ale tej area nie ma — ukryta.
    return false;
  }

  private _getRoom(areaId: string): RoomConfig | undefined {
    return this.rooms.find((r) => r.area_id === areaId);
  }

  private _emitChange(next: RoomConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('rooms-changed', {
        detail: { rooms: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Materializuje obecny stan do explicit listy (używane gdy wychodzimy z auto-discover). */
  private _materialize(): RoomConfig[] {
    if (this.rooms.length > 0) return [...this.rooms];
    return this._availableAreas().map((a) => ({ area_id: a.area_id }));
  }

  private _toggleArea(areaId: string, show: boolean): void {
    const rooms = this._materialize();
    const existing = rooms.find((r) => r.area_id === areaId);
    let next: RoomConfig[];
    if (show) {
      if (existing) {
        next = rooms.map((r) =>
          r.area_id === areaId ? { ...r, hidden: false } : r,
        );
      } else {
        next = [...rooms, { area_id: areaId }];
      }
    } else {
      if (existing) {
        const hasOverrides =
          existing.name ||
          existing.icon ||
          existing.tap_action ||
          (existing.merge_with && existing.merge_with.length > 0);
        next = hasOverrides
          ? rooms.map((r) =>
              r.area_id === areaId ? { ...r, hidden: true } : r,
            )
          : rooms.filter((r) => r.area_id !== areaId);
      } else {
        next = [...rooms, { area_id: areaId, hidden: true }];
      }
    }
    this._emitChange(next);
  }

  private _updateRoom(areaId: string, patch: Partial<RoomConfig>): void {
    const existing = this._getRoom(areaId);
    const base: RoomConfig = existing ?? { area_id: areaId };
    const merged: RoomConfig = { ...base, ...patch, area_id: areaId };
    if (!merged.name) delete merged.name;
    if (!merged.icon) delete merged.icon;
    if (!merged.tap_action || (merged.tap_action as TapActionConfig).action === 'none') {
      delete merged.tap_action;
    }
    if (!merged.merge_with || merged.merge_with.length === 0) {
      delete merged.merge_with;
    }
    if (!merged.aggregate || merged.aggregate === 'sum') {
      delete merged.aggregate;
    }
    if (!merged.sections || merged.sections.length === 0) delete merged.sections;
    if (!merged.scenes || (merged.scenes.items ?? []).length === 0) {
      delete merged.scenes;
    }
    if (!merged.chips || merged.chips.length === 0) delete merged.chips;
    // `display` zachowujemy zawsze gdy ustawione (row albo tile) — świadomy
    // override globalnego `rooms_display`. Kasujemy tylko gdy pole puste.
    if (!merged.display) delete merged.display;
    if (
      !merged.field_entities ||
      Object.values(merged.field_entities).every(
        (v) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0),
      )
    ) {
      delete merged.field_entities;
    }
    if (!merged.style_override || merged.style_override.trim() === '') {
      delete merged.style_override;
    }
    const next = existing
      ? this.rooms.map((r) => (r.area_id === areaId ? merged : r))
      : [...this.rooms, merged];
    this._emitChange(next);
  }

  private _onSectionsChanged(
    areaId: string,
    ev: CustomEvent<{ sections: RoomSectionConfig[] }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, { sections: ev.detail.sections });
  }

  private _onScenesChanged(
    areaId: string,
    ev: CustomEvent<{ scenes: SceneBarConfig }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, { scenes: ev.detail.scenes });
  }

  private _renderFieldEntitiesPanel(
    areaId: string,
    room: RoomConfig | undefined,
  ): TemplateResult {
    const fieldSchema = [
      {
        name: 'temperature',
        selector: {
          entity: {
            filter: [
              { domain: 'sensor', device_class: 'temperature' },
              { domain: 'climate' },
            ],
          },
        },
      },
      {
        name: 'humidity',
        selector: {
          entity: { filter: [{ domain: 'sensor', device_class: 'humidity' }] },
        },
      },
      {
        name: 'lights',
        selector: { entity: { multiple: true, filter: [{ domain: 'light' }] } },
      },
      {
        name: 'motion',
        selector: {
          entity: {
            multiple: true,
            filter: [
              { domain: 'binary_sensor', device_class: 'motion' },
              { domain: 'binary_sensor', device_class: 'occupancy' },
            ],
          },
        },
      },
      {
        name: 'windows',
        selector: {
          entity: {
            multiple: true,
            filter: [{ domain: 'binary_sensor', device_class: 'window' }],
          },
        },
      },
      {
        name: 'doors',
        selector: {
          entity: {
            multiple: true,
            filter: [{ domain: 'binary_sensor', device_class: 'door' }],
          },
        },
      },
    ];
    const labels: Record<string, string> = {
      temperature: 'Temperatura (encja)',
      humidity: 'Wilgotność (encja)',
      lights: 'Światła (lista encji)',
      motion: 'Obecność / motion (lista encji)',
      windows: 'Okna (lista encji)',
      doors: 'Drzwi (lista encji)',
    };
    return html`
      <details class="stratum-collapsible">
        <summary>
          <ha-icon .icon=${'mdi:pin-outline'}></ha-icon>
          <span>Encje pól (override auto-discovery)</span>
        </summary>
        <div class="stratum-collapsible-body">
          <p class="stratum-collapsible-hint">
            Puste = bierzemy z area automatycznie. Ustaw aby wskazać konkretną
            encję (np. termometr z innej strefy) dla tego pomieszczenia.
          </p>
          <ha-form
            .hass=${this.hass}
            .data=${room?.field_entities ?? {}}
            .schema=${fieldSchema}
            .computeLabel=${(s: { name: string }) => labels[s.name] ?? s.name}
            @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown> }>) => {
              ev.stopPropagation();
              this._updateRoom(areaId, {
                field_entities: ev.detail.value as RoomConfig['field_entities'],
              });
            }}
          ></ha-form>
        </div>
      </details>
    `;
  }

  private _renderStyleOverridePanel(
    areaId: string,
    room: RoomConfig | undefined,
  ): TemplateResult {
    return html`
      <details class="stratum-collapsible">
        <summary>
          <ha-icon .icon=${'mdi:palette-swatch-outline'}></ha-icon>
          <span>Custom CSS (tylko ten pokój)</span>
        </summary>
        <div class="stratum-collapsible-body">
          <p class="stratum-collapsible-hint">
            Surowe CSS wstrzykiwane jako <code>style=""</code> na row/tile tego
            pokoju. Np. <code>background: #222; border-color: #ff9b42;</code>
          </p>
          <textarea
            class="stratum-css-input"
            rows="4"
            placeholder="background: ...; border: ...;"
            .value=${room?.style_override ?? ''}
            @input=${(ev: Event) => {
              const v = (ev.target as HTMLTextAreaElement).value;
              this._updateRoom(areaId, { style_override: v });
            }}
          ></textarea>
        </div>
      </details>
    `;
  }

  private _normalizedRoomSections(room: RoomConfig | undefined): RoomSectionConfig[] {
    const raw = room?.sections ?? [];
    return raw.map((s) => (typeof s === 'string' ? { type: s } : s));
  }

  private _onFieldChange(
    areaId: string,
    ev: CustomEvent<{ value: Partial<RoomConfig> }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, ev.detail.value);
  }

  /** Sortuje area: najpierw zaznaczone w kolejności z config.rooms, potem reszta z floor. */
  private _sortedAreas() {
    const floorAreas = this._availableAreas();
    const floorById = new Map(floorAreas.map((a) => [a.area_id, a]));
    const selectedInOrder = this.rooms
      .map((r) => floorById.get(r.area_id))
      .filter(<T,>(a: T | undefined): a is T => a !== undefined);
    const selectedIds = new Set(selectedInOrder.map((a) => a.area_id));
    const rest = floorAreas.filter((a) => !selectedIds.has(a.area_id));
    return [...selectedInOrder, ...rest];
  }

  private _selectAll(): void {
    // Jeśli nie ma override'ów — wracamy do auto-discover (pusta lista).
    // Jeśli są — materializujemy pełną listę z hidden:false, żeby zachować overrides.
    const hasOverrides = this.rooms.some(
      (r) => r.name || r.icon || r.tap_action || r.merge_with?.length,
    );
    if (!hasOverrides) {
      this._emitChange([]);
      return;
    }
    const floorAreas = this._availableAreas();
    const existingById = new Map(this.rooms.map((r) => [r.area_id, r]));
    const next = floorAreas.map(
      (a) => ({ ...(existingById.get(a.area_id) ?? { area_id: a.area_id }), hidden: false }),
    );
    this._emitChange(next);
  }

  private _deselectAll(): void {
    // Explicitnie: pełna lista z hidden:true (zero widocznych pokojów).
    // Bez tego pusta lista byłaby traktowana jako auto-discover = wszystkie widoczne.
    const floorAreas = this._availableAreas();
    const existingById = new Map(this.rooms.map((r) => [r.area_id, r]));
    const next = floorAreas.map((a) => ({
      ...(existingById.get(a.area_id) ?? { area_id: a.area_id }),
      hidden: true,
    }));
    this._emitChange(next);
  }

  private _moveRoom(areaId: string, direction: -1 | 1): void {
    const idx = this.rooms.findIndex((r) => r.area_id === areaId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= this.rooms.length) return;
    const next = [...this.rooms];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    this._emitChange(next);
  }

  private _getPosition(areaId: string): { index: number; total: number } {
    const idx = this.rooms.findIndex((r) => r.area_id === areaId);
    return { index: idx, total: this.rooms.length };
  }

  protected render(): TemplateResult | typeof nothing {
    const areas = this._sortedAreas();
    if (!this.hass) return nothing;
    if (areas.length === 0) {
      return html`<div class="stratum-empty">
        Wybierz piętro lub strefę wyżej — pojawi się tu lista pomieszczeń do
        wyboru.
      </div>`;
    }

    // Auto-discover (pusta lista rooms) pokazuje wszystkie area jako zaznaczone.
    const selectedCount =
      this.rooms.length === 0
        ? areas.length
        : this.rooms.filter((r) => !r.hidden).length;

    return html`
      <div class="stratum-toolbar">
        <span class="stratum-count">${selectedCount} / ${areas.length} zaznaczonych</span>
        <button type="button" class="stratum-pill-btn" @click=${this._selectAll}>
          <ha-icon .icon=${'mdi:checkbox-multiple-marked-outline'}></ha-icon>
          Zaznacz wszystkie
        </button>
        <button type="button" class="stratum-pill-btn" @click=${this._deselectAll}>
          <ha-icon .icon=${'mdi:checkbox-multiple-blank-outline'}></ha-icon>
          Odznacz wszystkie
        </button>
      </div>
      <div class="stratum-list">
        ${areas.map((area) => {
          const visible = this._isVisible(area.area_id);
          const room = this._getRoom(area.area_id);
          const hasOverrides = Boolean(
            room && (room.name || room.icon || room.tap_action),
          );
          const mergeCount = room?.merge_with?.length ?? 0;
          const mergedAwayInto = this.rooms.find((r) =>
            r.merge_with?.includes(area.area_id),
          );
          const editOpen = this._openRooms.has(area.area_id);
          return html`
            <div class="stratum-row ${visible ? 'active' : ''}">
              <div class="stratum-row-head">
                <input
                  type="checkbox"
                  class="room-check"
                  .checked=${visible}
                  @change=${(ev: Event) =>
                    this._toggleArea(area.area_id, (ev.target as HTMLInputElement).checked)}
                />
                <span class="stratum-row-avatar">
                  <ha-icon .icon=${area.icon ?? 'mdi:floor-plan'}></ha-icon>
                </span>
                <span class="stratum-row-title">${area.name}</span>
                ${mergeCount > 0
                  ? html`<span class="stratum-badge merge">+${mergeCount}</span>`
                  : nothing}
                ${mergedAwayInto
                  ? html`<span class="stratum-badge ghost"
                      >scalone z
                      ${this.hass?.areas?.[mergedAwayInto.area_id]?.name ??
                      mergedAwayInto.area_id}</span
                    >`
                  : nothing}
                ${hasOverrides
                  ? html`<span class="stratum-badge accent">custom</span>`
                  : nothing}
                ${visible
                  ? (() => {
                      const pos = this._getPosition(area.area_id);
                      return html`<div class="stratum-row-actions">
                        <button
                          type="button"
                          class="stratum-icon-btn"
                          title="Przesuń w górę"
                          ?disabled=${pos.index <= 0}
                          @click=${(ev: Event) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            this._moveRoom(area.area_id, -1);
                          }}
                        >
                          <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                        </button>
                        <button
                          type="button"
                          class="stratum-icon-btn"
                          title="Przesuń w dół"
                          ?disabled=${pos.index === -1 || pos.index >= pos.total - 1}
                          @click=${(ev: Event) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            this._moveRoom(area.area_id, 1);
                          }}
                        >
                          <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                        </button>
                        <button
                          type="button"
                          class="stratum-icon-btn ${editOpen ? 'accent' : ''}"
                          title=${editOpen ? 'Zwiń' : 'Edytuj'}
                          @click=${(ev: Event) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            this._toggleEdit(area.area_id);
                          }}
                        >
                          <ha-icon
                            .icon=${editOpen ? 'mdi:chevron-up' : 'mdi:pencil'}
                          ></ha-icon>
                        </button>
                      </div>`;
                    })()
                  : nothing}
              </div>
              ${visible && editOpen
                ? html`
                    <div class="stratum-row-sub">
                      <ha-form
                        .hass=${this.hass}
                        .data=${room ?? { area_id: area.area_id }}
                        .schema=${this._roomSchemaFor(area.area_id)}
                        .computeLabel=${this._computeRoomLabel}
                        .computeHelper=${this._computeRoomHelper}
                        @value-changed=${(ev: CustomEvent<{ value: Partial<RoomConfig> }>) =>
                          this._onFieldChange(area.area_id, ev)}
                      ></ha-form>
                      ${this._renderFieldEntitiesPanel(area.area_id, room)}
                      ${this._renderStyleOverridePanel(area.area_id, room)}
                      <details class="stratum-collapsible">
                        <summary>
                          <ha-icon .icon=${'mdi:view-dashboard-outline'}></ha-icon>
                          <span>Sekcje popup pomieszczenia</span>
                        </summary>
                        <div class="stratum-collapsible-body">
                          <p class="stratum-collapsible-hint">
                            Kolejność i zawartość sekcji które pojawią się w popup po
                            kliknięciu tego pokoju. Puste = auto-discover z encji.
                          </p>
                          <stratum-sections-editor
                            .hass=${this.hass}
                            .sections=${this._normalizedRoomSections(room)}
                            @sections-changed=${(ev: CustomEvent<{ sections: RoomSectionConfig[] }>) =>
                              this._onSectionsChanged(area.area_id, ev)}
                          ></stratum-sections-editor>
                        </div>
                      </details>
                      <details class="stratum-collapsible">
                        <summary>
                          <ha-icon .icon=${'mdi:palette-outline'}></ha-icon>
                          <span>Sceny popup pomieszczenia</span>
                        </summary>
                        <div class="stratum-collapsible-body">
                          <stratum-scene-editor
                            .hass=${this.hass}
                            .config=${room?.scenes ?? { items: [] }}
                            @scenes-changed=${(ev: CustomEvent<{ scenes: SceneBarConfig }>) =>
                              this._onScenesChanged(area.area_id, ev)}
                          ></stratum-scene-editor>
                        </div>
                      </details>
                    </div>
                  `
                : nothing}
            </div>
          `;
        })}
      </div>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      input[type='checkbox'].room-check {
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: var(--primary-color, #ff9b42);
        cursor: pointer;
      }

      textarea.stratum-css-input {
        width: 100%;
        box-sizing: border-box;
        font: 12px/1.4 var(--code-font-family, ui-monospace, Menlo, monospace);
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, #2b2d31);
        color: var(--primary-text-color);
        resize: vertical;
      }

      textarea.stratum-css-input:focus-visible {
        outline: 2px solid var(--primary-color, #ff9b42);
        outline-offset: 1px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-rooms-editor': StratumCardRoomsEditor;
  }
}
