// Czysta logika sekcji popupu pomieszczenia — auto-chipy, normalizacja
// speców sekcji i filtrowanie encji per sekcja. Wydzielone ze
// stratum-room-card (dług techniczny) — testowalne w Vitest.

import type {
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
  RoomSectionConfig,
  RoomSectionSpec,
  RoomSectionType,
} from './types.js';
import {
  filterByDomain,
  filterBinarySensorDeviceClass,
  filterDisplayable,
} from './area-entities.js';
/**
 * Auto-wybór chipów dla room card: lights + motion zawsze (nawet gdy 0),
 * windows/doors/leak tylko gdy coś aktywne. Plus entity-chipy temperatury
 * i wilgotności jeśli są sensory.
 */
export function autoRoomChips(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
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
 * Normalizuje spec sekcji do pełnego configu. Explicit wpisy NADPISUJĄ
 * konfigurację auto-wykrytych typów; auto-typy spoza listy są DOKLEJANE
 * (wyłączanie bloków robi popup_order.hidden albo section.hidden).
 */
export function normalizeSections(
  input: RoomSectionSpec[] | undefined,
  autoDetected: RoomSectionType[],
): RoomSectionConfig[] {
  const explicit = (input ?? []).map((s) =>
    typeof s === 'string' ? ({ type: s } as RoomSectionConfig) : s,
  );
  if (explicit.length === 0) return autoDetected.map((t) => ({ type: t }));
  const seen = new Set(explicit.map((s) => s.type));
  return [
    ...explicit,
    ...autoDetected.filter((t) => !seen.has(t)).map((t) => ({ type: t }) as RoomSectionConfig),
  ];
}

/** Filtry per sekcja — jakie encje do niej należą. */
export function entitiesForSection(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  section: RoomSectionType,
): HassEntityRegistryEntry[] {
  return filterDisplayable(hass, rawEntitiesForSection(hass, entries, section));
}

export function rawEntitiesForSection(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
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
  }
}

/** Auto-discover: sekcje dla których są encje. Kolejność — utrwalona. */
export function autoSections(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
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
