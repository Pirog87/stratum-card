// Wybór statusów pokazywanych w wierszu pomieszczenia (stratum-card-room-row).
//
// Czyste funkcje bez DOM-u i Lita — testowane w `tests/row-fields.test.ts`.
// Wiersz ma na prawo od nazwy ograniczone miejsce; to, czego się nie
// zmieści, zbiera licznik „+n". Nazwa pokoju jest elementem `flex: 1`, więc
// KAŻDY piksel pól po prawej odbiera się nazwie — stąd limit pól i reguła
// odznaki alarmu poniżej.

import type { TileField } from './types.js';

/** Priorytet pola przy ucinaniu do limitu — wyższy wygrywa. */
export const FIELD_PRIORITY: Record<TileField, number> = {
  smoke: 10,
  gas: 9,
  leak: 8,
  problem: 7,
  lights: 6,
  motion: 5,
  temperature: 4,
  windows: 3,
  doors: 2,
  humidity: 1,
};

/**
 * Pola alarmowe w kolejności ważności — dokładnie te, których aktywność
 * zapala odznakę ⚠ N wiersza (`_alarmActive`).
 */
export const ALARM_FIELDS: readonly TileField[] = ['smoke', 'gas', 'leak', 'problem'];

/** Ikony pól alarmowych — wspólne dla pola i odznaki alarmu. */
export const ALARM_ICONS: Readonly<Partial<Record<TileField, string>>> = {
  smoke: 'mdi:smoke-detector-variant',
  gas: 'mdi:gas-cylinder',
  leak: 'mdi:water-alert',
  problem: 'mdi:alert-circle-outline',
};

/**
 * Pola z wartością → widoczne (w kolejności z configu) + licznik ukrytych.
 * Ponad limit wygrywa wyższy priorytet. Gdy limit jest obniżony (wąski
 * ekran, odznaka alarmu), włącznik świateł nie znika nigdy — to jedyny
 * interaktywny element wiersza poza samym tapnięciem.
 */
export function capByPriority(
  withValue: readonly TileField[],
  cap: number,
  fullCap: number,
): { shown: TileField[]; hiddenCount: number } {
  if (withValue.length <= cap) {
    return { shown: [...withValue], hiddenCount: 0 };
  }
  const byPriority = [...withValue].sort(
    (a, b) => (FIELD_PRIORITY[b] ?? 0) - (FIELD_PRIORITY[a] ?? 0),
  );
  const top = new Set(byPriority.slice(0, cap));
  if (cap < fullCap && withValue.includes('lights')) top.add('lights');
  return {
    shown: withValue.filter((f) => top.has(f)),
    hiddenCount: withValue.length - top.size,
  };
}

/**
 * Odznaka ⚠ N stoi w tym samym rządku co pola i otwiera listę sprawców.
 * Dawniej obok niej stało jeszcze to samo pole alarmowe (alarm wygrywa
 * każdy slot), a sama odznaka była poza limitem — na telefonie 360 px nazwa
 * „Łazienka parter" kurczyła się przy wycieku do 37 px, przy 320 px do zera.
 * Akurat wtedy, gdy najważniejsze jest, KTÓRY to pokój.
 */
export function withoutBadgeFields(
  withValue: readonly TileField[],
  badge: boolean,
): TileField[] {
  return badge ? withValue.filter((f) => !ALARM_FIELDS.includes(f)) : [...withValue];
}

/** Odznaka zajmuje jeden slot limitu (minimum 1 — na włącznik świateł). */
export function badgeCap(cap: number, badge: boolean): number {
  return badge ? Math.max(1, cap - 1) : cap;
}

/**
 * Najważniejsze aktywne pole alarmowe — jego ikonę pokazuje odznaka, żeby
 * po zniknięciu pola z rządka dalej było widać, CO się dzieje (woda, dym).
 */
export function topAlarmField(
  counts: Readonly<Partial<Record<TileField, number>>>,
): TileField | undefined {
  return ALARM_FIELDS.find((f) => (counts[f] ?? 0) > 0);
}
