// Wspólna logika popupów list chipów (stratum-chip-list) — używana przez
// nagłówek karty głównej (stratum-card) i belkę popupu pomieszczenia
// (stratum-room-card). Chip klikalny = ma listę aktywnych encji do
// pokazania; tu mapujemy typ chipa → encje / etykietę / kolor.

import type {
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
} from './types.js';
import {
  filterByDomain,
  filterBinarySensorDeviceClass,
} from './area-entities.js';

/** Czy chip otwiera listę encji po kliku (bez jawnego tap_action). */
export function chipSupportsList(chip: ChipConfig): boolean {
  // Entity chip → lepiej more-info. Template → nic konkretnego do
  // pokazania. show_list: false jawnie wyłącza.
  if (chip.show_list === false) return false;
  if (chip.type === 'entity' || chip.type === 'template') return false;
  return true;
}

/** Aktywne encje pasujące do chipa (scope = przekazane entries). */
export function chipEntityIds(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  chip: ChipConfig,
): string[] {
  const matches = (states: string[]): ((id: string) => boolean) => {
    return (id: string) => {
      const s = hass.states?.[id]?.state;
      return Boolean(s && states.includes(s));
    };
  };
  if (chip.type === 'lights') {
    // Bez grup-pomocników — lista pokazuje tylko encje bezpośrednie.
    return filterByDomain(entries, 'light')
      .filter(
        (e) =>
          !Array.isArray(hass.states?.[e.entity_id]?.attributes?.entity_id),
      )
      .map((e) => e.entity_id)
      .filter(matches(['on']));
  }
  if (chip.type === 'motion') {
    // Spójnie z chip-defaults: motion + occupancy, zdeduplikowane.
    const motion = filterBinarySensorDeviceClass(hass, entries, 'motion').map(
      (e) => e.entity_id,
    );
    const occ = filterBinarySensorDeviceClass(hass, entries, 'occupancy').map(
      (e) => e.entity_id,
    );
    return Array.from(new Set([...motion, ...occ])).filter(matches(['on']));
  }
  if (chip.type === 'occupancy') {
    return filterBinarySensorDeviceClass(hass, entries, 'occupancy')
      .map((e) => e.entity_id)
      .filter(matches(['on']));
  }
  if (chip.type === 'windows') {
    // window + opening (generyczne Aqara/Xiaomi), zdeduplikowane.
    const w = filterBinarySensorDeviceClass(hass, entries, 'window').map(
      (e) => e.entity_id,
    );
    const o = filterBinarySensorDeviceClass(hass, entries, 'opening').map(
      (e) => e.entity_id,
    );
    return Array.from(new Set([...w, ...o])).filter(matches(['on']));
  }
  if (chip.type === 'doors') {
    const d = filterBinarySensorDeviceClass(hass, entries, 'door').map(
      (e) => e.entity_id,
    );
    const g = filterBinarySensorDeviceClass(hass, entries, 'garage_door').map(
      (e) => e.entity_id,
    );
    return Array.from(new Set([...d, ...g])).filter(matches(['on']));
  }
  if (chip.type === 'leak') {
    return filterBinarySensorDeviceClass(hass, entries, 'moisture')
      .map((e) => e.entity_id)
      .filter(matches(['on']));
  }
  if (chip.type === 'smoke') {
    return filterBinarySensorDeviceClass(hass, entries, 'smoke')
      .map((e) => e.entity_id)
      .filter(matches(['on']));
  }
  if (chip.type === 'gas') {
    const g = filterBinarySensorDeviceClass(hass, entries, 'gas').map(
      (e) => e.entity_id,
    );
    const co = filterBinarySensorDeviceClass(
      hass,
      entries,
      'carbon_monoxide',
    ).map((e) => e.entity_id);
    return Array.from(new Set([...g, ...co])).filter(matches(['on']));
  }
  if (chip.type === 'co') {
    return filterBinarySensorDeviceClass(hass, entries, 'carbon_monoxide')
      .map((e) => e.entity_id)
      .filter(matches(['on']));
  }
  if (chip.type === 'problem') {
    const p = filterBinarySensorDeviceClass(hass, entries, 'problem').map(
      (e) => e.entity_id,
    );
    const s = filterBinarySensorDeviceClass(hass, entries, 'safety').map(
      (e) => e.entity_id,
    );
    const t = filterBinarySensorDeviceClass(hass, entries, 'tamper').map(
      (e) => e.entity_id,
    );
    return Array.from(new Set([...p, ...s, ...t])).filter(matches(['on']));
  }
  if (chip.type === 'battery_low') {
    return filterBinarySensorDeviceClass(hass, entries, 'battery')
      .map((e) => e.entity_id)
      .filter(matches(['on']));
  }
  if (chip.type === 'filter') {
    const c = chip as import('./types.js').FilterChipConfig;
    const activeState = c.state ?? 'on';
    let pool: HassEntityRegistryEntry[] = entries;
    if (c.domain) {
      pool = filterByDomain(pool, c.domain);
    }
    if (c.device_class) {
      pool = pool.filter(
        (e) =>
          hass.states?.[e.entity_id]?.attributes?.device_class ===
          c.device_class,
      );
    }
    return pool.map((e) => e.entity_id).filter(matches([activeState]));
  }
  return [];
}

/**
 * Klasy alarmowe — te same, które zapalają czerwoną otoczkę wiersza.
 * Aktywna encja którejkolwiek z nich = „sprawca" alarmu pomieszczenia.
 */
export const ALARM_CLASSES = [
  'smoke',
  'gas',
  'carbon_monoxide',
  'moisture',
  'problem',
  'safety',
  'tamper',
] as const;

export const ALARM_CLASS_LABELS: Record<string, string> = {
  smoke: 'Dym',
  gas: 'Gaz',
  carbon_monoxide: 'CO',
  moisture: 'Wyciek',
  problem: 'Problem',
  safety: 'Bezpieczeństwo',
  tamper: 'Sabotaż',
};

export const ALARM_CLASS_ICONS: Record<string, string> = {
  smoke: 'mdi:smoke-detector-variant-alert',
  gas: 'mdi:gas-cylinder',
  carbon_monoxide: 'mdi:molecule-co',
  moisture: 'mdi:water-alert',
  problem: 'mdi:alert-circle-outline',
  safety: 'mdi:shield-alert-outline',
  tamper: 'mdi:lock-open-alert',
};

/** Aktywne encje alarmowe (stan `on`) w podanym zbiorze — zdeduplikowane. */
export function alarmEntityIds(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
): string[] {
  const ids = new Set<string>();
  for (const cls of ALARM_CLASSES) {
    for (const e of filterBinarySensorDeviceClass(hass, entries, cls)) {
      if (hass.states?.[e.entity_id]?.state === 'on') ids.add(e.entity_id);
    }
  }
  return [...ids];
}

/** Tytuł popupu listy dla typu chipa. */
export const CHIP_LIST_LABELS: Record<string, string> = {
  lights: 'Włączone światła',
  motion: 'Wykryto obecność',
  occupancy: 'Zajęte strefy',
  windows: 'Otwarte okna',
  doors: 'Otwarte drzwi',
  leak: 'Wykryto wyciek',
  smoke: 'Alarm dymu',
  gas: 'Alarm gazu / CO',
  co: 'Alarm CO',
  problem: 'Wykryto problemy',
  battery_low: 'Niska bateria',
  filter: 'Pasujące encje',
};

/** Kolor akcentu popupu listy dla typu chipa. */
export const CHIP_LIST_COLORS: Record<string, string> = {
  lights: 'var(--stratum-chip-lights-color, #ffc107)',
  motion: 'var(--stratum-chip-motion-color, #4caf50)',
  occupancy: 'var(--stratum-chip-motion-color, #4caf50)',
  windows: 'var(--stratum-chip-windows-color, #2196f3)',
  doors: 'var(--stratum-chip-doors-color, #9c27b0)',
  leak: 'var(--stratum-chip-leak-color, #f44336)',
  smoke: 'var(--stratum-chip-smoke-color, #e53935)',
  gas: 'var(--stratum-chip-gas-color, #ff5722)',
  co: 'var(--stratum-chip-co-color, #d84315)',
  problem: 'var(--stratum-chip-problem-color, #ff9800)',
  battery_low: 'var(--stratum-chip-battery-color, #ff5252)',
  filter: 'var(--primary-color, #ff9b42)',
};
