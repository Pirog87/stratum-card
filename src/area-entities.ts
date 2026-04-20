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
  entries: HassEntityRegistryEntry[],
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

