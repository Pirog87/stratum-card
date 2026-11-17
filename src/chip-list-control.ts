// Czysta logika wierszy sterowalnych w liście chipa (stratum-chip-list):
// który wiersz jest „włączony", co znaczy tapnięcie przełącznika rolety,
// jaką pozycję pokazuje suwak rolety w trakcie jazdy i jaką jasność suwak
// zgaszonej lampy. Wydzielone z komponentu, żeby dało się to testować
// w Vitest bez DOM-u i bez Lita.

import type { HassEntity } from './types.js';

/** Rodzaj wiersza listy: sterowalny, czujka (więcej info) albo offline. */
export type ChipRowKind = 'control' | 'sensor' | 'offline';

const CONTROL_DOMAINS = new Set(['light', 'switch', 'cover']);

export function isControlDomain(domain: string): boolean {
  return CONTROL_DOMAINS.has(domain);
}

/**
 * Wiersz encji niedostępnej to stan wizualny (wzorzec off-pill), nie
 * martwy przełącznik: dawniej zgaszona przez Zigbee lampa wyglądała jak
 * żywa, a tap wysyłał komendę w próżnię. Brak stanu w `hass` traktujemy
 * tak samo — encja zniknęła, nie ma czym sterować.
 */
export function chipRowKind(domain: string, state: HassEntity | undefined): ChipRowKind {
  if (!state || state.state === 'unavailable') return 'offline';
  return isControlDomain(domain) ? 'control' : 'sensor';
}

/**
 * Czy roleta jest „otwarta" w sensie przełącznika listy. HA raportuje
 * rolety jako open/opening/closing/closed — nigdy `on`, więc wspólna
 * reguła `=== 'on'` pokazywała każdą otwartą roletę jako wyłączoną.
 * „W ruchu" liczymy wg kierunku: zamykająca się roleta już jest „wyłączana".
 */
export function coverStateOpen(state: string | undefined): boolean {
  return state === 'open' || state === 'opening';
}

/** Oczekiwany stan rolety po tapnięciu przełącznika — do natychmiastowej reakcji. */
export interface CoverWant {
  open: boolean;
  at: number;
}

/**
 * Jak długo trzymamy „oczekiwany" stan przełącznika rolety. Silnik rolety
 * zgłasza `opening`/`closing` zwykle w ciągu sekundy; jeśli w 5 s nic nie
 * przyjdzie, wracamy do prawdy z HA (ten sam próg co power-pending).
 */
export const COVER_WANT_TTL_MS = 5000;

/**
 * Stan przełącznika rolety do pokazania: oczekiwany (świeży tap, HA jeszcze
 * nie potwierdził kierunku) albo ten z HA. Zwraca też, czy oczekiwanie
 * należy już zapomnieć — wołający czyści wtedy swoją mapę.
 */
export function coverShownOpen(
  state: string | undefined,
  want: CoverWant | undefined,
  now: number,
): { open: boolean; settled: boolean } {
  const actual = coverStateOpen(state);
  if (!want) return { open: actual, settled: true };
  if (state === 'unavailable' || now - want.at > COVER_WANT_TTL_MS || actual === want.open) {
    return { open: actual, settled: true };
  }
  return { open: want.open, settled: false };
}

/**
 * Usługa dla tapnięcia przełącznika rolety. Jawne open/close zamiast
 * `cover.toggle`: toggle odwraca to, co HA aktualnie myśli, a nie to, co
 * widzi użytkownik — przy otwartej rolecie pokazanej jako „wyłączona"
 * tap „włącz" ją zamykał.
 */
export function coverServiceForTap(shownOpen: boolean): 'open_cover' | 'close_cover' {
  return shownOpen ? 'close_cover' : 'open_cover';
}

/** Cel zadany suwakiem rolety — `sent` = puszczony i wysłany do HA. */
export interface CoverTarget {
  pos: number;
  at: number;
  sent: boolean;
}

/**
 * Pozycja suwaka rolety do pokazania. Roleta raportuje pozycję w trakcie
 * jazdy (4%, 9%, 15%…); suwak związany z bieżącą pozycją odskakiwał po
 * puszczeniu z 70% na 4% i pełzł przez 20–60 s, więc wyglądało to jak
 * nieprzyjęte polecenie. Ta sama reguła co w kaflu rolety (stratum-room-tile):
 * cel trzymamy w trakcie przeciągania, w trakcie jazdy (maks. 90 s) i przez
 * pierwsze 3 s po wysłaniu, zanim roleta w ogóle ruszy.
 */
export function coverShownPos(
  pos: number,
  state: string | undefined,
  target: CoverTarget | undefined,
  now: number,
): { pos: number; settled: boolean } {
  if (!target) return { pos, settled: true };
  if (!target.sent) return { pos: target.pos, settled: false };
  const moving = state === 'opening' || state === 'closing';
  const age = now - target.at;
  if (Math.abs(pos - target.pos) > 1 && (moving || age < 3000) && age < 90_000) {
    return { pos: target.pos, settled: false };
  }
  return { pos, settled: true };
}

/** Jasność 0–255 z HA → procent 1–100 suwaka (zaokrąglona). */
export function brightnessPct(brightness: unknown): number | undefined {
  if (typeof brightness !== 'number' || !Number.isFinite(brightness)) return undefined;
  return Math.max(1, Math.min(100, Math.round((brightness / 255) * 100)));
}

/**
 * Wartość suwaka jasności w wierszu listy. Suwak stoi w wierszu ZAWSZE, gdy
 * lampa jest ściemnialna — także zgaszona — bo jego znikanie zmieniało
 * wysokość wiersza o 21 px i następny przełącznik uciekał spod kciuka.
 *
 * - świeci i HA podał jasność → prawdziwa wartość (do zapamiętania),
 * - świeci, ale jasność jeszcze nie przyszła (zapalanie w toku) albo jest
 *   zgaszona → ostatnia znana wartość z tej sesji, inaczej 0 (pusty tor).
 */
export function sliderPct(
  on: boolean,
  brightness: unknown,
  remembered: number | undefined,
): { pct: number; live: boolean } {
  const real = on ? brightnessPct(brightness) : undefined;
  if (real !== undefined) return { pct: real, live: true };
  return { pct: remembered ?? 0, live: false };
}
