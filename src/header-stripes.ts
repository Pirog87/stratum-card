// Paski zwiniętego nagłówka (`header.style: 'stripes'`).
//
// Czyste funkcje — bez DOM-u i bez Lita, żeby dało się je testować w Vitest.
// Karta podaje listę pokoi z liczbą włączonych świateł i kolorem świecenia,
// a stąd wychodzi gotowa lista pasków do narysowania.

/** Pokój w formie, jakiej potrzebuje nagłówek. */
export interface StripeRoom {
  area_id: string;
  name: string;
  /** Liczba włączonych świateł w pokoju (z `computeTileData`). */
  lightsOn: number;
  /** Kolor świecenia jako `rgb(r, g, b)` — `undefined`, gdy światło go nie raportuje. */
  color?: string;
}

/** Pojedynczy pasek: pokój albo zbiorczy „+N". */
export interface HeaderStripe {
  kind: 'room' | 'more';
  /** Tylko dla `room` — do otwarcia popupu pokoju. */
  area_id?: string;
  label: string;
  /** Tylko dla `room` i tylko gdy pokój raportuje kolor. */
  color?: string;
}

export const STRIPES_MAX_DEFAULT = 3;
const STRIPES_MAX_LIMIT = 4;

/** Sprowadza `stripes_max` z configu do zakresu, który mieści się w belce. */
export function clampStripesMax(max: number | undefined): number {
  if (typeof max !== 'number' || !Number.isFinite(max)) {
    return STRIPES_MAX_DEFAULT;
  }
  return Math.min(STRIPES_MAX_LIMIT, Math.max(1, Math.round(max)));
}

/**
 * Paski dla pokoi, w których świeci się światło — w kolejności z karty.
 *
 * Gdy pokoi jest więcej niż `max`, ostatni pasek zamienia się w „+N":
 * nazwy i tak by się nie zmieściły, a liczba mówi, ile zostało poza belką.
 * Dlatego przy przepełnieniu nazw jest `max - 1`, nie `max`.
 */
export function buildHeaderStripes(
  rooms: StripeRoom[],
  max: number | undefined,
): HeaderStripe[] {
  const limit = clampStripesMax(max);
  const lit = rooms.filter((r) => r.lightsOn > 0);
  const toStripe = (r: StripeRoom): HeaderStripe => ({
    kind: 'room',
    area_id: r.area_id,
    label: r.name,
    color: r.color,
  });
  if (lit.length <= limit) return lit.map(toStripe);
  const named = lit.slice(0, limit - 1).map(toStripe);
  const rest = lit.length - named.length;
  return [...named, { kind: 'more', label: `+${rest}` }];
}

/**
 * Czy na pasku w danym kolorze ma stać ciemny, czy jasny napis.
 *
 * Pasek bierze kolor z żarówki, więc tło bywa i kremowe, i granatowe —
 * jeden stały kolor tekstu byłby na części z nich nieczytelny. Liczymy
 * luminancję względną (WCAG) i wybieramy stronę z lepszym kontrastem.
 * Nieznany / nieparsowalny kolor → ciemny napis, bo domyślne tło paska
 * (kolor świateł z motywu) jest jasne.
 */
export function stripeInk(color: string | undefined): 'dark' | 'light' {
  if (!color) return 'dark';
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return 'dark';
  const channel = (raw: string): number => {
    const v = Math.min(255, Number(raw)) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(m[1]!) + 0.7152 * channel(m[2]!) + 0.0722 * channel(m[3]!);
  // Próg 0.3 — kolory o średniej jasności (nasycony fiolet, turkus) wciąż
  // lepiej niosą ciemny napis niż biały.
  return luminance > 0.3 ? 'dark' : 'light';
}

/**
 * Uśredniony kolor świateł piętra — dla poświaty ikony belki.
 *
 * Średnia arytmetyczna kanałów RGB po pokojach, w których świeci się
 * światło ORAZ znany jest jego kolor. Pokój liczy się raz, niezależnie od
 * liczby żarówek: karta zna kolor tylko pierwszego włączonego światła
 * w pokoju, więc ważenie liczbą świateł udawałoby dokładność, której nie ma.
 * `undefined`, gdy żaden świecący pokój nie raportuje koloru — wtedy
 * poświata zostaje w kolorze świateł z motywu.
 */
export function averageLightColor(rooms: StripeRoom[]): string | undefined {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const room of rooms) {
    if (room.lightsOn <= 0 || !room.color) continue;
    const m = room.color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) continue;
    r += Number(m[1]);
    g += Number(m[2]);
    b += Number(m[3]);
    n += 1;
  }
  if (n === 0) return undefined;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}
