// Czyste transformacje listy `rooms` dla edytora pomieszczeń.
//
// Wydzielone z stratum-card-rooms-editor.ts, bo to tu config ginął po
// cichu: edycja jednego pokoju w trybie auto-discover kasowała pozostałe,
// odznaczenie pokoju albo „Zaznacz wszystkie" wycinało jego konfigurację
// popupu i własną kolejność. Każda funkcja dostaje bieżącą listę + area
// piętra (w kolejności HA) i zwraca NOWĄ listę do wyemitowania — bez Lita,
// bez hass, więc da się to przetestować wprost: config na wejściu, config
// na wyjściu.
//
// Semantyka listy (patrz stratum-card.ts `_renderRooms`):
// - pusta lista = auto-discover: wszystkie area piętra, w kolejności HA,
// - niepusta = jawna lista: tylko wpisy bez `hidden`, w kolejności listy.

import type { RoomConfig, TapActionConfig } from './types.js';
import { DEFAULT_POPUP_ORDER } from './types.js';

/**
 * Pokój „ma config", gdy ma jakiekolwiek pole poza `area_id`/`hidden`.
 * Konfiguracja popupu (lights, sections, chips, popup_order…) to też
 * config, nie tylko name/icon — wcześniejszy test tylko na name/icon/
 * tap_action/merge_with traktował pokój z samym popupem jak pusty
 * i wyrzucał go z listy razem z całą konfiguracją.
 */
export function roomHasConfig(room: RoomConfig): boolean {
  return Object.keys(room).some(
    (k) =>
      k !== 'area_id' &&
      k !== 'hidden' &&
      (room as unknown as Record<string, unknown>)[k] !== undefined,
  );
}

/**
 * Jawna lista odpowiadająca temu, co karta pokazuje teraz. W auto-discover
 * (pusta lista) to area piętra w kolejności HA — dokładnie ta, w której
 * karta je renderuje, więc materializacja niczego nie zmienia wizualnie.
 */
export function materializeRooms(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
): RoomConfig[] {
  if (rooms.length > 0) return [...rooms];
  return floorAreaIds.map((id) => ({ area_id: id }));
}

/**
 * Powrót do auto-discover, gdy jawna lista jest mu równoważna: te same
 * area w tej samej kolejności, nic ukrytego i żadnego configu. Auto-
 * discover jest lepszy od równoważnej listy, bo łapie area dopisane
 * później do piętra. Gdy cokolwiek się różni — lista zostaje jawna.
 */
export function compactRooms(
  rooms: RoomConfig[],
  floorAreaIds: readonly string[],
): RoomConfig[] {
  if (rooms.length !== floorAreaIds.length) return rooms;
  const equivalent = rooms.every(
    (r, i) => r.area_id === floorAreaIds[i] && !r.hidden && !roomHasConfig(r),
  );
  return equivalent ? [] : rooms;
}

/** Akcja „nie ustawiona": brak albo `default` z ha-form. `none` to wybór. */
function isUnsetAction(a: TapActionConfig | undefined): boolean {
  return !a || !a.action || (a.action as string) === 'default';
}

/**
 * Scala patch z pokojem i sprząta puste pola, żeby YAML nie puchł od
 * `name: ''` czy `chips: []`. Pusta wartość = „wróć do domyślnego".
 */
export function applyRoomPatch(
  base: RoomConfig,
  patch: Partial<RoomConfig>,
): RoomConfig {
  const merged: RoomConfig = { ...base, ...patch, area_id: base.area_id };
  if (!merged.name) delete merged.name;
  if (!merged.icon) delete merged.icon;
  // `none` ZOSTAJE: karta honoruje jawne „Nic" per pokój (wiersz przestaje
  // być klikalny i nie dziedziczy globalnego room_tap_action). Kasujemy
  // tylko brak akcji i `default` — ta sama reguła co w stratum-lights-editor.
  if (isUnsetAction(merged.tap_action)) delete merged.tap_action;
  if (isUnsetAction(merged.icon_tap_action)) delete merged.icon_tap_action;
  if (!merged.merge_with || merged.merge_with.length === 0) {
    delete merged.merge_with;
  }
  if (!merged.aggregate || merged.aggregate === 'sum') delete merged.aggregate;
  if (!merged.sections || merged.sections.length === 0) delete merged.sections;
  if (!merged.scenes || (merged.scenes.items ?? []).length === 0) {
    delete merged.scenes;
  }
  if (!merged.lights || (merged.lights.items ?? []).length === 0) {
    delete merged.lights;
  }
  if (!merged.light_auto_entity) delete merged.light_auto_entity;
  if (!merged.light_split_areas) delete merged.light_split_areas;
  if (
    !merged.light_auto_entities ||
    Object.keys(merged.light_auto_entities).length === 0
  ) {
    delete merged.light_auto_entities;
  }
  if (!merged.light_singles || (merged.light_singles.items ?? []).length === 0) {
    delete merged.light_singles;
  }
  if (!merged.covers_list || (merged.covers_list.items ?? []).length === 0) {
    delete merged.covers_list;
  }
  if (!merged.media_list || (merged.media_list.items ?? []).length === 0) {
    delete merged.media_list;
  }
  // popup_order: kasujemy gdy = default (ta sama kolejność, nic nie ukryte).
  if (merged.popup_order) {
    const def = DEFAULT_POPUP_ORDER;
    const isDefault =
      merged.popup_order.length === def.length &&
      merged.popup_order.every((i, idx) => i.section === def[idx] && !i.hidden);
    if (isDefault || merged.popup_order.length === 0) delete merged.popup_order;
  }
  if (
    merged.popup_extra &&
    Object.values(merged.popup_extra).every((v) => !v || v.length === 0)
  ) {
    delete merged.popup_extra;
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
  if (!merged.hidden) delete merged.hidden;
  return merged;
}

/**
 * Edycja jednego pokoju. Bazą jest lista ZMATERIALIZOWANA — w auto-discover
 * `rooms` jest puste i dopisanie samego edytowanego pokoju dawało jawną
 * listę jednoelementową: karta pokazywała tylko ten pokój, reszta piętra
 * znikała po zmianie nazwy czy akcji jednego wiersza.
 */
export function updateRoomInList(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
  areaId: string,
  patch: Partial<RoomConfig>,
): RoomConfig[] {
  const list = materializeRooms(rooms, floorAreaIds);
  const idx = list.findIndex((r) => r.area_id === areaId);
  const merged = applyRoomPatch(idx === -1 ? { area_id: areaId } : list[idx]!, patch);
  if (idx === -1) list.push(merged);
  else list[idx] = merged;
  return compactRooms(list, floorAreaIds);
}

/**
 * Checkbox „Pokaż". Odznaczenie zawsze zapisuje `hidden: true` zamiast
 * wycinać wpis: wycięcie gubiło config pokoju i jego miejsce w kolejności
 * (po ponownym zaznaczeniu lądował na końcu, bez ustawień).
 */
export function toggleRoomInList(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
  areaId: string,
  show: boolean,
): RoomConfig[] {
  const list = materializeRooms(rooms, floorAreaIds);
  const idx = list.findIndex((r) => r.area_id === areaId);
  if (idx === -1) {
    list.push(show ? { area_id: areaId } : { area_id: areaId, hidden: true });
  } else {
    const r = { ...list[idx]! };
    if (show) delete r.hidden;
    else r.hidden = true;
    list[idx] = r;
  }
  return compactRooms(list, floorAreaIds);
}

/**
 * „Zaznacz wszystkie": zdejmuje `hidden` z istniejących wpisów W ICH
 * kolejności (z configiem i wpisami spoza bieżącego piętra), dokleja
 * brakujące area piętra. Do auto-discover wraca tylko, gdy to równoważne.
 */
export function selectAllRooms(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
): RoomConfig[] {
  const floor = new Set(floorAreaIds);
  const known = new Set(rooms.map((r) => r.area_id));
  const next: RoomConfig[] = [
    ...rooms
      // Ukryte wpisy spoza bieżącego piętra (zostałe po zmianie piętra albo
      // po strefie usuniętej z HA) bez własnej konfiguracji to niewidoczne
      // śmieci — edytor ich nie pokazuje, więc „Zaznacz wszystkie" nie może
      // ich ożywić jako wierszy, których nie da się potem odznaczyć.
      .filter((r) => floor.has(r.area_id) || !r.hidden || roomHasConfig(r))
      .map((r) => {
        // Odkrywamy tylko pokoje tego piętra; wpisy spoza zostają, jakie są.
        if (!floor.has(r.area_id) || !('hidden' in r)) return r;
        const copy = { ...r };
        delete copy.hidden;
        return copy;
      }),
    ...floorAreaIds.filter((id) => !known.has(id)).map((id) => ({ area_id: id })),
  ];
  return compactRooms(next, floorAreaIds);
}

/**
 * „Odznacz wszystkie": jawna lista z `hidden: true` — pusta lista byłaby
 * auto-discover, czyli „wszystkie widoczne". Kolejność, config i wpisy
 * spoza piętra zostają, żeby „Odznacz" → „Zaznacz" było odwracalne.
 */
export function deselectAllRooms(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
): RoomConfig[] {
  const floor = new Set(floorAreaIds);
  const list = materializeRooms(rooms, floorAreaIds);
  const known = new Set(list.map((r) => r.area_id));
  return [
    // Chowamy tylko pokoje bieżącego piętra — wpisy spoza zostają bez zmian.
    ...list.map((r) => (floor.has(r.area_id) ? { ...r, hidden: true } : r)),
    ...floorAreaIds
      .filter((id) => !known.has(id))
      .map((id) => ({ area_id: id, hidden: true })),
  ];
}

/** Pozycja pokoju w liście, którą karta faktycznie renderuje. */
export function roomPosition(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
  areaId: string,
): { index: number; total: number } {
  const list = materializeRooms(rooms, floorAreaIds);
  return { index: list.findIndex((r) => r.area_id === areaId), total: list.length };
}

/**
 * Strzałki kolejności. Materializujemy, bo w auto-discover `rooms` jest
 * puste — wcześniej strzałki były tam martwe (indeks -1) i żeby zmienić
 * kolejność, trzeba było odznaczyć i zaznaczyć jakiś pokój.
 */
export function moveRoomInList(
  rooms: readonly RoomConfig[],
  floorAreaIds: readonly string[],
  areaId: string,
  direction: -1 | 1,
): RoomConfig[] | undefined {
  const list = materializeRooms(rooms, floorAreaIds);
  const idx = list.findIndex((r) => r.area_id === areaId);
  const target = idx + direction;
  if (idx === -1 || target < 0 || target >= list.length) return undefined;
  [list[idx], list[target]] = [list[target]!, list[idx]!];
  return compactRooms(list, floorAreaIds);
}
