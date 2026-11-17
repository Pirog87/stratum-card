// Tło kafla „Ambient" w kolorze światła — czysta funkcja budująca zmienne
// CSS (testy w tests/tile-ambient.test.ts).
//
// Dawniej do koloru doklejano alfę w hexie: `${color}94`. `lightColorOf`
// zwraca jednak `rgb(r, g, b)`, więc powstawało `rgb(255, 120, 40)94` —
// niepoprawny CSS, przeglądarka odrzucała całe `background` i kafel każdej
// żarówki z kolorem lub barwą bieli zostawał szary. Teraz kafel dostaje
// tylko kolor i procent jako zmienne, a gradient składa `color-mix` w CSS
// (działa dla rgb(), hexa i tokenu).

/**
 * Kolor zapasowy: żarówka bez koloru i barwy (goła ściemnialna) świeci
 * kolorem „świateł" karty — tym samym tokenem co chip i paski.
 */
export const AMBIENT_FALLBACK_COLOR = 'var(--stratum-lights)';

/** Kolor ikony / suwaka i tła — kolor żarówki albo token świateł. */
export function ambientColor(lightColor: string | undefined): string {
  return lightColor ?? AMBIENT_FALLBACK_COLOR;
}

/**
 * Nasycenie tła 15–70% wg jasności (ta sama krzywa co dawniej w hexie).
 * Zgaszone = 0.
 */
export function ambientPct(on: boolean, brightnessPct: number): number {
  if (!on) return 0;
  const b = Math.max(0, Math.min(100, brightnessPct));
  return Math.round((0.15 + (b / 100) * 0.55) * 100);
}

/**
 * Zmienne do `style=` kafla. Zmienne są wewnętrzne (bez wpisu w
 * docs/styling.md): kolor i tak pochodzi z żarówki, a z zewnątrz da się
 * nadpisać `--stratum-lights`.
 */
export function ambientStyle(
  on: boolean,
  lightColor: string | undefined,
  brightnessPct: number,
): string {
  if (!on) return '';
  return `--stratum-ambient-color:${ambientColor(lightColor)};--stratum-ambient-pct:${ambientPct(on, brightnessPct)}%;`;
}
