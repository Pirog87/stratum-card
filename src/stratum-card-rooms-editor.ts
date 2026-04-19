// Editor listy pomieszczeń — podkomponent głównego stratum-card-editor.
//
// Po wyborze floor_id w nadrzędnym edytorze, ten komponent pokazuje listę
// area należących do floor-a z checkboxem "Pokaż" per area. Dla każdej
// zaznaczonej — expandable z polami: nazwa, ikona, tap_action.
//
// Emituje `rooms-changed` z pełną listą RoomConfig[] kiedy user cokolwiek zmienia.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { getAreasInFloor } from './area-entities.js';
import type { HomeAssistant, RoomConfig, TapActionConfig } from './types.js';

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
    const found = this.rooms.find((r) => r.area_id === areaId);
    return Boolean(found && !found.hidden);
  }

  private _getRoom(areaId: string): RoomConfig | undefined {
    return this.rooms.find((r) => r.area_id === areaId);
  }

  private _emitChange(next: RoomConfig[]): void {
    // Normalize: jeśli lista zawiera same „default" pozycje (bez override'ów)
    // i pokrywa wszystkie dostępne area → zwróć pustą tablicę (= auto-discover).
    const availableIds = this._availableAreas().map((a) => a.area_id);
    const visible = next.filter((r) => !r.hidden);
    const isCleanAuto =
      visible.length === availableIds.length &&
      visible.every(
        (r) =>
          availableIds.includes(r.area_id) &&
          !r.name &&
          !r.icon &&
          !r.tap_action,
      );
    const normalized = isCleanAuto ? [] : next;

    this.dispatchEvent(
      new CustomEvent('rooms-changed', {
        detail: { rooms: normalized },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _toggleArea(areaId: string, show: boolean): void {
    const existing = this._getRoom(areaId);
    let next: RoomConfig[];
    if (show) {
      if (existing) {
        next = this.rooms.map((r) =>
          r.area_id === areaId ? { ...r, hidden: false } : r,
        );
      } else {
        next = [...this.rooms, { area_id: areaId }];
      }
    } else {
      if (existing) {
        const hasOverrides = existing.name || existing.icon || existing.tap_action;
        next = hasOverrides
          ? this.rooms.map((r) => (r.area_id === areaId ? { ...r, hidden: true } : r))
          : this.rooms.filter((r) => r.area_id !== areaId);
      } else {
        next = [...this.rooms, { area_id: areaId, hidden: true }];
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
    const next = existing
      ? this.rooms.map((r) => (r.area_id === areaId ? merged : r))
      : [...this.rooms, merged];
    this._emitChange(next);
  }

  private _onFieldChange(
    areaId: string,
    ev: CustomEvent<{ value: Partial<RoomConfig> }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, ev.detail.value);
  }

  protected render(): TemplateResult | typeof nothing {
    const areas = this._availableAreas();
    if (!this.hass) return nothing;
    if (areas.length === 0) {
      return html`<div class="empty">
        Wybierz piętro lub strefę wyżej — pojawi się tu lista pomieszczeń do
        wyboru.
      </div>`;
    }

    return html`
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
          return html`
            <div class="room">
              <label class="row">
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
              </label>
              ${visible
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
      cursor: pointer;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-rooms-editor': StratumCardRoomsEditor;
  }
}
