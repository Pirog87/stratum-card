// Czysta logika edytora chipów — przekształcenie wartości z ha-form
// w zapisywany chip. Wydzielone ze stratum-chips-editor, żeby dało się
// przetestować w Vitest: to tu config potrafił „po cichu" nie zmienić się
// mimo edycji (wyczyszczone pole wracało po re-renderze).

import type { ChipConfig } from './types.js';

/**
 * Toggle'e, których default to `true`. Zapisujemy tylko odstępstwo
 * (`false`) — `true` w YAML-u to szum, a jego brak znaczy to samo.
 */
const DEFAULT_TRUE_KEYS = new Set(['show_list', 'show_when_zero']);

/** I odwrotnie: toggle'e z defaultem `false` — zapisujemy tylko `true`. */
const DEFAULT_FALSE_KEYS = new Set(['show_last_changed']);

/** Puste wartości z formularza = „wróć do domyślnego", czyli brak klucza. */
function isEmpty(v: unknown): boolean {
  return v === '' || v === null || v === undefined;
}

/**
 * Składa chip po zmianie w formularzu.
 *
 * ha-form oddaje CAŁY obiekt danych (`{...data, ...zmiana}`), więc klucz
 * obecny w chipie, a pusty albo nieobecny w `value`, to świadome
 * wyczyszczenie pola (kolor, ikona, sufiks, stan, tap_action) — kasujemy
 * go. Wcześniej puste wartości były pomijane, a merge `{...stary, ...patch}`
 * przywracał starą wartość: wyczyszczony kolor wracał po re-renderze.
 *
 * `type` zawsze z istniejącego chipu — formularz go nie edytuje, a chip
 * bez typu przestałby się renderować.
 */
export function chipFromForm(
  existing: ChipConfig,
  value: Record<string, unknown>,
): ChipConfig {
  const out: Record<string, unknown> = { ...existing };
  const keys = new Set([...Object.keys(existing), ...Object.keys(value)]);
  for (const key of keys) {
    if (key === 'type') continue;
    const v = value[key];
    if (
      isEmpty(v) ||
      (DEFAULT_TRUE_KEYS.has(key) && v === true) ||
      (DEFAULT_FALSE_KEYS.has(key) && v === false)
    ) {
      delete out[key];
      continue;
    }
    out[key] = v;
  }
  out.type = existing.type;
  return out as unknown as ChipConfig;
}

/** Typy chipów binarnych, dla których „x min temu" ma sens. */
export const LAST_CHANGED_CHIP_TYPES: ReadonlySet<ChipConfig['type']> = new Set([
  'motion',
  'occupancy',
]);

/** Typy z opcjonalną jawną encją sensora (puste = auto po device_class). */
export const SENSOR_CHIP_TYPES: ReadonlySet<ChipConfig['type']> = new Set([
  'temperature',
  'humidity',
]);
