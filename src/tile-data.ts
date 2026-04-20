// Kalkulacja danych dla pojedynczej pozycji pomieszczenia (row albo tile).
//
// Łączy globalną konfigurację wyglądu (`display_config.fields`) z per-pokojowym
// override encji (`RoomConfig.field_entities`). Gdy override nie jest podany —
// auto-discovery z encji area (primary + merge_with).

import type {
  DisplayConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
  TileField,
  TileFieldEntities,
} from './types.js';
import { filterBinarySensorDeviceClass, filterByDomain } from './area-entities.js';

export const DEFAULT_FIELDS: TileField[] = ['temperature', 'lights', 'motion'];

/** Wartości poszczególnych pól — gotowe do wyświetlenia w row/tile. */
export interface TileData {
  temperature?: string;
  humidity?: string;
  lightsOn: number;
  motion: boolean;
  windowsOpen: number;
  doorsOpen: number;
}

/**
 * Liczy ile encji z listy `entity_ids` ma stan w zbiorze `onStates` (default `['on']`).
 */
function countOn(
  hass: HomeAssistant,
  entityIds: string[],
  onStates: string[] = ['on'],
): number {
  let n = 0;
  for (const id of entityIds) {
    const s = hass.states?.[id]?.state;
    if (s && onStates.includes(s)) n += 1;
  }
  return n;
}

function anyOn(
  hass: HomeAssistant,
  entityIds: string[],
  onStates: string[] = ['on'],
): boolean {
  for (const id of entityIds) {
    const s = hass.states?.[id]?.state;
    if (s && onStates.includes(s)) return true;
  }
  return false;
}

/** Pierwszy sensor z zadanym `device_class` spośród `entries`; sformatowana wartość. */
function firstAttrSensor(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  deviceClass: string,
  fallbackUnit: string,
): string | undefined {
  for (const entry of entries) {
    if (!entry.entity_id.startsWith('sensor.')) continue;
    const state = hass.states?.[entry.entity_id];
    if (!state) continue;
    if (state.attributes?.device_class !== deviceClass) continue;
    const value = parseFloat(state.state);
    if (Number.isNaN(value)) continue;
    const unit =
      (state.attributes?.unit_of_measurement as string | undefined) ?? fallbackUnit;
    return `${value.toFixed(1)} ${unit}`;
  }
  return undefined;
}

/** Sformatuj jeden stan encji jako liczba + unit. */
function formatSensorState(
  hass: HomeAssistant,
  entityId: string,
  fallbackUnit: string,
): string | undefined {
  const state = hass.states?.[entityId];
  if (!state) return undefined;
  const value = parseFloat(state.state);
  if (Number.isNaN(value)) return undefined;
  const unit =
    (state.attributes?.unit_of_measurement as string | undefined) ?? fallbackUnit;
  return `${value.toFixed(1)} ${unit}`;
}

/**
 * Dla zadanego pola zwróć listę encji z override (`fieldEntities[field]`)
 * lub filtr z auto-discovery.
 */
function resolveFieldEntityIds(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  field: TileField,
  fieldEntities?: TileFieldEntities,
): string[] {
  switch (field) {
    case 'lights': {
      if (fieldEntities?.lights?.length) return fieldEntities.lights;
      return filterByDomain(entries, 'light').map((e) => e.entity_id);
    }
    case 'motion': {
      if (fieldEntities?.motion?.length) return fieldEntities.motion;
      const motion = filterBinarySensorDeviceClass(hass, entries, 'motion');
      const occupancy = filterBinarySensorDeviceClass(hass, entries, 'occupancy');
      return [...motion, ...occupancy].map((e) => e.entity_id);
    }
    case 'windows': {
      if (fieldEntities?.windows?.length) return fieldEntities.windows;
      return filterBinarySensorDeviceClass(hass, entries, 'window').map(
        (e) => e.entity_id,
      );
    }
    case 'doors': {
      if (fieldEntities?.doors?.length) return fieldEntities.doors;
      return filterBinarySensorDeviceClass(hass, entries, 'door').map(
        (e) => e.entity_id,
      );
    }
    default:
      return [];
  }
}

/**
 * Wylicza dane dla wszystkich pól które mogą być wyświetlone w row/tile.
 * Zwraca pełny zestaw — komponent decyduje które renderować na podstawie
 * `displayConfig.fields`.
 */
export function computeTileData(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  fieldEntities?: TileFieldEntities,
): TileData {
  const temperature = fieldEntities?.temperature
    ? formatSensorState(hass, fieldEntities.temperature, '°C')
    : firstAttrSensor(hass, entries, 'temperature', '°C');

  const humidity = fieldEntities?.humidity
    ? formatSensorState(hass, fieldEntities.humidity, '%')
    : firstAttrSensor(hass, entries, 'humidity', '%');

  const lightsIds = resolveFieldEntityIds(hass, entries, 'lights', fieldEntities);
  const motionIds = resolveFieldEntityIds(hass, entries, 'motion', fieldEntities);
  const windowsIds = resolveFieldEntityIds(hass, entries, 'windows', fieldEntities);
  const doorsIds = resolveFieldEntityIds(hass, entries, 'doors', fieldEntities);

  return {
    temperature,
    humidity,
    lightsOn: countOn(hass, lightsIds),
    motion: anyOn(hass, motionIds),
    windowsOpen: countOn(hass, windowsIds),
    doorsOpen: countOn(hass, doorsIds),
  };
}

/** Efektywna lista pól — `displayConfig.fields` z fallbackiem do DEFAULT_FIELDS. */
export function effectiveFields(displayConfig?: DisplayConfig): TileField[] {
  return displayConfig?.fields ?? DEFAULT_FIELDS;
}
