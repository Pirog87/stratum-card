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
  /** Napis na pasku — dla pokoju skrócony (patrz `shortStripeLabel`). */
  label: string;
  /** Pełna nazwa pokoju — dla czytników ekranu i podpowiedzi. */
  name?: string;
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
  const shown = lit.length <= limit ? lit : lit.slice(0, limit - 1);
  const labels = stripeLabels(shown.map((r) => r.name));
  const named = shown.map(
    (r, i): HeaderStripe => ({
      kind: 'room',
      area_id: r.area_id,
      label: labels[i]!,
      name: r.name,
      color: r.color,
    }),
  );
  if (lit.length <= limit) return named;
  const rest = lit.length - named.length;
  return [...named, { kind: 'more', label: `+${rest}` }];
}

/** Ile znaków mieści się na pasku przy jego stałej długości i kroju napisu. */
const STRIPE_LABEL_MAX = 9;

/**
 * Napisy na paski dla podanych nazw pokoi.
 *
 * Pasek ma stałą długość, więc „Korytarz parter" urywałby się w pół
 * słowa. Nazwa wielowyrazowa, która się nie mieści, skraca się do
 * pierwszego słowa („Korytarz", „Biuro"). Jeśli po skróceniu dwa widoczne
 * paski miałyby ten sam napis („Biuro Tomka" i „Biuro Izy"), oba biorą
 * ostatnie słowo — inaczej nie dałoby się ich odróżnić.
 */
export function stripeLabels(names: string[]): string[] {
  const words = names.map((n) => n.trim().split(/\s+/).filter(Boolean));
  const short = names.map((n, i) => {
    const w = words[i]!;
    return n.trim().length > STRIPE_LABEL_MAX && w.length > 1 ? w[0]! : n.trim();
  });
  return short.map((label, i) => {
    const clash = short.some(
      (other, j) => j !== i && other.toLowerCase() === label.toLowerCase(),
    );
    const w = words[i]!;
    return clash && w.length > 1 ? w[w.length - 1]! : label;
  });
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
