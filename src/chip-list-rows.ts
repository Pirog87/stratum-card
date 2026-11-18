// Czysta logika układu listy chipa (stratum-chip-list): czy dzielić listę
// na sekcje pokojów, jak skrócić nazwę encji i w jakiej kolejności pokazać
// wiersze. Wydzielone z komponentu, żeby dało się to testować w Vitest bez
// DOM-u i bez Lita.

/**
 * Sekcje pokojów tylko wtedy, gdy któryś pokój ma 2+ pozycje. Przy jednej
 * pozycji na pokój nagłówek sekcji byłby powtórzeniem nazwy z wiersza —
 * „4 pozycje · 4 pokoje" z czterema nagłówkami to dwa razy dłuższa lista
 * o tej samej treści.
 */
export function needsSections(areaKeys: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const k of areaKeys) {
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

const SPACES = /\s+/g;
// Separator zostający po wycięciu nazwy pokoju („Igor – żarówka", „Igor: lampa").
const EDGE_PUNCT = /^[\s\-–—:·,|/]+|[\s\-–—:·,|/]+$/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Nazwa encji bez nazwy pokoju: „Igor żarówka 8" w pokoju „Igor" →
 * „żarówka 8". Pokój stoi w nagłówku sekcji albo pogrubiony w wierszu,
 * więc powtarzanie go w każdym wierszu tylko zjada szerokość. Dopasowanie
 * całych słów bez wielkości liter — „Igor" nie tnie „Igorek".
 */
export function stripAreaName(name: string, area: string): string {
  const a = area.trim();
  if (!a) return name.trim();
  const re = new RegExp(`(^|\\s)${escapeRe(a)}(?=\\s|$|[-–—:·,|/])`, 'giu');
  return name.replace(re, ' ').replace(SPACES, ' ').replace(EDGE_PUNCT, '').trim();
}

/**
 * Słowa wspólne dla wszystkich nazw listy (bez wielkości liter). W liście
 * obecności każda encja nazywa się „Czujka obecności <pokój> Zajętość" —
 * po wycięciu pokoju zostaje „Czujka obecności Zajętość" w każdym wierszu.
 * Słowo obecne we wszystkich nazwach niczego nie odróżnia, więc je
 * pomijamy. Przy jednej nazwie nie ma z czym porównać — nic nie wspólne.
 */
export function commonWords(names: readonly string[]): Set<string> {
  if (names.length < 2) return new Set();
  const sets = names.map((n) => new Set(n.toLowerCase().split(SPACES).filter(Boolean)));
  const [first, ...rest] = sets;
  const out = new Set<string>();
  for (const w of first ?? []) if (rest.every((s) => s.has(w))) out.add(w);
  return out;
}

/** Nazwa bez słów wspólnych dla całej listy (patrz commonWords). */
export function withoutWords(name: string, common: ReadonlySet<string>): string {
  if (common.size === 0) return name;
  return name
    .split(SPACES)
    .filter((w) => w && !common.has(w.toLowerCase()))
    .join(' ')
    .replace(EDGE_PUNCT, '')
    .trim();
}

/** W jakiej kolejności pokazać wiersze danej listy. */
export type ChipSortMode = 'recent' | 'oldest' | 'severity' | 'level' | 'name';

/**
 * Kolejność wg tego, o co pyta lista: obecność — gdzie ktoś jest TERAZ
 * (najświeższe na górze); okna i drzwi — co stoi otwarte najdłużej;
 * alarmy — co najgroźniejsze; bateria — co padnie pierwsze. Listy
 * sterowalne (światła, filtr) alfabetycznie: są przypięte na czas
 * otwarcia, więc kolejność nie może zależeć od zmieniającego się stanu.
 */
export function sortModeFor(chipType: string | undefined, alarms: boolean): ChipSortMode {
  if (alarms) return 'severity';
  switch (chipType) {
    case 'motion':
    case 'occupancy':
    case 'leak':
    case 'smoke':
    case 'gas':
    case 'co':
    case 'problem':
      return 'recent';
    case 'windows':
    case 'doors':
      return 'oldest';
    case 'battery_low':
      return 'level';
    default:
      return 'name';
  }
}

/** Waga rodzaju alarmu — mniejsza liczba = wyżej na liście. */
const SEVERITY: Record<string, number> = {
  gas: 0,
  carbon_monoxide: 0,
  smoke: 1,
  heat: 1,
  moisture: 2,
  safety: 3,
  tamper: 4,
  problem: 5,
  battery: 6,
};

export interface RowSortInfo {
  /** Nazwa do porównań alfabetycznych. */
  name: string;
  /** last_changed w ms (brak = na koniec w „recent", na początek w „oldest"). */
  changed?: number;
  device_class?: string;
  /** Poziom baterii (%) — dla „level". */
  level?: number;
}

export function sortRows(
  ids: readonly string[],
  mode: ChipSortMode,
  info: (id: string) => RowSortInfo,
): string[] {
  const byName = (a: RowSortInfo, b: RowSortInfo): number =>
    a.name.localeCompare(b.name, 'pl', { numeric: true });
  const rows = ids.map((id) => ({ id, i: info(id) }));
  rows.sort((x, y) => {
    const a = x.i;
    const b = y.i;
    switch (mode) {
      case 'recent':
        return (b.changed ?? -Infinity) - (a.changed ?? -Infinity) || byName(a, b);
      case 'oldest':
        return (a.changed ?? -Infinity) - (b.changed ?? -Infinity) || byName(a, b);
      case 'severity': {
        const sa = SEVERITY[a.device_class ?? ''] ?? 9;
        const sb = SEVERITY[b.device_class ?? ''] ?? 9;
        return sa - sb || (b.changed ?? -Infinity) - (a.changed ?? -Infinity) || byName(a, b);
      }
      case 'level':
        return (a.level ?? Infinity) - (b.level ?? Infinity) || byName(a, b);
      default:
        return byName(a, b);
    }
  });
  return rows.map((r) => r.id);
}

/**
 * Pozycja 0–100 z położenia palca na wierszu. Wiersz sam jest suwakiem
 * (tło = poziom), więc liczymy względem całej jego szerokości.
 */
export function pctFromX(x: number, left: number, width: number, min = 0): number {
  if (width <= 0) return min;
  const p = Math.round(((x - left) / width) * 100);
  return Math.min(100, Math.max(min, p));
}

/**
 * Czy ruch palca to już przeciąganie poziome (zmiana poziomu), czy jeszcze
 * nic, czy przewijanie listy. Pionowy ruch powyżej progu oddaje gest
 * przewijaniu — inaczej każdy przewinięty wiersz zmieniałby jasność.
 */
export function dragIntent(dx: number, dy: number): 'none' | 'drag' | 'scroll' {
  if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return 'scroll';
  if (Math.abs(dx) >= 8) return 'drag';
  return 'none';
}
