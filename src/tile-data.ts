// Kalkulacja danych dla pojedynczej pozycji pomieszczenia (row albo tile).
//
// Łączy globalną konfigurację wyglądu (`display_config.fields`) z per-pokojowym
// override encji (`RoomConfig.field_entities`). Gdy override nie jest podany —
// auto-discovery z encji area (primary + merge_with).

import type {
  DisplayConditionConfig,
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
  /** Surowa wartość temperatury (do reguł warunkowych). */
  temperatureValue?: number;
  humidity?: string;
  /** Surowa wartość wilgotności (do reguł warunkowych). */
  humidityValue?: number;
  lightsOn: number;
  motion: boolean;
  windowsOpen: number;
  doorsOpen: number;
  /**
   * Kolor pierwszego aktywnego światła z `rgb_color` w pomieszczeniu.
   * Gdy żadne światło nie świeci albo nie ma `rgb_color` — undefined.
   * Sformatowane jako `rgb(r, g, b)`.
   */
  lightsRgb?: string;
  /** Jasność 0–1 (z atrybutu `brightness` 0-255). */
  lightsBrightness?: number;
}

/** Overrides stylu wyliczone z reguł `display_config.conditions`. */
export interface ConditionOverride {
  border_color?: string;
  border_width?: number;
  accent_color?: string;
  background_color?: string;
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

/** Pierwszy sensor z zadanym `device_class` spośród `entries`; sformatowana wartość + liczbowa. */
function firstAttrSensor(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  deviceClass: string,
  fallbackUnit: string,
): { formatted: string; value: number } | undefined {
  for (const entry of entries) {
    if (!entry.entity_id.startsWith('sensor.')) continue;
    const state = hass.states?.[entry.entity_id];
    if (!state) continue;
    if (state.attributes?.device_class !== deviceClass) continue;
    const value = parseFloat(state.state);
    if (Number.isNaN(value)) continue;
    const unit =
      (state.attributes?.unit_of_measurement as string | undefined) ?? fallbackUnit;
    return { formatted: `${value.toFixed(1)} ${unit}`, value };
  }
  return undefined;
}

/** Sformatuj jeden stan encji jako liczba + unit. */
function formatSensorState(
  hass: HomeAssistant,
  entityId: string,
  fallbackUnit: string,
): { formatted: string; value: number } | undefined {
  const state = hass.states?.[entityId];
  if (!state) return undefined;
  const value = parseFloat(state.state);
  if (Number.isNaN(value)) return undefined;
  const unit =
    (state.attributes?.unit_of_measurement as string | undefined) ?? fallbackUnit;
  return { formatted: `${value.toFixed(1)} ${unit}`, value };
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
  const temp = fieldEntities?.temperature
    ? formatSensorState(hass, fieldEntities.temperature, '°C')
    : firstAttrSensor(hass, entries, 'temperature', '°C');

  const hum = fieldEntities?.humidity
    ? formatSensorState(hass, fieldEntities.humidity, '%')
    : firstAttrSensor(hass, entries, 'humidity', '%');

  const lightsIds = resolveFieldEntityIds(hass, entries, 'lights', fieldEntities);
  const motionIds = resolveFieldEntityIds(hass, entries, 'motion', fieldEntities);
  const windowsIds = resolveFieldEntityIds(hass, entries, 'windows', fieldEntities);
  const doorsIds = resolveFieldEntityIds(hass, entries, 'doors', fieldEntities);

  const { rgb: lightsRgb, brightness: lightsBrightness } = readLightsColor(
    hass,
    lightsIds,
  );

  return {
    temperature: temp?.formatted,
    temperatureValue: temp?.value,
    humidity: hum?.formatted,
    humidityValue: hum?.value,
    lightsOn: countOn(hass, lightsIds),
    motion: anyOn(hass, motionIds),
    windowsOpen: countOn(hass, windowsIds),
    doorsOpen: countOn(hass, doorsIds),
    lightsRgb,
    lightsBrightness,
  };
}

/**
 * Pierwsze aktywne światło z `rgb_color` daje nam kolor akcentu.
 * Jeśli żadne nie ma `rgb_color` (np. tryb CT), próbujemy przeliczyć
 * z `color_temp_kelvin`. Jasność z atrybutu `brightness` (0-255 → 0-1).
 */
function readLightsColor(
  hass: HomeAssistant,
  entityIds: string[],
): { rgb?: string; brightness?: number } {
  for (const id of entityIds) {
    const state = hass.states?.[id];
    if (!state || state.state !== 'on') continue;
    const brightnessRaw = state.attributes?.brightness as number | undefined;
    const brightness =
      typeof brightnessRaw === 'number'
        ? Math.max(0, Math.min(1, brightnessRaw / 255))
        : undefined;
    const rgb = state.attributes?.rgb_color as
      | [number, number, number]
      | undefined;
    if (Array.isArray(rgb) && rgb.length === 3) {
      return { rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, brightness };
    }
    const kelvin = state.attributes?.color_temp_kelvin as number | undefined;
    if (typeof kelvin === 'number' && kelvin > 0) {
      const [r, g, b] = kelvinToRgb(kelvin);
      return { rgb: `rgb(${r}, ${g}, ${b})`, brightness };
    }
  }
  return {};
}

/**
 * Przybliżona konwersja CCT → RGB wg algorytmu Tannera Helland.
 * Wystarczająco dobra dla wizualnego akcentu kafla.
 */
function kelvinToRgb(k: number): [number, number, number] {
  const temp = Math.max(1000, Math.min(40000, k)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }
  const clamp = (x: number): number => Math.max(0, Math.min(255, Math.round(x)));
  return [clamp(r), clamp(g), clamp(b)];
}

/**
 * Sprawdza pojedynczą regułę względem danych. Zwraca true/false — wywołujący
 * aplikuje overrides z pierwszej spełnionej reguły.
 */
function matchCondition(data: TileData, cond: DisplayConditionConfig): boolean {
  const { field, when, value } = cond;
  const v = value ?? 0;

  // Wartości dla pól liczbowych vs binarnych.
  switch (field) {
    case 'temperature': {
      const t = data.temperatureValue;
      if (when === 'any_on') return t !== undefined;
      if (when === 'none_on') return t === undefined;
      if (t === undefined) return false;
      if (when === 'gt') return t > v;
      if (when === 'lt') return t < v;
      if (when === 'eq') return t === v;
      return false;
    }
    case 'humidity': {
      const h = data.humidityValue;
      if (when === 'any_on') return h !== undefined;
      if (when === 'none_on') return h === undefined;
      if (h === undefined) return false;
      if (when === 'gt') return h > v;
      if (when === 'lt') return h < v;
      if (when === 'eq') return h === v;
      return false;
    }
    case 'lights': {
      const n = data.lightsOn;
      if (when === 'any_on') return n > 0;
      if (when === 'none_on') return n === 0;
      if (when === 'count_gt') return n > v;
      return false;
    }
    case 'motion': {
      if (when === 'any_on') return data.motion;
      if (when === 'none_on') return !data.motion;
      return false;
    }
    case 'windows': {
      const n = data.windowsOpen;
      if (when === 'any_on') return n > 0;
      if (when === 'none_on') return n === 0;
      if (when === 'count_gt') return n > v;
      return false;
    }
    case 'doors': {
      const n = data.doorsOpen;
      if (when === 'any_on') return n > 0;
      if (when === 'none_on') return n === 0;
      if (when === 'count_gt') return n > v;
      return false;
    }
    default:
      return false;
  }
}

/**
 * Zwraca overrides z pierwszej spełnionej reguły. `undefined` gdy żadna
 * reguła nie pasuje albo lista pusta/brak.
 */
export function evaluateConditions(
  data: TileData,
  conditions?: DisplayConditionConfig[],
): ConditionOverride | undefined {
  if (!conditions || conditions.length === 0) return undefined;
  for (const cond of conditions) {
    if (matchCondition(data, cond)) {
      const override: ConditionOverride = {};
      if (cond.border_color) override.border_color = cond.border_color;
      if (typeof cond.border_width === 'number') override.border_width = cond.border_width;
      if (cond.accent_color) override.accent_color = cond.accent_color;
      if (cond.background_color) override.background_color = cond.background_color;
      return Object.keys(override).length > 0 ? override : undefined;
    }
  }
  return undefined;
}

/** Efektywna lista pól — `displayConfig.fields` z fallbackiem do DEFAULT_FIELDS. */
export function effectiveFields(displayConfig?: DisplayConfig): TileField[] {
  return displayConfig?.fields ?? DEFAULT_FIELDS;
}
