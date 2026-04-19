// Domyślne definicje wbudowanych chipów: ikony, kolory, logika zliczania.
//
// Każdy chip zwraca licznik encji w stanie "aktywnym" (dla świateł: on,
// dla binary_sensor: on z odpowiednim device_class).

import type {
  BuiltInChipType,
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
} from './types.js';
import { filterByDomain, filterBinarySensorDeviceClass } from './area-entities.js';

export const DEFAULT_CHIPS: ChipConfig[] = [
  { type: 'lights' },
  { type: 'motion' },
  { type: 'windows' },
  { type: 'doors' },
];

const CHIP_ICON: Record<BuiltInChipType, string> = {
  lights: 'mdi:ceiling-light',
  motion: 'mdi:motion-sensor',
  occupancy: 'mdi:account',
  windows: 'mdi:window-open',
  doors: 'mdi:door-open',
};

const CHIP_COLOR: Record<BuiltInChipType, string> = {
  lights: 'var(--stratum-chip-lights-color, #ffc107)',
  motion: 'var(--stratum-chip-motion-color, #4caf50)',
  occupancy: 'var(--stratum-chip-occupancy-color, #4caf50)',
  windows: 'var(--stratum-chip-windows-color, #42a5f5)',
  doors: 'var(--stratum-chip-doors-color, #42a5f5)',
};

export function resolveChipIcon(chip: ChipConfig): string {
  return chip.icon ?? CHIP_ICON[chip.type];
}

export function resolveChipColor(chip: ChipConfig): string {
  return chip.color ?? CHIP_COLOR[chip.type];
}

/** Liczy encje chipu w stanie aktywnym. */
export function countChip(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  chip: ChipConfig,
): number {
  switch (chip.type) {
    case 'lights':
      return countOn(hass, filterByDomain(entries, 'light'));
    case 'motion':
      return countOn(hass, filterBinarySensorDeviceClass(hass, entries, 'motion'));
    case 'occupancy':
      return countOn(hass, filterBinarySensorDeviceClass(hass, entries, 'occupancy'));
    case 'windows':
      return countOn(hass, filterBinarySensorDeviceClass(hass, entries, 'window'));
    case 'doors':
      return countOn(hass, filterBinarySensorDeviceClass(hass, entries, 'door'));
    default:
      return 0;
  }
}

function countOn(hass: HomeAssistant, entries: HassEntityRegistryEntry[]): number {
  let n = 0;
  for (const entry of entries) {
    if (hass.states?.[entry.entity_id]?.state === 'on') n++;
  }
  return n;
}
