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

/**
 * Zwraca wszystkie wpisy registry encji przypisane do podanego area —
 * bezpośrednio lub przez urządzenie. Encje ukryte / wyłączone są pomijane.
 */
export function getEntitiesInArea(
  hass: HomeAssistant,
  areaId: string,
): HassEntityRegistryEntry[] {
  if (!hass?.entities) return [];

  return Object.values(hass.entities).filter((entry) => {
    if (entry.hidden_by || entry.disabled_by) return false;

    if (entry.area_id === areaId) return true;

    if (entry.area_id == null && entry.device_id) {
      const device = hass.devices?.[entry.device_id];
      return device?.area_id === areaId;
    }

    return false;
  });
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
 */
export function getEntitiesInFloor(
  hass: HomeAssistant,
  floorId: string,
): HassEntityRegistryEntry[] {
  const areas = getAreasInFloor(hass, floorId);
  const seen = new Set<string>();
  const result: HassEntityRegistryEntry[] = [];
  for (const area of areas) {
    for (const entry of getEntitiesInArea(hass, area.area_id)) {
      if (seen.has(entry.entity_id)) continue;
      seen.add(entry.entity_id);
      result.push(entry);
    }
  }
  return result;
}

/** Filtruje wpisy registry po domenie (prefiks `entity_id` przed kropką). */
export function filterByDomain(
  entries: HassEntityRegistryEntry[],
  domain: string,
): HassEntityRegistryEntry[] {
  const prefix = `${domain}.`;
  return entries.filter((entry) => entry.entity_id.startsWith(prefix));
}

/**
 * Filtruje encje binary_sensor po `device_class` z `attributes` w `hass.states`.
 * Przykładowe device_class: `motion`, `occupancy`, `window`, `door`.
 */
export function filterBinarySensorDeviceClass(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  deviceClass: string,
): HassEntityRegistryEntry[] {
  return entries.filter((entry) => {
    if (!entry.entity_id.startsWith('binary_sensor.')) return false;
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

