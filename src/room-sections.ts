// Czysta logika sekcji popupu pomieszczenia — auto-chipy, normalizacja
// speców sekcji i filtrowanie encji per sekcja. Wydzielone ze
// stratum-room-card (dług techniczny) — testowalne w Vitest.

import type {
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
  RoomEntityItemConfig,
  RoomEntityListConfig,
  RoomSectionConfig,
  RoomSectionSpec,
  RoomSectionType,
} from './types.js';
import {
  filterByDomain,
  filterBinarySensorDeviceClass,
  filterDisplayable,
} from './area-entities.js';
import { SECTION_LABEL } from './section-defaults.js';
/**
 * Auto-wybór chipów dla room card: lights + motion zawsze (nawet gdy 0),
 * windows/doors/leak tylko gdy coś aktywne. Plus entity-chipy temperatury
 * i wilgotności jeśli są sensory.
 */
export function autoRoomChips(
  hass: HomeAssistant,
  entries: readonly HassEntityRegistryEntry[],
): ChipConfig[] {
  const chips: ChipConfig[] = [
    { type: 'lights' },
    // Styl mushroom: czas od ostatniego ruchu (16s / 5min / 2h) zamiast licznika.
    { type: 'motion', show_last_changed: true },
    { type: 'windows', show_when_zero: false },
    { type: 'doors', show_when_zero: false },
    { type: 'leak', show_when_zero: false },
  ];
  const temp = entries.find(
    (e) => hass.states?.[e.entity_id]?.attributes?.device_class === 'temperature',
  );
  if (temp) chips.push({ type: 'temperature' });
  const hum = entries.find(
    (e) => hass.states?.[e.entity_id]?.attributes?.device_class === 'humidity',
  );
  if (hum) chips.push({ type: 'humidity' });
  return chips;
}


/**
 * Typy sekcji, o których już ostrzegliśmy w konsoli. normalizeSections
 * leci przy każdym renderze popupu — bez tej pamięci literówka w YAML
 * zalewałaby konsolę tym samym ostrzeżeniem kilka razy na sekundę.
 */
const warnedSectionTypes = new Set<string>();

/** Czy `type` to znany typ sekcji (klucz SECTION_LABEL, nie z prototypu). */
export function isKnownSectionType(type: unknown): type is RoomSectionType {
  return (
    typeof type === 'string' &&
    Object.prototype.hasOwnProperty.call(SECTION_LABEL, type)
  );
}

/**
 * Normalizuje spec sekcji do pełnego configu. Explicit wpisy NADPISUJĄ
 * konfigurację auto-wykrytych typów; auto-typy spoza listy są DOKLEJANE
 * (wyłączanie bloków robi popup_order.hidden albo section.hidden).
 *
 * Wpisy nieprawidłowe (null z pustej pozycji listy YAML, nie-obiekty,
 * nieznany typ jak `light` zamiast `lights`) są POMIJANE z jednym
 * ostrzeżeniem w konsoli. Nie rzucamy: ta funkcja biegnie w renderze,
 * także popupu osadzonego w karcie piętra — wyjątek zostawiłby pustą
 * kartę albo pusty arkusz zamiast reszty sekcji.
 */
export function normalizeSections(
  input: RoomSectionSpec[] | undefined,
  autoDetected: RoomSectionType[],
): RoomSectionConfig[] {
  const explicit: RoomSectionConfig[] = [];
  for (const raw of (Array.isArray(input) ? input : []) as unknown[]) {
    const s =
      typeof raw === 'string'
        ? ({ type: raw } as RoomSectionConfig)
        : raw && typeof raw === 'object'
        ? (raw as RoomSectionConfig)
        : null;
    if (!s) continue;
    if (!isKnownSectionType(s.type)) {
      const key = String(s.type);
      if (!warnedSectionTypes.has(key)) {
        warnedSectionTypes.add(key);
        console.warn(
          `[stratum-card] Nieznany typ sekcji „${key}" — pomijam. Dostępne: ${Object.keys(
            SECTION_LABEL,
          ).join(', ')}.`,
        );
      }
      continue;
    }
    explicit.push(s);
  }
  if (explicit.length === 0) return autoDetected.map((t) => ({ type: t }));
  const seen = new Set(explicit.map((s) => s.type));
  return [
    ...explicit,
    ...autoDetected.filter((t) => !seen.has(t)).map((t) => ({ type: t }) as RoomSectionConfig),
  ];
}

/**
 * Jawna lista mediów (`media_list`) jako WARSTWA nad auto-sekcją, nie
 * osobny renderer: zwraca widoczne odtwarzacze w kolejności listy oraz
 * override'y nazw/ikon/akcji (tylko name/icon/tap_action — reszta pól
 * pozycji nie dotyczy zakładek i kafli odtwarzaczy). Dzięki temu edycja listy (zmiana nazwy,
 * ukrycie Chromecasta) nie wyłącza zakładek, Grupuj/Źródło ani
 * hide_when_off — wcześniej każda zmiana w edytorze przełączała popup na
 * stary układ „featured".
 *
 * Separatory pomijamy (w pasku zakładek nie mają sensu), ukryte też, a
 * encje bez stanu w hass — żeby nie pokazywać martwej zakładki. Encje
 * spoza obszaru działają: bez wpisu w rejestrze dostają minimalny
 * `{ entity_id }`, tak jak w jawnej liście rolet.
 */
export function resolveMediaList(
  hass: HomeAssistant,
  cfg: RoomEntityListConfig | undefined,
): { entries: HassEntityRegistryEntry[]; overrides: Map<string, RoomEntityItemConfig> } {
  const entries: HassEntityRegistryEntry[] = [];
  const overrides = new Map<string, RoomEntityItemConfig>();
  const seen = new Set<string>();
  for (const item of cfg?.items ?? []) {
    if (!item || item.hidden || item.separator || !item.entity) continue;
    const id = item.entity;
    if (seen.has(id) || !hass.states?.[id]) continue;
    seen.add(id);
    entries.push(hass.entities?.[id] ?? ({ entity_id: id } as HassEntityRegistryEntry));
    const ov: RoomEntityItemConfig = {};
    if (item.name) ov.name = item.name;
    if (item.icon) ov.icon = item.icon;
    if (item.tap_action) ov.tap_action = item.tap_action;
    if (Object.keys(ov).length > 0) overrides.set(id, ov);
  }
  return { entries, overrides };
}

/** Filtry per sekcja — jakie encje do niej należą. */
export function entitiesForSection(
  hass: HomeAssistant,
  entries: readonly HassEntityRegistryEntry[],
  section: RoomSectionType,
): HassEntityRegistryEntry[] {
  return filterDisplayable(hass, rawEntitiesForSection(hass, entries, section));
}

export function rawEntitiesForSection(
  hass: HomeAssistant,
  entries: readonly HassEntityRegistryEntry[],
  section: RoomSectionType,
): HassEntityRegistryEntry[] {
  switch (section) {
    case 'lights':
      return filterByDomain(entries, 'light');
    case 'covers':
      return filterByDomain(entries, 'cover');
    case 'windows':
      return filterBinarySensorDeviceClass(hass, entries, 'window');
    case 'doors':
      return filterBinarySensorDeviceClass(hass, entries, 'door');
    case 'climate':
      return filterByDomain(entries, 'climate');
    case 'media':
      return filterByDomain(entries, 'media_player');
    case 'fans':
      return filterByDomain(entries, 'fan');
    case 'switches':
      return filterByDomain(entries, 'switch');
    case 'scenes':
      return filterByDomain(entries, 'scene');
    case 'summary':
    case 'custom':
      return [];
    default:
      // Siatka bezpieczeństwa: nieznany typ (literówka w YAML, która
      // przeszła obok normalizeSections) daje pustą sekcję zamiast
      // undefined.filter → TypeError w renderze i pustej karty.
      return [];
  }
}

/** Auto-discover: sekcje dla których są encje. Kolejność — utrwalona. */
export function autoSections(
  hass: HomeAssistant,
  entries: readonly HassEntityRegistryEntry[],
): RoomSectionType[] {
  // Bez `doors`, `windows` i `switches` — decyzja usera: statusy drzwi
  // i okien żyją w klikalnych chipach nagłówka (popup listy aktywnych),
  // przełączniki-żarówki dublują światła. Jawna sekcja w configu
  // (`sections: [{type: 'windows'}]`) nadal działa.
  const order: RoomSectionType[] = [
    'scenes',
    'lights',
    'covers',
    'climate',
    'media',
    'fans',
  ];
  return order.filter((s) => entitiesForSection(hass, entries, s).length > 0);
}
