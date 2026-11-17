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
    // Ukryta w HA = użytkownik nie chce jej widzieć nigdzie. Sprawdzamy
    // `hidden` z rejestru wyświetlania — dawny warunek na `hidden_by` /
    // `disabled_by` nigdy nie odpalał, bo HA tych pól tu nie wysyła
    // (a wyłączonych encji w `hass.entities` po prostu nie ma).
    if (entry.hidden === true) continue;
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
 * bezpośrednio lub przez urządzenie. Encje ukryte (`hidden`) są pomijane;
 * wyłączonych HA w ogóle nie wysyła. Encje config/diagnostic ZOSTAJĄ —
 * odfiltrowują je dopiero konsumenci (patrz `isPrimaryEntity`), bo np.
 * baterie są diagnostyczne z natury i chip „niska bateria" ich potrzebuje.
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
 * 1. `hass.states[id].attributes.device_class` — efektywna klasa. HA core
 *    sam wpisuje tu nadpisanie z „Pokaż jako" (registry entry ma
 *    pierwszeństwo przed klasą integracji), więc to źródło wystarcza także
 *    dla SATEL — sprawdzone na żywej instancji (okna/drzwi SATEL mają klasę
 *    w atrybutach stanu).
 *
 * Dawniej był tu też odczyt `device_class` z `hass.entities`, ale rejestr
 * wyświetlania HA tego pola nie zawiera — warunek był martwy. Wcześniej
 * jeszcze był tu trzeci poziom: pełny rejestr encji pobierany przez
 * WebSocket (~3 MB przy 5 tys. encji) przy każdym starcie i po każdej
 * zmianie rejestru, w tej samej kolejce co pierwsze tapnięcia użytkownika.
 * Nie wnosił niczego, czego nie ma w (1), więc go usunęliśmy.
 */
/**
 * Podzbiór `binary_sensor.*` danej listy wpisów. Filtr klas woła się
 * kilkanaście razy na wiersz (ruch, obecność, okna, drzwi, alarmy…) i za
 * każdym razem przeglądał całą strefę — w kuchni kilkaset encji, z czego
 * czujników binarnych jest kilkanaście. Lista wpisów ma stałą tożsamość
 * do zmiany rejestru, więc podzbiór liczymy raz.
 */
const binarySubset = new WeakMap<EntityEntries, readonly HassEntityRegistryEntry[]>();

function binarySensorsOf(entries: EntityEntries): readonly HassEntityRegistryEntry[] {
  let sub = binarySubset.get(entries);
  if (!sub) {
    sub = entries.filter((e) => e.entity_id.startsWith('binary_sensor.'));
    binarySubset.set(entries, sub);
  }
  return sub;
}

export function filterBinarySensorDeviceClass(
  hass: HomeAssistant,
  entries: EntityEntries,
  deviceClass: string,
): HassEntityRegistryEntry[] {
  return binarySensorsOf(entries).filter((entry) => {
    const state: HassEntity | undefined = hass.states?.[entry.entity_id];
    return state?.attributes?.device_class === deviceClass;
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
 * Czy encja jest „pierwszoplanowa": nie ukryta i bez kategorii
 * config/diagnostic. Tylko takie bierzemy do auto-wykrywanych świateł,
 * ruchu, okien, drzwi i temperatury pomieszczenia.
 *
 * Dlaczego nie w indeksie area: baterie, czujniki sabotażu i problemów
 * integracje (Zigbee2MQTT, ZHA) oznaczają jako `diagnostic` z założenia —
 * chip „niska bateria" i alarmy muszą je dalej widzieć. Natomiast dioda
 * statusu punktu dostępowego UniFi (`config`, wystawiona jako `light.*`)
 * nie może robić z ciemnego pokoju „1 światło włączone", a temperatura
 * wewnętrzna wtyczki (`diagnostic`) — udawać temperatury pokoju.
 *
 * Wpis łączymy z `hass.entities` — wywołujący bywają testami albo
 * listami złożonymi ręcznie, nie zawsze wpisami prosto z rejestru.
 */
export function isPrimaryEntity(
  hass: HomeAssistant,
  e: HassEntityRegistryEntry,
): boolean {
  const reg = hass.entities?.[e.entity_id];
  if (e.hidden === true || reg?.hidden === true) return false;
  return !(e.entity_category ?? reg?.entity_category);
}

/**
 * Wynik `filterPrimary` zależy tylko od rejestru, nie od stanów — a wołamy
 * go kilka razy na wiersz przy każdym renderze (ruch, okna, drzwi,
 * temperatura, światła). Bez pamięci podręcznej przeglądanie kilkuset encji
 * kuchni co raport lampy kosztowało ok. 2–3 ms na render. Klucz: tożsamość
 * tablicy wpisów (z indeksu stref — stała do zmiany rejestru) i rejestru.
 */
const primaryCache = new WeakMap<
  EntityEntries,
  { entities: HomeAssistant['entities']; result: readonly HassEntityRegistryEntry[] }
>();

/** Tylko encje pierwszoplanowe (patrz `isPrimaryEntity`). */
export function filterPrimary(
  hass: HomeAssistant,
  entries: EntityEntries,
): readonly HassEntityRegistryEntry[] {
  const hit = primaryCache.get(entries);
  if (hit && hit.entities === hass.entities) return hit.result;
  const result = entries.filter((e) => isPrimaryEntity(hass, e));
  primaryCache.set(entries, { entities: hass.entities, result });
  return result;
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
    if (!isPrimaryEntity(hass, e)) return false;
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
 * Światła pokoju/piętra liczone i sterowane z auto-wykrywania: licznik
 * wiersza, chip „światła" w nagłówku, jego lista, smugi, włącznik i gest.
 * Jeden zbiór dla wszystkich — inaczej chip mówi „1", a jego lista jest
 * pusta, albo włącznik gasi coś, czego wiersz nie liczy.
 *
 *  1. Bez encji ukrytych i config/diagnostic (dioda AP UniFi, LED-y
 *     statusu) — patrz `isPrimaryEntity`.
 *  2. Grupę świateł (pomocnik HA, sterownik WLED) pomijamy tylko wtedy,
 *     gdy choć jeden jej członek zostaje w puli — wtedy liczą się
 *     członkowie, a grupa dublowałaby zliczenie. Grupa, której wszyscy
 *     członkowie są ukryci albo stoją w innym area, ZASTĘPUJE ich: bez
 *     tego pokój, w którym user ukrył żarówki za grupą, pokazywałby
 *     0 świateł, a gest nie miałby czego ściemnić.
 *  3. Niedostępnych NIE odrzucamy — mają się liczyć jako niedostępne
 *     (wzorzec off-pill), a nie znikać.
 */
export function countableLights(
  hass: HomeAssistant,
  entries: EntityEntries,
): HassEntityRegistryEntry[] {
  const pool = filterByDomain(filterPrimary(hass, entries), 'light');
  const inPool = new Set(pool.map((e) => e.entity_id));
  return pool.filter((e) => {
    const members = groupMemberIds(hass.states?.[e.entity_id]);
    if (!members) return true;
    return !members.some((m) => inPool.has(m));
  });
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
    .filter(
      (e) =>
        isPrimaryEntity(hass, e) && hass.states?.[e.entity_id]?.state === 'unavailable',
    )
    .map((e) => e.entity_id);
}
