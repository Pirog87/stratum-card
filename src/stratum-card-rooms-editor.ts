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

const ROOM_LABELS: Record<string, string> = {
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
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
      return html`<div class="empty">
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
      <div class="toolbar">
        <span class="count">${selectedCount} / ${areas.length} zaznaczonych</span>
        <button type="button" class="bulk" @click=${this._selectAll}>
          Zaznacz wszystkie
        </button>
        <button type="button" class="bulk" @click=${this._deselectAll}>
          Odznacz wszystkie
        </button>
      </div>
      <div class="wrap">
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
            <div class="room ${editOpen ? 'open' : ''}">
              <div class="row">
                <input
                  type="checkbox"
                  .checked=${visible}
                  @change=${(ev: Event) =>
                    this._toggleArea(area.area_id, (ev.target as HTMLInputElement).checked)}
                />
                <ha-icon .icon=${area.icon ?? 'mdi:floor-plan'}></ha-icon>
                <span class="name">${area.name}</span>
                ${mergeCount > 0
                  ? html`<span class="badge merge">+${mergeCount}</span>`
                  : nothing}
                ${mergedAwayInto
                  ? html`<span class="badge sub"
                      >scalone z
                      ${this.hass?.areas?.[mergedAwayInto.area_id]?.name ??
                      mergedAwayInto.area_id}</span
                    >`
                  : nothing}
                ${hasOverrides
                  ? html`<span class="badge">custom</span>`
                  : nothing}
                ${visible
                  ? (() => {
                      const pos = this._getPosition(area.area_id);
                      return html`<div class="actions">
                        <button
                          type="button"
                          class="icon-btn"
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
                          class="icon-btn"
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
                          class="icon-btn edit ${editOpen ? 'active' : ''}"
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
                    <div class="sub">
                      <ha-form
                        .hass=${this.hass}
                        .data=${room ?? { area_id: area.area_id }}
                        .schema=${this._roomSchemaFor(area.area_id)}
                        .computeLabel=${this._computeRoomLabel}
                        .computeHelper=${this._computeRoomHelper}
                        @value-changed=${(ev: CustomEvent<{ value: Partial<RoomConfig> }>) =>
                          this._onFieldChange(area.area_id, ev)}
                      ></ha-form>
                      <details class="popup-cfg">
                        <summary>
                          <ha-icon .icon=${'mdi:view-dashboard-outline'}></ha-icon>
                          <span>Sekcje popup pomieszczenia</span>
                        </summary>
                        <p class="hint">
                          Kolejność i zawartość sekcji które pojawią się w popup
                          po kliknięciu tego pokoju. Puste = auto-discover z
                          encji.
                        </p>
                        <stratum-sections-editor
                          .hass=${this.hass}
                          .sections=${this._normalizedRoomSections(room)}
                          @sections-changed=${(ev: CustomEvent<{ sections: RoomSectionConfig[] }>) =>
                            this._onSectionsChanged(area.area_id, ev)}
                        ></stratum-sections-editor>
                      </details>
                      <details class="popup-cfg">
                        <summary>
                          <ha-icon .icon=${'mdi:palette-outline'}></ha-icon>
                          <span>Sceny popup pomieszczenia</span>
                        </summary>
                        <stratum-scene-editor
                          .hass=${this.hass}
                          .config=${room?.scenes ?? { items: [] }}
                          @scenes-changed=${(ev: CustomEvent<{ scenes: SceneBarConfig }>) =>
                            this._onScenesChanged(area.area_id, ev)}
                        ></stratum-scene-editor>
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

  static styles = css`
    :host {
      display: block;
    }

    .wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .empty {
      padding: 12px;
      color: var(--secondary-text-color);
      font-style: italic;
      text-align: center;
      border: 1px dashed var(--divider-color);
      border-radius: 8px;
    }

    .room {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 6px 10px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.02));
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      user-select: none;
      padding: 4px 0;
    }

    .row ha-icon {
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }

    .name {
      flex: 1;
      font-weight: 500;
    }

    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--primary-color, #ff9b42);
      color: #fff;
      text-transform: uppercase;
      font-weight: 600;
    }

    .badge.merge {
      background: #42a5f5;
    }

    .badge.sub {
      background: transparent;
      color: var(--secondary-text-color);
      border: 1px solid var(--divider-color);
      text-transform: none;
      font-style: italic;
    }

    .sub {
      padding: 8px 0 4px 28px;
      border-top: 1px dashed var(--divider-color);
      margin-top: 4px;
    }

    input[type='checkbox'] {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--primary-color, #ff9b42);
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding: 6px 8px;
      border-radius: 6px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.02));
      font-size: 12px;
    }

    .toolbar .count {
      flex: 1;
      color: var(--secondary-text-color);
    }

    .bulk {
      background: transparent;
      border: 1px solid var(--divider-color);
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      color: var(--primary-text-color);
      cursor: pointer;
    }

    .bulk:hover {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      border-color: var(--primary-color, #ff9b42);
    }

    .actions {
      display: flex;
      gap: 2px;
      margin-left: auto;
    }

    .icon-btn {
      background: transparent;
      border: 0;
      padding: 4px;
      cursor: pointer;
      color: var(--secondary-text-color);
      border-radius: 4px;
      display: inline-flex;
    }

    .icon-btn:hover:not(:disabled) {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      color: var(--primary-text-color);
    }

    .icon-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .icon-btn.edit.active {
      background: var(--primary-color, #ff9b42);
      color: #fff;
    }

    .icon-btn ha-icon {
      --mdc-icon-size: 18px;
    }

    .room.open {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
    }

    .popup-cfg {
      margin-top: 10px;
      border: 1px solid var(--divider-color);
      border-radius: 6px;
      padding: 6px 10px;
      background: var(--card-background-color, transparent);
    }

    .popup-cfg summary {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      padding: 4px 0;
      list-style: none;
    }

    .popup-cfg summary::-webkit-details-marker {
      display: none;
    }

    .popup-cfg summary ha-icon {
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
    }

    .popup-cfg summary::after {
      content: '▸';
      margin-left: auto;
      color: var(--secondary-text-color);
      transition: transform 0.15s ease;
    }

    .popup-cfg[open] summary::after {
      transform: rotate(90deg);
    }

    .popup-cfg .hint {
      margin: 6px 0 10px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-rooms-editor': StratumCardRoomsEditor;
  }
}
