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

export const DEFAULT_CHIPS: ChipConfig[] = [
  { type: 'lights' },
  { type: 'motion' },
  { type: 'windows' },
  { type: 'doors' },
];

const BUILTIN_ICON: Record<BuiltInChipType, string> = {
  lights: 'mdi:lightbulb',
  motion: 'mdi:motion-sensor',
  occupancy: 'mdi:account',
  windows: 'mdi:window-open',
  doors: 'mdi:door-open',
};

const BUILTIN_COLOR: Record<BuiltInChipType, string> = {
  lights: 'var(--stratum-chip-lights-color, #ffc107)',
  motion: 'var(--stratum-chip-motion-color, #4caf50)',
  occupancy: 'var(--stratum-chip-occupancy-color, #4caf50)',
  windows: 'var(--stratum-chip-windows-color, #42a5f5)',
  doors: 'var(--stratum-chip-doors-color, #42a5f5)',
};

export function resolveChipIcon(chip: ChipConfig): string {
  if (chip.icon) return chip.icon;
  switch (chip.type) {
    case 'lights':
    case 'motion':
    case 'occupancy':
    case 'windows':
    case 'doors':
      return BUILTIN_ICON[chip.type];
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
  switch (chip.type) {
    case 'lights':
    case 'motion':
    case 'occupancy':
    case 'windows':
    case 'doors':
      return BUILTIN_COLOR[chip.type];
    default:
      return 'var(--primary-color, #ff9b42)';
  }
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
    case 'motion':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'motion'));
    case 'occupancy':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'occupancy'));
    case 'windows':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'window'));
    case 'doors':
      return countedValue(hass, filterBinarySensorDeviceClass(hass, entries, 'door'));
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
