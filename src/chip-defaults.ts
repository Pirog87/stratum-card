// Resolvery dla wszystkich typów chipów: ikony, kolory, wartości, aktywność.
//
// Każdy chip rozkłada się na trzy dane:
//   - label: co pokazać (string) — liczba albo stan
//   - active: czy chip jest wyróżniony (tak jakby count > 0)
//   - icon/color: defaultsy per typ, user override z configu

import type {
  BuiltInChipType,
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
} from './types.js';
import { filterByDomain, filterBinarySensorDeviceClass } from './area-entities.js';
import { resolveColor } from './colors.js';
import type { TemplateRenderer } from './template-renderer.js';

/**
 * Domyślny zestaw chipów pokazywanych gdy user nic nie skonfigurował.
 * - `lights` / `motion` — zawsze widoczne (show_when_zero default true)
 * - `windows` / `doors` / `leak` — widoczne tylko gdy coś jest aktywne
 *   (żeby pusty nagłówek nie zaśmiecał się liczbami „0")
 */
export const DEFAULT_CHIPS: ChipConfig[] = [
  { type: 'lights' },
  { type: 'motion' },
  { type: 'windows', show_when_zero: false },
  { type: 'doors', show_when_zero: false },
  { type: 'leak', show_when_zero: false },
];

const BUILTIN_ICON: Record<BuiltInChipType, string> = {
  lights: 'mdi:lightbulb',
  motion: 'mdi:motion-sensor',
  occupancy: 'mdi:account',
  windows: 'mdi:window-open-variant',
  doors: 'mdi:door-open',
  leak: 'mdi:water-alert',
  smoke: 'mdi:smoke-detector-variant',
  gas: 'mdi:gas-cylinder',
  co: 'mdi:molecule-co',
  problem: 'mdi:alert-circle-outline',
  battery_low: 'mdi:battery-alert-variant-outline',
};

const BUILTIN_COLOR: Record<BuiltInChipType, string> = {
  lights: 'var(--stratum-chip-lights-color, #ffc107)',
  motion: 'var(--stratum-chip-motion-color, #4caf50)',
  occupancy: 'var(--stratum-chip-occupancy-color, #4caf50)',
  windows: 'var(--stratum-chip-windows-color, #42a5f5)',
  doors: 'var(--stratum-chip-doors-color, #ba68c8)',
  leak: 'var(--stratum-chip-leak-color, #f44336)',
  smoke: 'var(--stratum-chip-smoke-color, #e53935)',
  gas: 'var(--stratum-chip-gas-color, #ff5722)',
  co: 'var(--stratum-chip-co-color, #d84315)',
  problem: 'var(--stratum-chip-problem-color, #ff9800)',
  battery_low: 'var(--stratum-chip-battery-color, #ff5252)',
};

const BUILTIN_TYPES: BuiltInChipType[] = [
  'lights',
  'motion',
  'occupancy',
  'windows',
  'doors',
  'leak',
  'smoke',
  'gas',
  'co',
  'problem',
  'battery_low',
];

function isBuiltin(t: string): t is BuiltInChipType {
  return (BUILTIN_TYPES as string[]).includes(t);
}

/** Deduplikuje encje po entity_id zachowując kolejność. */
function dedupe<T extends { entity_id: string }>(lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const e of list) {
      if (seen.has(e.entity_id)) continue;
      seen.add(e.entity_id);
      out.push(e);
    }
  }
  return out;
}

export function resolveChipIcon(chip: ChipConfig): string {
  if (chip.icon) return chip.icon;
  if (isBuiltin(chip.type)) return BUILTIN_ICON[chip.type];
  switch (chip.type) {
    case 'filter':
      return chip.domain ? 'mdi:counter' : 'mdi:filter';
    case 'entity':
      return 'mdi:numeric';
    case 'template':
      return 'mdi:code-braces';
    default:
      return 'mdi:help';
  }
}

export function resolveChipColor(chip: ChipConfig): string {
  if (chip.color) return resolveColor(chip.color) ?? chip.color;
  if (isBuiltin(chip.type)) return BUILTIN_COLOR[chip.type];
  return 'var(--primary-color, #ff9b42)';
}

export interface ChipValue {
  label: string;
  active: boolean;
}

/** Liczy/resolve wartość chipu zależnie od typu. */
export function evaluateChip(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  chip: ChipConfig,
  templates: TemplateRenderer,
): ChipValue {
  switch (chip.type) {
    case 'lights':
      return countedValue(hass, filterByDomain(entries, 'light'));
    case 'motion': {
      // Spójnie z row/tile: motion chip obejmuje też `device_class: occupancy`
      // (czujki presence mmWave).
      const merged = dedupe([
        filterBinarySensorDeviceClass(hass, entries, 'motion'),
        filterBinarySensorDeviceClass(hass, entries, 'occupancy'),
      ]);
      return countedValue(hass, merged);
    }
    case 'occupancy':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'occupancy'));
    case 'windows': {
      // `device_class: window` albo generyczne `opening` (wiele Aqara /
      // Xiaomi / Zigbee sensorów raportuje jako `opening`).
      const merged = dedupe([
        filterBinarySensorDeviceClass(hass, entries, 'window'),
        filterBinarySensorDeviceClass(hass, entries, 'opening'),
      ]);
      return countedValue(hass, merged);
    }
    case 'doors': {
      const merged = dedupe([
        filterBinarySensorDeviceClass(hass, entries, 'door'),
        filterBinarySensorDeviceClass(hass, entries, 'garage_door'),
      ]);
      return countedValue(hass, merged);
    }
    case 'leak':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'moisture'));
    case 'smoke':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'smoke'));
    case 'gas': {
      // Gas + Carbon Monoxide (niektóre integracje używają 'carbon_monoxide').
      const merged = dedupe([
        filterBinarySensorDeviceClass(hass, entries, 'gas'),
        filterBinarySensorDeviceClass(hass, entries, 'carbon_monoxide'),
      ]);
      return countedValue(hass, merged);
    }
    case 'co':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'carbon_monoxide'));
    case 'problem': {
      // Agregator „problem entities" — problem, safety, tamper device_class.
      const merged = dedupe([
        filterBinarySensorDeviceClass(hass, entries, 'problem'),
        filterBinarySensorDeviceClass(hass, entries, 'safety'),
        filterBinarySensorDeviceClass(hass, entries, 'tamper'),
      ]);
      return countedValue(hass, merged);
    }
    case 'battery_low':
      // `device_class: battery` + state 'on' = low (konwencja HA).
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'battery'));
    case 'filter':
      return filterValue(hass, entries, chip.domain, chip.device_class, chip.state ?? 'on');
    case 'entity':
      return entityValue(hass, chip);
    case 'template':
      return templateValue(templates, chip.value, chip.active_template);
  }
}

function countedValue(hass: HomeAssistant, entries: HassEntityRegistryEntry[]): ChipValue {
  let n = 0;
  for (const entry of entries) {
    if (hass.states?.[entry.entity_id]?.state === 'on') n++;
  }
  return { label: String(n), active: n > 0 };
}

function filterValue(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  domain: string | undefined,
  deviceClass: string | undefined,
  activeState: string,
): ChipValue {
  let pool = entries;
  if (domain) pool = filterByDomain(pool, domain);
  if (deviceClass) pool = filterBinarySensorDeviceClass(hass, pool, deviceClass);
  let n = 0;
  for (const entry of pool) {
    if (hass.states?.[entry.entity_id]?.state === activeState) n++;
  }
  return { label: String(n), active: n > 0 };
}

function entityValue(
  hass: HomeAssistant,
  chip: { entity: string; format?: 'state' | 'attribute'; attribute?: string; suffix?: string; active_states?: string[] },
): ChipValue {
  const state = hass.states?.[chip.entity];
  if (!state) return { label: '?', active: false };

  let raw: string | number = state.state;
  if (chip.format === 'attribute' && chip.attribute) {
    const v = state.attributes?.[chip.attribute];
    raw = typeof v === 'number' ? v : String(v ?? '');
  }
  const label = `${raw}${chip.suffix ?? ''}`;
  const activeStates = chip.active_states ?? ['on'];
  const active = activeStates.includes(String(state.state));
  return { label, active };
}

function templateValue(
  templates: TemplateRenderer,
  template: string,
  activeTemplate: string | undefined,
): ChipValue {
  templates.subscribe(template);
  if (activeTemplate) templates.subscribe(activeTemplate);
  const label = templates.get(template);
  const activeRaw = activeTemplate ? templates.get(activeTemplate) : '';
  // Convention: pusty/0/False/off → nieaktywny; wszystko inne → aktywny
  const active = activeTemplate
    ? !['', '0', 'false', 'False', 'off', 'None', 'null'].includes(activeRaw.trim())
    : label !== '' && label !== '0';
  return { label, active };
}
