// Editor listy pomieszczeń — podkomponent głównego stratum-card-editor.
//
// Po wyborze floor_id w nadrzędnym edytorze, ten komponent pokazuje listę
// area należących do floor-a z checkboxem "Pokaż" per area. Dla każdej
// zaznaczonej — expandable z polami: nazwa, ikona, tap_action.
//
// Emituje `rooms-changed` z pełną listą RoomConfig[] kiedy user cokolwiek zmienia.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { getAreasInFloor, getEntitiesInArea } from './area-entities.js';
import { autoRoomChips } from './room-sections.js';
import type {
  ChipConfig,
  CoreSectionType,
  HassEntityRegistryEntry,
  HomeAssistant,
  RoomConfig,
  RoomLightsConfig,
  RoomPopupOrderItem,
  RoomPopupSectionKey,
  RoomSectionConfig,
  RoomSectionType,
  SceneBarConfig,
} from './types.js';
import { getCustomCardOptions } from './custom-cards.js';
import {
  deselectAllRooms,
  moveRoomInList,
  roomHasConfig,
  roomPosition,
  selectAllRooms,
  toggleRoomInList,
  updateRoomInList,
} from './room-list-config.js';
import {
  coreSectionVisibility,
  isBlockHidden,
  resolvePopupOrder,
  setBlocksHidden,
  toggleCoreSectionHidden,
} from './room-block-visibility.js';
import './stratum-sections-editor.js';
import './stratum-scene-editor.js';
import './stratum-chips-editor.js';
import './stratum-lights-editor.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import { ROW_UI_ACTIONS } from './tap-action.js';

const ROOM_LABELS: Record<string, string> = {
  name: 'Nazwa (override)',
  icon: 'Ikona (override)',
  display: 'Forma wyświetlania',
  tap_action: 'Akcja po kliknięciu (override)',
  icon_tap_action: 'Akcja po kliknięciu w ikonę (override)',
  merge_with: 'Połącz z innymi pomieszczeniami',
  aggregate: 'Sposób agregacji',
};

/** Tytuły i ikony konfigurowalnych bloków popupu. */
const POPUP_GROUP_META: Record<RoomPopupSectionKey, { title: string; icon: string }> = {
  scenes: { title: 'Sceny pomieszczenia', icon: 'mdi:palette-outline' },
  light_groups: { title: 'Grupy świateł pomieszczenia', icon: 'mdi:lightbulb-group-outline' },
  light_entities: { title: 'Encje światła pomieszczenia', icon: 'mdi:lightbulb-outline' },
  covers: { title: 'Rolety pomieszczenia', icon: 'mdi:blinds' },
  media: { title: 'Media', icon: 'mdi:speaker' },
  extra: { title: 'Dodatkowe sekcje', icon: 'mdi:view-dashboard-outline' },
};

const ROOM_HELPERS: Record<string, string> = {
  merge_with:
    'Wybrane pomieszczenia znikną jako osobne wiersze. Wszystkie bloki popupu (chipy, sceny, światła, rolety, media…) pokazują wtedy encje ze WSZYSTKICH połączonych obszarów.',
  aggregate:
    '„Suma" — światła/motion/temperatura liczone łącznie. „Tylko główne" — tylko encje primary, merge jest hierarchiczny.',
};

@customElement('stratum-card-rooms-editor')
export class StratumCardRoomsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: String, attribute: 'floor-id' }) public floorId = '';

  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @property({ attribute: false }) public rooms: RoomConfig[] = [];

  /** Otwarty widok szczegółu pokoju (area_id). Reset przy zmianie floor/area. */
  @state() private _detailRoom?: string;

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('floorId') || changed.has('areaId')) {
      this._detailRoom = undefined;
    }
  }

  private _computeRoomLabel = (schema: { name: string }): string =>
    ROOM_LABELS[schema.name] ?? schema.name;

  private _computeRoomHelper = (schema: { name: string }): string =>
    ROOM_HELPERS[schema.name] ?? '';

  /** Schema części „Ogólne" widoku szczegółu. */
  private _generalSchema() {
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
      // Akcja wiersza pokoju — bez encji, więc bez `more-info` / `toggle`;
      // `assist` karta nie obsługuje.
      { name: 'tap_action', selector: { ui_action: { actions: ROW_UI_ACTIONS } } },
      // Karta czyta room.icon_tap_action (nadpisuje room_icon_tap_action),
      // a bez tego pola dało się to ustawić tylko w YAML.
      { name: 'icon_tap_action', selector: { ui_action: { actions: ROW_UI_ACTIONS } } },
    ];
  }

  /** Schema łączenia pokojów (Zaawansowane). */
  private _mergeSchemaFor(currentAreaId: string) {
    const floorAreas = this._availableAreas();
    const otherAreaIds = floorAreas
      .filter((a) => a.area_id !== currentAreaId)
      .map((a) => a.area_id);
    return [
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

  /** area_id piętra w kolejności HA — ta sama, w której renderuje auto-discover. */
  private _floorIds(): string[] {
    return this._availableAreas().map((a) => a.area_id);
  }

  private _toggleArea(areaId: string, show: boolean): void {
    this._emitChange(toggleRoomInList(this.rooms, this._floorIds(), areaId, show));
  }

  /** Logika (materializacja, sprzątanie pustych pól) w room-list-config.ts. */
  private _updateRoom(areaId: string, patch: Partial<RoomConfig>): void {
    this._emitChange(updateRoomInList(this.rooms, this._floorIds(), areaId, patch));
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

  /**
   * Chipy, które popup pokoju pokaże przy pustym `chips` — dokładnie to,
   * co liczy stratum-room-card (autoRoomChips na encjach area +
   * merge_with). Edytor chipów materializuje TEN zestaw przy pierwszej
   * zmianie; wcześniej brał zestaw belki piętra i gubił temperaturę,
   * wilgotność oraz „x min temu" przy obecności.
   */
  private _autoRoomChips(areaId: string, room: RoomConfig | undefined): ChipConfig[] {
    if (!this.hass) return [];
    const seen = new Set<string>();
    const entries: HassEntityRegistryEntry[] = [];
    for (const id of [areaId, ...(room?.merge_with ?? [])]) {
      for (const e of getEntitiesInArea(this.hass, id)) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        entries.push(e);
      }
    }
    return autoRoomChips(this.hass, entries);
  }

  private _onChipsChanged(
    areaId: string,
    ev: CustomEvent<{ chips: ChipConfig[] }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, { chips: ev.detail.chips });
  }

  private _onLightsChanged(
    areaId: string,
    ev: CustomEvent<{ lights: RoomLightsConfig }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, { lights: ev.detail.lights });
  }

  private _onListChanged(
    areaId: string,
    field: 'light_singles' | 'covers_list' | 'media_list',
    ev: CustomEvent<{ lights: RoomLightsConfig }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, { [field]: ev.detail.lights });
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
      {
        name: 'leak',
        selector: {
          entity: {
            multiple: true,
            filter: [{ domain: 'binary_sensor', device_class: 'moisture' }],
          },
        },
      },
    ];
    const labels: Record<string, string> = {
      temperature: 'Temperatura (encja)',
      humidity: 'Wilgotność (encja)',
      leak: 'Wyciek (lista encji)',
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
    this._emitChange(selectAllRooms(this.rooms, this._floorIds()));
  }

  private _deselectAll(): void {
    this._emitChange(deselectAllRooms(this.rooms, this._floorIds()));
  }

  private _moveRoom(areaId: string, direction: -1 | 1): void {
    const next = moveRoomInList(this.rooms, this._floorIds(), areaId, direction);
    if (next) this._emitChange(next);
  }

  private _getPosition(areaId: string): { index: number; total: number } {
    return roomPosition(this.rooms, this._floorIds(), areaId);
  }

  /** Kolejność bloków popupu dla pokoju: config + brakujące klucze wg defaultu. */
  private _orderFor(room: RoomConfig | undefined): RoomPopupOrderItem[] {
    return resolvePopupOrder(room);
  }

  private _moveOrder(areaId: string, key: RoomPopupSectionKey, dir: -1 | 1): void {
    const order = [...this._orderFor(this._getRoom(areaId))];
    const idx = order.findIndex((i) => i.section === key);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target]!, order[idx]!];
    this._updateRoom(areaId, { popup_order: order });
  }

  /**
   * Oko na nagłówku bloku. Czyta i zapisuje stan EFEKTYWNY (popup_order
   * albo hidden sekcji — oba honoruje karta), żeby nie rozjeżdżało się
   * z okiem tej samej sekcji w „Dodatkowych sekcjach".
   */
  private _toggleOrderHidden(areaId: string, key: RoomPopupSectionKey): void {
    const room = this._getRoom(areaId);
    this._updateRoom(areaId, setBlocksHidden(room, [key], !isBlockHidden(room, key)));
  }

  /** Oko sekcji rdzeniowej w sections-editorze — ten sam stan co nagłówki bloków. */
  private _onCoreSectionToggle(
    areaId: string,
    ev: CustomEvent<{ type: CoreSectionType }>,
  ): void {
    ev.stopPropagation();
    this._updateRoom(areaId, toggleCoreSectionHidden(this._getRoom(areaId), ev.detail.type));
  }

  /** Aktualny mode sekcji danego typu (z room.sections). */
  private _sectionModeFor(room: RoomConfig | undefined, type: RoomSectionType): string {
    const sections = this._normalizedRoomSections(room);
    return sections.find((s) => s.type === type)?.mode ?? '';
  }

  /** Merge'uje patch do sekcji danego typu (undefined w patchu = usuń klucz). */
  private _patchSection(
    areaId: string,
    type: RoomSectionType,
    patch: Partial<RoomSectionConfig>,
  ): void {
    const room = this._getRoom(areaId);
    const sections = [...this._normalizedRoomSections(room)];
    const idx = sections.findIndex((s) => s.type === type);
    const base = idx === -1 ? ({ type } as RoomSectionConfig) : { ...sections[idx]! };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        delete (base as unknown as Record<string, unknown>)[k];
      } else {
        (base as unknown as Record<string, unknown>)[k] = v;
      }
    }
    if (idx === -1) sections.push(base);
    else sections[idx] = base;
    this._updateRoom(areaId, { sections });
  }

  /** Ustawia mode sekcji typu (styl kafli bloku popupu). */
  private _setSectionMode(
    areaId: string,
    type: RoomSectionType,
    mode: string | undefined,
  ): void {
    this._patchSection(areaId, type, {
      mode: mode as RoomSectionConfig['mode'] | undefined,
    });
  }

  /** Suwaki wymiarów kafli świateł (wspólne dla grup i encji). */
  /**
   * Podział świateł na strefy (tylko przy merge_with): toggle + pomocnicy
   * automatyki per strefa (`light_auto_entities[area_id]`).
   */
  private _renderLightSplitControls(
    areaId: string,
    room: RoomConfig | undefined,
  ): TemplateResult | typeof nothing {
    const mergeWith = room?.merge_with ?? [];
    if (mergeWith.length === 0) return nothing;
    const split = room?.light_split_areas === true;
    const areaIds = [areaId, ...mergeWith];
    const areaName = (id: string): string =>
      this.hass?.areas?.[id]?.name ?? id;
    return html`
      <label class="stratum-toggle" style="margin-top:10px;">
        <input
          type="checkbox"
          .checked=${split}
          @change=${(ev: Event) =>
            this._updateRoom(areaId, {
              light_split_areas:
                (ev.target as HTMLInputElement).checked || undefined,
            })}
        />
        <span>Podziel światła na strefy (osobne nagłówki i przełączniki
          per pomieszczenie)</span>
      </label>
      ${split
        ? html`<ha-form
            .hass=${this.hass}
            .data=${{
              [areaId]:
                room?.light_auto_entities?.[areaId] ??
                room?.light_auto_entity ??
                '',
              ...Object.fromEntries(
                mergeWith.map((id) => [
                  id,
                  room?.light_auto_entities?.[id] ?? '',
                ]),
              ),
            }}
            .schema=${areaIds.map((id) => ({
              name: id,
              selector: {
                entity: {
                  filter: [
                    { domain: 'input_boolean' },
                    { domain: 'switch' },
                    { domain: 'automation' },
                  ],
                },
              },
            }))}
            .computeLabel=${(s: { name: string }) =>
              `Pomocnik auto — ${areaName(s.name)}`}
            @value-changed=${(ev: CustomEvent<{ value: Record<string, string> }>) => {
              ev.stopPropagation();
              const map: Record<string, string> = {};
              for (const [id, ent] of Object.entries(ev.detail.value)) {
                if (ent) map[id] = ent;
              }
              this._updateRoom(areaId, {
                light_auto_entities:
                  Object.keys(map).length > 0 ? map : undefined,
              });
            }}
          ></ha-form>`
        : nothing}
    `;
  }

  private _renderLightsSizeControls(areaId: string): TemplateResult {
    const room = this._getRoom(areaId);
    const sec = this._normalizedRoomSections(room).find((s) => s.type === 'lights');
    const w = typeof sec?.tile_min_width === 'number' ? sec.tile_min_width : 240;
    const h = typeof sec?.tile_height === 'number' ? sec.tile_height : 96;
    return html`
      <div class="size-controls">
        <div class="size-row">
          <label>Min. szerokość kafla</label>
          <span class="size-val">${w} px</span>
          <input
            type="range"
            min="140"
            max="520"
            step="10"
            .value=${String(w)}
            @change=${(ev: Event) => {
              const v = Number((ev.target as HTMLInputElement).value);
              this._patchSection(areaId, 'lights', {
                tile_min_width: v === 240 ? undefined : v,
              });
            }}
          />
        </div>
        <div class="size-row">
          <label>Wysokość kafla</label>
          <span class="size-val">${h} px</span>
          <input
            type="range"
            min="64"
            max="180"
            step="4"
            .value=${String(h)}
            @change=${(ev: Event) => {
              const v = Number((ev.target as HTMLInputElement).value);
              this._patchSection(areaId, 'lights', {
                tile_height: v === 96 ? undefined : v,
              });
            }}
          />
        </div>
        <p class="detail-group-hint">
          Liczba kolumn dopasowuje się automatycznie do szerokości ekranu
          (kafle nie węższe niż ustawiona wartość). Dotyczy grup i encji
          świateł.
        </p>
      </div>
    `;
  }

  /**
   * Chipy „Styl kafli": Stratum vs karty z HACS (bubble/mushroom).
   * Niezainstalowane karty są wyszarzone z dopiskiem.
   */
  private _renderStylePicker(
    areaId: string,
    type: RoomSectionType,
    options: Array<{ mode?: string; label: string; requires?: string }>,
  ): TemplateResult {
    const room = this._getRoom(areaId);
    const current = this._sectionModeFor(room, type);
    const installed = new Set(getCustomCardOptions().map((o) => o.value));
    return html`
      <div class="style-picker">
        <span class="style-picker-label">Styl kafli</span>
        <div class="style-picker-chips">
          ${options.map((o) => {
            const missing = Boolean(o.requires && !installed.has(o.requires));
            const active = (o.mode ?? '') === current;
            return html`<button
              type="button"
              class="style-chip ${active ? 'on' : ''}"
              ?disabled=${missing}
              title=${missing ? 'Karta nie jest zainstalowana w HACS' : o.label}
              @click=${() => this._setSectionMode(areaId, type, o.mode)}
            >
              ${o.label}${missing ? ' (brak)' : ''}
            </button>`;
          })}
        </div>
      </div>
    `;
  }

  /** Zawartość konfigurowalnej grupy popupu (per klucz). */
  private _renderPopupGroupBody(
    key: RoomPopupSectionKey,
    areaId: string,
    room: RoomConfig | undefined,
  ): TemplateResult {
    switch (key) {
      case 'scenes':
        return html`
          <p class="detail-group-hint">
            Wszystkie sceny pokoju — także wykryte automatycznie. Zmień nazwę
            i grafikę, ukryj okiem, przestaw kolejność albo dodaj scenę spoza
            obszaru.
          </p>
          <stratum-scene-editor
            .hass=${this.hass}
            .areaId=${areaId}
            .mergeWith=${room?.merge_with ?? []}
            .config=${room?.scenes ?? { items: [] }}
            @scenes-changed=${(ev: CustomEvent<{ scenes: SceneBarConfig }>) =>
              this._onScenesChanged(areaId, ev)}
          ></stratum-scene-editor>
        `;
      case 'light_groups':
        return html`
          <p class="detail-group-hint">
            Wyłącznie pomocniki „Grupa światła" przypisane do obszaru
            (+ dodane ręcznie, także spoza obszaru). Pełna kontrola:
            widoczność okiem, nazwa, ikona, kolejność, separatory poziome.
          </p>
          ${this._renderStylePicker(areaId, 'lights', [
            { label: 'Stratum (wypełnienie)' },
            { mode: 'custom:bubble-card', label: 'Bubble Card', requires: 'custom:bubble-card' },
            { mode: 'custom:mushroom-light-card', label: 'Mushroom', requires: 'custom:mushroom-light-card' },
          ])}
          ${this._renderLightsSizeControls(areaId)}
          <stratum-lights-editor
            .hass=${this.hass}
            .areaId=${areaId}
            .mergeWith=${room?.merge_with ?? []}
            .source=${'light_groups'}
            .config=${room?.lights ?? { items: [] }}
            @lights-changed=${(ev: CustomEvent<{ lights: RoomLightsConfig }>) =>
              this._onLightsChanged(areaId, ev)}
          ></stratum-lights-editor>
          <ha-form
            .hass=${this.hass}
            .data=${{ light_auto_entity: room?.light_auto_entity ?? '' }}
            .schema=${[
              {
                name: 'light_auto_entity',
                selector: {
                  entity: {
                    filter: [
                      { domain: 'input_boolean' },
                      { domain: 'switch' },
                      { domain: 'automation' },
                    ],
                  },
                },
              },
            ]}
            .computeLabel=${() => 'Pomocnik auto-świateł (switch „Auto")'}
            .computeHelper=${() =>
              'Czerwony switch automatyki w nagłówku bloku świateł popupu — klik przełącza pomocnika (np. input_boolean sterujący Node-RED).'}
            @value-changed=${(ev: CustomEvent<{ value: { light_auto_entity?: string } }>) => {
              ev.stopPropagation();
              this._updateRoom(areaId, {
                light_auto_entity: ev.detail.value.light_auto_entity || undefined,
              });
            }}
          ></ha-form>
          ${this._renderLightSplitControls(areaId, room)}
        `;
      case 'light_entities':
        return html`
          <p class="detail-group-hint">
            WSZYSTKIE pojedyncze encje światła pomieszczenia. Ten sam schemat
            co grupy: oko, nazwa, ikona, akcja kliknięcia, kolejność,
            separatory, encje spoza obszaru. Gdy pokój ma grupy — w popupie
            zwinięte pod przyciskiem; bez grup — widoczne od razu.
          </p>
          <stratum-lights-editor
            .hass=${this.hass}
            .areaId=${areaId}
            .mergeWith=${room?.merge_with ?? []}
            .source=${'light_singles'}
            .config=${room?.light_singles ?? { items: [] }}
            @lights-changed=${(ev: CustomEvent<{ lights: RoomLightsConfig }>) =>
              this._onListChanged(areaId, 'light_singles', ev)}
          ></stratum-lights-editor>
        `;
      case 'covers':
        return html`
          <p class="detail-group-hint">
            Wszystkie rolety pomieszczenia — oko, nazwa, ikona, akcja
            kliknięcia, kolejność, separatory, encje spoza obszaru. Pasek
            akcji zbiorczych (Otwórz/Stop/Zamknij, pozycje %) dostosujesz
            w „Dodatkowych sekcjach" (sekcja Rolety).
          </p>
          ${this._renderStylePicker(areaId, 'covers', [
            { label: 'Stratum (wiersz)' },
            { mode: 'custom:bubble-card', label: 'Bubble Card', requires: 'custom:bubble-card' },
            { mode: 'custom:mushroom-cover-card', label: 'Mushroom', requires: 'custom:mushroom-cover-card' },
          ])}
          <stratum-lights-editor
            .hass=${this.hass}
            .areaId=${areaId}
            .mergeWith=${room?.merge_with ?? []}
            .source=${'covers'}
            .config=${room?.covers_list ?? { items: [] }}
            @lights-changed=${(ev: CustomEvent<{ lights: RoomLightsConfig }>) =>
              this._onListChanged(areaId, 'covers_list', ev)}
          ></stratum-lights-editor>
        `;
      case 'media':
        return html`
          <p class="detail-group-hint">
            Wszystkie odtwarzacze pomieszczenia — oko, nazwa, kolejność,
            encje spoza obszaru. W popupie: pierwszy widoczny (albo grający)
            jako duży player z okładką, reszta zwinięta.
          </p>
          ${this._renderStylePicker(areaId, 'media', [
            { label: 'Stratum (player)' },
            { mode: 'custom:bubble-card', label: 'Bubble Card', requires: 'custom:bubble-card' },
            { mode: 'custom:mushroom-media-player-card', label: 'Mushroom', requires: 'custom:mushroom-media-player-card' },
          ])}
          <stratum-lights-editor
            .hass=${this.hass}
            .areaId=${areaId}
            .mergeWith=${room?.merge_with ?? []}
            .source=${'media'}
            .config=${room?.media_list ?? { items: [] }}
            @lights-changed=${(ev: CustomEvent<{ lights: RoomLightsConfig }>) =>
              this._onListChanged(areaId, 'media_list', ev)}
          ></stratum-lights-editor>
        `;
      case 'extra':
        return html`
          <p class="detail-group-hint">
            Pozostałe sekcje: okna, drzwi, klimat, przełączniki, karty
            custom z HACS… Tu też pełna konfiguracja sekcji Rolety / Media /
            Światła (tryby, kolumny, encje).
          </p>
          <stratum-sections-editor
            .hass=${this.hass}
            .sections=${this._normalizedRoomSections(room)}
            .coreVisibility=${coreSectionVisibility(room)}
            @sections-changed=${(ev: CustomEvent<{ sections: RoomSectionConfig[] }>) =>
              this._onSectionsChanged(areaId, ev)}
            @core-section-toggle=${(ev: CustomEvent<{ type: CoreSectionType }>) =>
              this._onCoreSectionToggle(areaId, ev)}
          ></stratum-sections-editor>
        `;
    }
  }

  /** Pełny widok szczegółu jednego pokoju — zwijane grupy w konfigurowalnej kolejności. */
  private _renderDetail(areaId: string): TemplateResult {
    const area = this.hass?.areas?.[areaId];
    const room = this._getRoom(areaId);
    const roomName = room?.name ?? area?.name ?? areaId;
    const order = this._orderFor(room);
    return html`
      <div class="detail">
        <button
          type="button"
          class="detail-back"
          @click=${() => (this._detailRoom = undefined)}
        >
          <ha-icon .icon=${'mdi:arrow-left'}></ha-icon>
          Wróć do listy pomieszczeń
        </button>
        <div class="detail-head">
          <span class="detail-avatar">
            <ha-icon .icon=${room?.icon ?? area?.icon ?? 'mdi:floor-plan'}></ha-icon>
          </span>
          <div class="detail-title">
            <p class="detail-crumb">Edytujesz pomieszczenie</p>
            <h4>${roomName}</h4>
          </div>
        </div>
        <p class="detail-scope">
          Wszystko poniżej dotyczy TYLKO pokoju „${roomName}" i nadpisuje
          ustawienia globalne karty. Strzałkami zmienisz kolejność bloków
          w popupie, okiem — ich widoczność.
        </p>

        <details class="popup-group">
          <summary>
            <ha-icon class="g-icon" .icon=${'mdi:tune'}></ha-icon>
            <span class="g-title">Ogólne</span>
            <ha-icon class="g-chevron" .icon=${'mdi:chevron-down'}></ha-icon>
          </summary>
          <div class="g-body">
            <p class="detail-group-hint">
              Nazwa, ikona i reakcja na klik wiersza „${roomName}" na karcie
              głównej.
            </p>
            <ha-form
              .hass=${this.hass}
              .data=${room ?? { area_id: areaId }}
              .schema=${this._generalSchema()}
              .computeLabel=${this._computeRoomLabel}
              .computeHelper=${this._computeRoomHelper}
              @value-changed=${(ev: CustomEvent<{ value: Partial<RoomConfig> }>) =>
                this._onFieldChange(areaId, ev)}
            ></ha-form>
          </div>
        </details>

        <details class="popup-group">
          <summary>
            <ha-icon class="g-icon" .icon=${'mdi:label-multiple-outline'}></ha-icon>
            <span class="g-title">Chipy nagłówka</span>
            <ha-icon class="g-chevron" .icon=${'mdi:chevron-down'}></ha-icon>
          </summary>
          <div class="g-body">
            <p class="detail-group-hint">
              Chipy u góry popupu. Puste = automatyczne (światła, obecność,
              okna, drzwi, wyciek + temperatura/wilgotność).
            </p>
            <stratum-chips-editor
              .hass=${this.hass}
              .chips=${room?.chips ?? []}
              .defaults=${this._autoRoomChips(areaId, room)}
              @chips-changed=${(ev: CustomEvent<{ chips: ChipConfig[] }>) =>
                this._onChipsChanged(areaId, ev)}
            ></stratum-chips-editor>
          </div>
        </details>

        ${repeat(
          order,
          (i) => i.section,
          (item, idx) => {
            const meta = POPUP_GROUP_META[item.section];
            const hidden = isBlockHidden(room, item.section);
            return html`
              <details class="popup-group ${hidden ? 'hidden-group' : ''}">
                <summary>
                  <ha-icon class="g-icon" .icon=${meta.icon}></ha-icon>
                  <span class="g-title">${meta.title}</span>
                  <span class="g-actions">
                    <button
                      type="button"
                      class="stratum-icon-btn"
                      title=${hidden ? 'Pokaż blok w popupie' : 'Ukryj blok w popupie'}
                      @click=${(ev: Event) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this._toggleOrderHidden(areaId, item.section);
                      }}
                    >
                      <ha-icon .icon=${hidden ? 'mdi:eye-off' : 'mdi:eye'}></ha-icon>
                    </button>
                    <button
                      type="button"
                      class="stratum-icon-btn"
                      title="Przesuń wyżej"
                      ?disabled=${idx === 0}
                      @click=${(ev: Event) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this._moveOrder(areaId, item.section, -1);
                      }}
                    >
                      <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                    </button>
                    <button
                      type="button"
                      class="stratum-icon-btn"
                      title="Przesuń niżej"
                      ?disabled=${idx === order.length - 1}
                      @click=${(ev: Event) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this._moveOrder(areaId, item.section, 1);
                      }}
                    >
                      <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                    </button>
                  </span>
                  <ha-icon class="g-chevron" .icon=${'mdi:chevron-down'}></ha-icon>
                </summary>
                <div class="g-body">
                  ${this._renderPopupGroupBody(item.section, areaId, room)}
                </div>
              </details>
            `;
          },
        )}

        <details class="popup-group">
          <summary>
            <ha-icon class="g-icon" .icon=${'mdi:cog-outline'}></ha-icon>
            <span class="g-title">Zaawansowane</span>
            <ha-icon class="g-chevron" .icon=${'mdi:chevron-down'}></ha-icon>
          </summary>
          <div class="g-body">
            <details class="stratum-collapsible">
              <summary>
                <ha-icon .icon=${'mdi:link-variant'}></ha-icon>
                <span>Połącz z innymi pomieszczeniami</span>
              </summary>
              <div class="stratum-collapsible-body">
                <ha-form
                  .hass=${this.hass}
                  .data=${room ?? { area_id: areaId }}
                  .schema=${this._mergeSchemaFor(areaId)}
                  .computeLabel=${this._computeRoomLabel}
                  .computeHelper=${this._computeRoomHelper}
                  @value-changed=${(ev: CustomEvent<{ value: Partial<RoomConfig> }>) =>
                    this._onFieldChange(areaId, ev)}
                ></ha-form>
              </div>
            </details>
            ${this._renderFieldEntitiesPanel(areaId, room)}
            ${this._renderStyleOverridePanel(areaId, room)}
          </div>
        </details>
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    const areas = this._sortedAreas();
    if (!this.hass) return nothing;
    if (this._detailRoom && this._isVisible(this._detailRoom)) {
      return this._renderDetail(this._detailRoom);
    }
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
          // Każde pole poza area_id/hidden — także sam config popupu —
          // to „custom": user widzi, że pokój ma ustawienia do stracenia.
          const hasOverrides = Boolean(room && roomHasConfig(room));
          const mergeCount = room?.merge_with?.length ?? 0;
          const mergedAwayInto = this.rooms.find((r) =>
            r.merge_with?.includes(area.area_id),
          );
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
                          class="stratum-icon-btn accent"
                          title="Otwórz ustawienia pokoju"
                          @click=${(ev: Event) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            this._detailRoom = area.area_id;
                          }}
                        >
                          <ha-icon .icon=${'mdi:pencil'}></ha-icon>
                        </button>
                      </div>`;
                    })()
                  : nothing}
              </div>
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

      .detail-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
        padding: 6px 14px 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.16));
        background: transparent;
        font: inherit;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--primary-text-color);
        cursor: pointer;
      }

      .detail-back:hover {
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
      }

      .detail-back ha-icon {
        --mdc-icon-size: 16px;
      }

      .detail-head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }

      .detail-avatar {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 16%, transparent);
        color: var(--primary-color, #ff9b42);
      }

      .detail-avatar ha-icon {
        --mdc-icon-size: 24px;
      }

      .detail-title {
        min-width: 0;
      }

      .detail-crumb {
        margin: 0;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--primary-color, #ff9b42);
      }

      .detail-title h4 {
        margin: 2px 0 0;
        font-size: 19px;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .detail-scope {
        margin: 0 0 14px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .size-controls {
        margin-bottom: 10px;
      }

      .size-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .size-row label {
        flex-shrink: 0;
        min-width: 140px;
        font-weight: 600;
      }

      .size-val {
        flex-shrink: 0;
        min-width: 52px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }

      .size-row input[type='range'] {
        flex: 1;
        accent-color: var(--primary-color, #ff9b42);
      }

      .style-picker {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .style-picker-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--secondary-text-color);
      }

      .style-picker-chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .style-chip {
        padding: 5px 12px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.16));
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
      }

      .style-chip:hover:not(:disabled) {
        border-color: var(--primary-color, #ff9b42);
      }

      .style-chip.on {
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 18%, transparent);
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
      }

      .style-chip:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      details.popup-group {
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        margin-bottom: 10px;
        background: var(--stratum-editor-group-bg, rgba(255, 255, 255, 0.02));
        overflow: hidden;
      }

      details.popup-group > summary {
        list-style: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--secondary-text-color);
        user-select: none;
      }

      details.popup-group > summary::-webkit-details-marker {
        display: none;
      }

      .popup-group summary .g-icon {
        --mdc-icon-size: 16px;
        color: var(--primary-color, #ff9b42);
        flex-shrink: 0;
      }

      .popup-group summary .g-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .popup-group summary .g-actions {
        margin-left: auto;
        display: flex;
        gap: 2px;
        flex-shrink: 0;
      }

      .popup-group summary .g-chevron {
        --mdc-icon-size: 18px;
        flex-shrink: 0;
        transition: transform 0.15s ease;
      }

      details.popup-group[open] > summary .g-chevron {
        transform: rotate(180deg);
      }

      .popup-group .g-body {
        padding: 0 12px 12px;
      }

      .popup-group.hidden-group summary .g-title,
      .popup-group.hidden-group summary .g-icon {
        opacity: 0.4;
      }

      .detail-group {
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        padding: 12px 14px 14px;
        margin-bottom: 12px;
        background: var(--stratum-editor-group-bg, rgba(255, 255, 255, 0.02));
      }

      .detail-group-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--secondary-text-color);
        margin-bottom: 10px;
      }

      .detail-group-head ha-icon {
        --mdc-icon-size: 16px;
        color: var(--primary-color, #ff9b42);
      }

      .detail-group-hint {
        margin: 0 0 10px;
        font-size: 12px;
        color: var(--secondary-text-color);
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
