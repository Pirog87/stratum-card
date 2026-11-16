// Helpers do czytania encji powiązanych z area / floor Home Assistant.
//
// Encja może mieć `area_id` ustawione bezpośrednio (override) albo dziedziczyć je
// po urządzeniu (`hass.devices[device_id].area_id`). Sprawdzamy obie ścieżki.
// Floor (HA 2024.3+) zawiera wiele area — agregujemy encje po wszystkich.

import type {
  HassArea,
  HassEntity,
  HassEntityRegistryEntry,
  HomeAssistant,
} from './types.js';
import { registryDeviceClass } from './entity-registry-cache.js';

/** Lista wpisów rejestru, której NIE wolno mutować (współdzielona z cache). */
export type EntityEntries = readonly HassEntityRegistryEntry[];

const NO_ENTRIES: EntityEntries = Object.freeze([]);

/**
 * Indeks area → wpisy rejestru, budowany RAZ na tożsamość rejestru.
 *
 * Dlaczego: HA podmienia `hass` przy każdej zmianie stanu dowolnej encji,
 * a karta pyta o encje area kilkadziesiąt razy na render. Skan całego
 * `hass.entities` (u usera 5187 wpisów) przy każdym pytaniu zjadał ~92%
 * czasu renderu — ~105 ms na jedną zmianę stanu przy trzech kartach.
 * `hass.entities` i `hass.devices` zmieniają tożsamość wyłącznie przy
 * zmianie rejestru, więc indeks żyje dokładnie tak długo, jak jest
 * aktualny, a WeakMap sprząta go razem ze starym rejestrem.
 */
interface AreaIndex {
  devices: HomeAssistant['devices'];
  byArea: Map<string, HassEntityRegistryEntry[]>;
  /** Cache encji piętra — ważny dla tej samej tożsamości `hass.areas`. */
  byFloor: Map<string, { areas: HomeAssistant['areas']; entries: EntityEntries }>;
}

const areaIndexCache = new WeakMap<object, AreaIndex>();

function areaIndex(hass: HomeAssistant): AreaIndex | undefined {
  const entities = hass?.entities;
  if (!entities) return undefined;
  const cached = areaIndexCache.get(entities);
  if (cached && cached.devices === hass.devices) return cached;

  const byArea = new Map<string, HassEntityRegistryEntry[]>();
  for (const id in entities) {
    const entry = entities[id]!;
    if (entry.hidden_by || entry.disabled_by) continue;
    // Własne area encji wygrywa; dopiero jego brak (null/undefined)
    // oznacza dziedziczenie po urządzeniu.
    const areaId =
      entry.area_id ??
      (entry.device_id ? hass.devices?.[entry.device_id]?.area_id : undefined);
    if (!areaId) continue;
    const list = byArea.get(areaId);
    if (list) list.push(entry);
    else byArea.set(areaId, [entry]);
  }
  const index: AreaIndex = { devices: hass.devices, byArea, byFloor: new Map() };
  areaIndexCache.set(entities, index);
  return index;
}

/**
 * Zwraca wszystkie wpisy registry encji przypisane do podanego area —
 * bezpośrednio lub przez urządzenie. Encje ukryte / wyłączone są pomijane.
 * Wynik pochodzi z indeksu (ta sama tablica dla tego samego rejestru) —
 * nie mutuj go; do sortowania/filtrowania zrób kopię.
 */
export function getEntitiesInArea(
  hass: HomeAssistant,
  areaId: string,
): EntityEntries {
  return areaIndex(hass)?.byArea.get(areaId) ?? NO_ENTRIES;
}

/** Lista area należących do podanego floor-a. */
export function getAreasInFloor(
  hass: HomeAssistant,
  floorId: string,
): HassArea[] {
  if (!hass?.areas) return [];
  return Object.values(hass.areas).filter((area) => area.floor_id === floorId);
}

/**
 * Zwraca wszystkie encje ze wszystkich area należących do floor-a.
 * Deduplikuje (encja z urządzeniem przypisanym może wylądować w wielu area
 * jeśli inconsistent — ale w praktyce area_id jest flat per device).
 * Wynik jest cache'owany na tożsamość rejestru i `hass.areas`.
 */
export function getEntitiesInFloor(
  hass: HomeAssistant,
  floorId: string,
): EntityEntries {
  const index = areaIndex(hass);
  if (!index) return NO_ENTRIES;
  const cached = index.byFloor.get(floorId);
  if (cached && cached.areas === hass.areas) return cached.entries;

  const seen = new Set<string>();
  const result: HassEntityRegistryEntry[] = [];
  for (const area of getAreasInFloor(hass, floorId)) {
    for (const entry of index.byArea.get(area.area_id) ?? NO_ENTRIES) {
      if (seen.has(entry.entity_id)) continue;
      seen.add(entry.entity_id);
      result.push(entry);
    }
  }
  index.byFloor.set(floorId, { areas: hass.areas, entries: result });
  return result;
}

/** Filtruje wpisy registry po domenie (prefiks `entity_id` przed kropką). */
export function filterByDomain(
  entries: EntityEntries,
  domain: string,
): HassEntityRegistryEntry[] {
  const prefix = `${domain}.`;
  return entries.filter((entry) => entry.entity_id.startsWith(prefix));
}

/**
 * Filtruje encje binary_sensor po `device_class`. Sprawdza w kolejności:
 * 1. `hass.states[id].attributes.device_class` — efektywna klasa (z override)
 * 2. `hass.entities[id].device_class` — user override z Entity Options
 * 3. `hass.entities[id].original_device_class` — native z integracji
 *
 * Niektóre integracje (np. SATEL Integra) nie propagują user override
 * do state.attributes, stąd fallback przez registry.
 */
export function filterBinarySensorDeviceClass(
  hass: HomeAssistant,
  entries: EntityEntries,
  deviceClass: string,
): HassEntityRegistryEntry[] {
  return entries.filter((entry) => {
    if (!entry.entity_id.startsWith('binary_sensor.')) return false;
    const state: HassEntity | undefined = hass.states?.[entry.entity_id];
    const stateClass = state?.attributes?.device_class;
    if (stateClass === deviceClass) return true;
    // Fallback #1: display-entry in hass.entities (inconsistently populated).
    const registryEntry = hass.entities?.[entry.entity_id] ?? entry;
    const regClass =
      registryEntry.device_class ?? registryEntry.original_device_class ?? null;
    if (regClass === deviceClass) return true;
    // Fallback #2: globalny cache pobrany przez WebSocket — jedyne pewne
    // źródło user override (np. SATEL + „Pokaż jako klasę urządzenia").
    return registryDeviceClass(entry.entity_id) === deviceClass;
  });
}

/** Zwraca obiekt stanu dla encji (skrót do `hass.states[entity_id]`). */
export function getState(
  hass: HomeAssistant,
  entityId: string,
): HassEntity | undefined {
  return hass.states?.[entityId];
}


/**
 * Odfiltrowuje encje, których user nie chce widzieć w auto-listach popupu:
 * ukryte/wyłączone w rejestrze HA, kategorie config/diagnostic oraz stany
 * unavailable/unknown (lub brak stanu). Jawne listy usera NIE są filtrowane.
 */
export function filterDisplayable(
  hass: HomeAssistant,
  entries: EntityEntries,
): HassEntityRegistryEntry[] {
  return entries.filter((e) => {
    const frontend = hass.entities?.[e.entity_id] as
      | (HassEntityRegistryEntry & { hidden?: boolean; entity_category?: string | null })
      | undefined;
    const reg = { ...e, ...(frontend ?? {}) } as HassEntityRegistryEntry & {
      hidden?: boolean;
      entity_category?: string | null;
    };
    if (reg.hidden === true || reg.hidden_by || reg.disabled_by) return false;
    if (reg.entity_category) return false;
    const st = hass.states?.[e.entity_id];
    if (!st) return false;
    if (st.state === 'unavailable' || st.state === 'unknown') return false;
    return true;
  });
}

/**
 * Członkowie encji-grupy albo `undefined`, gdy to pojedyncze urządzenie.
 *
 * Dwa źródła: pomocnik „Grupa świateł" HA wystawia `entity_id`, a nowsze
 * integracje (np. sterownik główny WLED) — `group_entities`. Ten drugi
 * przypadek jest ważny dla suwaka jasności: WLED mnoży jasność sterownika
 * przez jasność segmentu, więc skalowanie obu naraz ściemniałoby podwójnie.
 * Traktowany jak grupa, sterownik oddaje komendy swoim segmentom.
 */
export function groupMemberIds(
  state: { attributes?: Record<string, unknown> } | undefined,
): string[] | undefined {
  const attrs = state?.attributes;
  if (!attrs) return undefined;
  for (const key of ['entity_id', 'group_entities'] as const) {
    const v = attrs[key];
    if (Array.isArray(v) && v.length > 0) {
      return v.filter((m): m is string => typeof m === 'string');
    }
  }
  return undefined;
}

/** Czy encja `light.*` jest grupą (pomocnik „Grupa światła", sterownik WLED). */
export function isLightGroupEntity(hass: HomeAssistant, entityId: string): boolean {
  return groupMemberIds(hass.states?.[entityId]) !== undefined;
}

/**
 * Odfiltrowuje grupy świateł — zliczenia i listy chipów operują wyłącznie
 * na encjach bezpośrednich, żeby jedna żarówka nie liczyła się podwójnie
 * (raz sama, raz przez grupę pomieszczenia).
 */
export function excludeLightGroups(
  hass: HomeAssistant,
  entries: EntityEntries,
): HassEntityRegistryEntry[] {
  return entries.filter((e) => !isLightGroupEntity(hass, e.entity_id));
}

/**
 * Encje NIEDOSTĘPNE (stan `unavailable`) w podanym zbiorze — z tym samym
 * filtrem rejestru co filterDisplayable (bez ukrytych/wyłączonych i
 * kategorii config/diagnostic), ale wybiera właśnie te, które
 * filterDisplayable odrzuca stanem.
 */
export function unavailableEntityIds(
  hass: HomeAssistant,
  entries: EntityEntries,
): string[] {
  return entries
    .filter((e) => {
      const frontend = hass.entities?.[e.entity_id] as
        | (HassEntityRegistryEntry & {
            hidden?: boolean;
            entity_category?: string | null;
          })
        | undefined;
      const reg = { ...e, ...(frontend ?? {}) } as HassEntityRegistryEntry & {
        hidden?: boolean;
        entity_category?: string | null;
      };
      if (reg.hidden === true || reg.hidden_by || reg.disabled_by) return false;
      if (reg.entity_category) return false;
      return hass.states?.[e.entity_id]?.state === 'unavailable';
    })
    .map((e) => e.entity_id);
}
