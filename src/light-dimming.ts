// Ściemnianie pokoju gestem: tylko włączone światła, proporcjonalnie.
//
// Dawniej przeciągnięcie po wierszu wysyłało JEDNĄ komendę
// `light.turn_on { wszystkie światła pokoju, brightness_pct }` — zapalała
// światła, które były zgaszone, i spłaszczała wszystkie poziomy do jednej
// wartości. Tu jest czysta matematyka nowego zachowania (bez DOM-u, bez
// Lita, bez zegara), testowana w `tests/light-dimming.test.ts`:
//
//  1. Na starcie gestu zamrażamy zbiór świateł, które świecą.
//  2. Suwak = ŚREDNIA jasność tych świateł — dokładnie to, co pokazuje
//     wypełnienie wiersza. Po puszczeniu średnia celów równa się pozycji
//     palca, więc pasek nie ma dokąd „odskoczyć".
//  3. W dół: każda żarówka × ten sam współczynnik (proporcje zachowane).
//     W górę: też × współczynnik, a te, które doszły do 100%, zostają tam,
//     podczas gdy reszta dalej rośnie (tak, żeby średnia nadal = palec).
//     Dzięki temu suwak nigdy nie jest „martwy", choć jedna lampa ma 100%.
//  4. Cele liczymy zawsze z zamrożonych wartości startowych, nie z
//     poprzedniego kroku — ruch tam i z powrotem w jednym geście wraca
//     dokładnie do punktu wyjścia.
//
// Jednostki: `brightness` HA 1..255 (wysyłamy `brightness`, nie
// `brightness_pct` — unikamy drugiego zaokrąglenia), pozycja suwaka 0..100.

import type { HassEntity, HomeAssistant } from './types.js';
import { groupMemberIds } from './area-entities.js';

/** Puszczenie suwaka na tym poziomie lub niżej = zgaś (jak dotąd). */
export const OFF_THRESHOLD = 2;

/**
 * Gest zaczęty na zgaszonym pokoju musi dojść przynajmniej tutaj, żeby
 * cokolwiek zapalić. Dawniej 12 px poślizgu palca zapalało cały pokój na 3%.
 */
export const ARM_THRESHOLD = 8;

/** Najniższa jasność wysyłana żarówce: 3/255 ≈ 1% (dawne `brightness_pct: 1`). */
export const BRIGHTNESS_FLOOR = 3;

/** Powyżej tylu ściemnianych świateł nie wysyłamy nic w trakcie ruchu. */
export const LIVE_MAX_LIGHTS = 8;

/** Budżet łącza: tyle ms odstępu na każdą ściemnianą żarówkę. */
export const LIVE_MS_PER_LIGHT = 80;

/** Najkrótszy odstęp między falami komend w trakcie ruchu. */
export const LIVE_MIN_INTERVAL_MS = 300;

/** Jedno światło biorące udział w geście: id + jasność na starcie (1..255). */
export interface DimLight {
  id: string;
  base: number;
}

/** Światła, które świecą w chwili startu gestu. */
export interface OnLights {
  /** Włączone, ściemnialne, ze znaną jasnością — te skalujemy. */
  scaled: DimLight[];
  /**
   * Włączone, ale nie do skalowania (przekaźniki on/off, brak raportowanej
   * jasności). Gest ich nie rusza; gasną razem z resztą przy zjechaniu do zera.
   */
  switchOnly: string[];
  /**
   * Ile dostępnych świateł ściemnialnych ma zbiór — także zgaszonych.
   * Pokój, który ma ściemnialne światła, oceniamy wyłącznie po nich:
   * świecący przekaźnik albo dioda statusu (np. LED punktu dostępowego
   * UniFi, który HA pokazuje jako światło) nie robi z ciemnego pokoju
   * „pokoju na 100%". Dawniej pasek stał wtedy na 100%, a przeciągnięcie
   * nie miało czego ściemnić i odskakiwało z powrotem.
   */
  dimmableTotal: number;
}

/** Jedno wywołanie usługi: wspólna jasność dla listy świateł. */
export interface WaveCall {
  brightness: number;
  ids: string[];
}

/**
 * Stan światła widziany przez gest — może pochodzić z `hass` albo z tego, co
 * sami przed chwilą wysłaliśmy (patrz `LightSwipe`, nakładka optymistyczna).
 */
export interface LightView {
  on: boolean;
  /** 1..255, gdy znana. */
  brightness?: number;
  dimmable: boolean;
  available: boolean;
}

/** Czy światło da się ściemniać (a nie tylko włączyć/wyłączyć). */
export function isDimmable(state: HassEntity | undefined): boolean {
  if (!state) return false;
  const modes = state.attributes?.supported_color_modes;
  if (Array.isArray(modes) && modes.length > 0) {
    // HA potrafi podać tryby jako enum-stringi („onoff", „brightness", „xy"…).
    return modes.some((m) => String(m).toLowerCase() !== 'onoff');
  }
  // Starsze integracje bez listy trybów: ściemnialne, jeśli raportują jasność.
  return typeof state.attributes?.brightness === 'number';
}

/** Odczyt światła prosto z `hass`. */
export function viewOf(state: HassEntity | undefined): LightView {
  if (!state) return { on: false, dimmable: false, available: false };
  const raw = state.attributes?.brightness;
  return {
    on: state.state === 'on',
    brightness:
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(1, Math.min(255, Math.round(raw)))
        : undefined,
    dimmable: isDimmable(state),
    available: state.state !== 'unavailable' && state.state !== 'unknown',
  };
}

/**
 * Rozwija grupy świateł do pojedynczych żarówek (rekurencyjnie, bez
 * duplikatów, odporne na cykle). Komendy idą zawsze do żarówek: wywołanie
 * `turn_on` na grupie zapala WSZYSTKICH jej członków na jednym poziomie —
 * dokładnie ten błąd, który tu naprawiamy.
 *
 * Grupy bez listy członków (np. natywne grupy Zigbee2MQTT, które HA widzi
 * jako zwykłe światło) są nierozróżnialne od żarówki i tak je traktujemy.
 */
export function expandLightIds(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (seen.has(id) || depth > 6) return;
    seen.add(id);
    if (!id.startsWith('light.')) return;
    const state = hass?.states?.[id];
    if (!state) return;
    const members = groupMemberIds(state);
    if (members) {
      for (const m of members) walk(m, depth + 1);
      return;
    }
    out.push(id);
  };
  for (const id of ids) walk(id, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Sterowniki WLED — „bramka zasilania" segmentów
//
// Sterownik główny WLED (wiele segmentów) wystawia `group_entities` i w
// zliczeniach znika jako grupa — liczymy i sterujemy segmentami. Ale w
// WLED to nie jest przezroczysta grupa: `turn_on` segmentu NIE włącza
// sterownika, gdy ten istnieje, a segment po zgaszeniu sterownika (nocna
// automatyzacja, aplikacja WLED, przycisk) dalej raportuje „on". Efekt:
// wiersz pokazywał „świeci", tapnięcie gasiło segmenty, następne zapalało
// je z powrotem — a pasek cały czas był ciemny.
//
// Dlatego: segment zgaszonego sterownika czytamy jako zgaszony, a każda
// ścieżka „zapal" dokłada osobne `turn_on` BEZ jasności do zgaszonego
// sterownika (z jasnością WLED mnożyłby ją przez jasność segmentu).
// Ścieżki „zgaś" zostają bez zmian — gaszą segmenty, sterownik zostaje.
//
// Sterownik NIEDOSTĘPNY nie zamyka bramki: WLED z jednym segmentem nie ma
// sterownika głównego (HA trzyma go jako „unavailable"), a segment steruje
// paskiem sam — nie wolno go wtedy uznać za martwy ani celować w sterownik.
// Pomocnik „Grupa świateł" HA (`entity_id`) zostaje przezroczysty: komenda
// do niego zapaliłaby wszystkich członków.
// ---------------------------------------------------------------------------

type StateMap = HomeAssistant['states'];

/** Lista id `light.*` — na tożsamość rejestru (zmienia się rzadko). */
const lightIdsCache = new WeakMap<object, string[]>();
/** Segment → sterownik, na tożsamość `hass.states` (członkostwo z atrybutów). */
const controllerCache = new WeakMap<object, Map<string, string>>();

function lightIds(hass: HomeAssistant): string[] {
  const registry = hass.entities;
  if (!registry) {
    // Bez rejestru (testy, start aplikacji) — skan stanów, bez cache:
    // ten sam obiekt stanów bywa wtedy uzupełniany w miejscu.
    return Object.keys(hass.states ?? {}).filter((id) => id.startsWith('light.'));
  }
  let ids = lightIdsCache.get(registry);
  if (!ids) {
    ids = Object.keys(registry).filter((id) => id.startsWith('light.'));
    lightIdsCache.set(registry, ids);
  }
  return ids;
}

/** Segmenty sterownika WLED albo `undefined`, gdy encja nie jest sterownikiem. */
function controllerSegments(hass: HomeAssistant, id: string): string[] | undefined {
  const attrs = hass.states?.[id]?.attributes;
  if (!attrs) return undefined;
  if (Array.isArray(attrs.entity_id)) return undefined;
  if (hass.entities?.[id]?.platform === 'group') return undefined;
  const members = attrs.group_entities;
  if (!Array.isArray(members) || members.length === 0) return undefined;
  return members.filter((m): m is string => typeof m === 'string');
}

function controllerIndex(hass: HomeAssistant): Map<string, string> {
  const states: StateMap | undefined = hass.states;
  if (!states) return new Map();
  const cached = controllerCache.get(states);
  if (cached) return cached;
  const index = new Map<string, string>();
  for (const id of lightIds(hass)) {
    for (const seg of controllerSegments(hass, id) ?? []) {
      if (!index.has(seg)) index.set(seg, id);
    }
  }
  controllerCache.set(states, index);
  return index;
}

/** Sterownik WLED trzymający segment `leafId` (przez `group_entities`). */
export function lightControllerOf(
  hass: HomeAssistant | undefined,
  leafId: string,
): string | undefined {
  if (!hass || !leafId.startsWith('light.')) return undefined;
  return controllerIndex(hass).get(leafId);
}

/** Odczyt stanu sterownika — wołający wstrzykuje stan „w toku", jeśli go zna. */
export type ControllerState = (controllerId: string) => string | undefined;

function rawState(hass: HomeAssistant | undefined): ControllerState {
  return (id) => hass?.states?.[id]?.state;
}

/** Czy segment jest wygaszony przez zgaszony (nie: niedostępny) sterownik. */
export function gatedOff(
  hass: HomeAssistant | undefined,
  leafId: string,
  controllerState: ControllerState = rawState(hass),
): boolean {
  const c = lightControllerOf(hass, leafId);
  return c !== undefined && controllerState(c) === 'off';
}

/** Widok światła z bramką sterownika: segment zgaszonego sterownika nie świeci. */
export function gateView(
  hass: HomeAssistant | undefined,
  leafId: string,
  base: LightView,
  controllerState: ControllerState = rawState(hass),
): LightView {
  if (!base.on || !gatedOff(hass, leafId, controllerState)) return base;
  return { ...base, on: false, brightness: undefined };
}

/**
 * Zgaszone sterowniki dla zapalanych segmentów — do osobnego `turn_on`
 * bez jasności. Bez duplikatów, w kolejności pierwszego wystąpienia.
 */
export function closedControllers(
  hass: HomeAssistant | undefined,
  leafIds: readonly string[],
  controllerState: ControllerState = rawState(hass),
): string[] {
  const out: string[] = [];
  for (const id of leafIds) {
    const c = lightControllerOf(hass, id);
    if (c === undefined || out.includes(c)) continue;
    if (controllerState(c) === 'off') out.push(c);
  }
  return out;
}

/**
 * Czy światło świeci według samego `hass` — stan „on" i nie wygaszone przez
 * sterownik. Dla liczników i list chipów, które nie znają stanu „w toku".
 */
export function lightOnInHass(hass: HomeAssistant | undefined, id: string): boolean {
  return hass?.states?.[id]?.state === 'on' && !gatedOff(hass, id);
}

/** Dzieli żarówki na skalowane i „tylko włącznik" — spośród tych, które świecą. */
export function onLights(
  leafIds: readonly string[],
  view: (id: string) => LightView,
): OnLights {
  const scaled: DimLight[] = [];
  const switchOnly: string[] = [];
  let dimmableTotal = 0;
  for (const id of leafIds) {
    const v = view(id);
    if (v.dimmable && v.available) dimmableTotal += 1;
    if (!v.on) continue;
    if (v.dimmable && typeof v.brightness === 'number') {
      scaled.push({ id, base: v.brightness });
    } else {
      switchOnly.push(id);
    }
  }
  return { scaled, switchOnly, dimmableTotal };
}

/** Średnia jasność zbioru w % (0..100). Pusty zbiór → 0. */
export function meanLevel(bases: readonly number[]): number {
  if (bases.length === 0) return 0;
  let sum = 0;
  for (const b of bases) sum += b;
  return (100 * sum) / (255 * bases.length);
}

/**
 * Poziom pokazywany na wypełnieniu wiersza i będący punktem startu suwaka.
 *
 *  - świecą jakieś ściemnialne → ich średnia jasność,
 *  - pokój NIE MA ściemnialnych, świecą przekaźniki → 100 (włącznik),
 *  - pokój ma ściemnialne, ale wszystkie zgaszone → `undefined` (ciemno),
 *    nawet jeśli świeci przekaźnik albo dioda statusu,
 *  - nic nie świeci → `undefined`.
 *
 * Przekaźniki NIE wchodzą do średniej, gdy świeci choć jedno światło
 * ściemnialne: inaczej trzy lampy ściemnione do 10% i dwa przekaźniki dawały
 * 46% i pasek odskakiwał w górę po każdym puszczeniu palca.
 */
export function roomLevel(lights: OnLights): number | undefined {
  if (lights.scaled.length > 0) return meanLevel(lights.scaled.map((l) => l.base));
  if (lights.switchOnly.length > 0 && lights.dimmableTotal === 0) return 100;
  return undefined;
}

/** Skrót: poziom pokoju prosto z `hass` (dla wypełnienia w spoczynku). */
export function roomLevelFromHass(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  view: (id: string) => LightView = (id) => gateView(hass, id, viewOf(hass?.states?.[id])),
): number | undefined {
  const leaves = expandLightIds(hass, ids);
  return roomLevel(onLights(leaves, view));
}

/**
 * Serce modułu: jasności docelowe (1..255) dla pozycji suwaka `t` (0..100).
 *
 * Szukamy współczynnika k takiego, że średnia z `min(255, base·k)` równa się
 * `t`. W dół to zwykłe k = t / poziom_startowy. W górę rozwiązujemy to samo
 * równanie z nasyceniem: sortujemy malejąco i po kolei „zalewamy" żarówki,
 * które przy bieżącym k przekroczyłyby 255 (water-filling).
 *
 * Własności (pilnowane testami): `t = poziom startowy` zwraca dokładnie
 * wartości startowe; cele są niemalejące względem `t`; `t = 100` daje 255
 * wszędzie; jedna żarówka = zwykły suwak absolutny.
 */
export function scaleTargets(bases: readonly number[], t: number): number[] {
  const n = bases.length;
  if (n === 0) return [];
  const clampedT = Math.max(0, Math.min(100, t));
  let sum = 0;
  for (const b of bases) sum += b;
  const demand = (255 * n * clampedT) / 100;

  let k: number;
  // Indeksy żarówek „zalanych" do 255.
  const saturated = new Set<number>();
  if (demand <= sum) {
    k = sum > 0 ? demand / sum : 0;
  } else {
    const order = bases.map((b, i) => ({ b, i })).sort((x, y) => y.b - x.b);
    let rest = sum;
    let j = 0;
    k = 1;
    while (j < n) {
      k = rest > 0 ? (demand - 255 * j) / rest : Number.POSITIVE_INFINITY;
      if (order[j]!.b * k >= 255) {
        saturated.add(order[j]!.i);
        rest -= order[j]!.b;
        j += 1;
        continue;
      }
      break;
    }
  }

  return bases.map((b, i) => {
    if (saturated.has(i)) return 255;
    // Podłoga 1% — ale żarówki, która już świeci słabiej, nie podbijamy.
    const floor = Math.min(b, BRIGHTNESS_FLOOR);
    return Math.max(floor, Math.min(255, Math.round(b * k)));
  });
}

/**
 * Układa falę komend: jedno wywołanie na każdą różną jasność docelową.
 * Pomija żarówki, których cel różni się od ostatnio wysłanej wartości
 * (albo od startowej, jeśli nic jeszcze nie wysłaliśmy) o mniej niż
 * `minDelta` — nasycone i te na podłodze odpadają same, a powrót suwaka do
 * punktu wyjścia nie wysyła nic.
 */
export function planWave(
  lights: readonly DimLight[],
  t: number,
  lastSent: ReadonlyMap<string, number>,
  minDelta: number,
): WaveCall[] {
  const targets = scaleTargets(
    lights.map((l) => l.base),
    t,
  );
  const byValue = new Map<number, string[]>();
  lights.forEach((light, i) => {
    const target = targets[i]!;
    const previous = lastSent.get(light.id) ?? light.base;
    if (Math.abs(target - previous) < minDelta) return;
    const list = byValue.get(target);
    if (list) list.push(light.id);
    else byValue.set(target, [light.id]);
  });
  // Od najjaśniejszych — kolejność deterministyczna (łatwiej testować i
  // przewidywalniej wygląda, gdy sieć rozkłada komendy w czasie).
  return [...byValue.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([brightness, ids]) => ({ brightness, ids }));
}

/**
 * Co ile ms wolno wysyłać falę w trakcie ruchu — albo `null`, gdy świateł
 * jest za dużo i wysyłamy dopiero po puszczeniu palca.
 *
 * Proporcjonalnej zmiany nie da się wysłać jedną komendą grupową (jedno
 * `turn_on` niesie jedną jasność), więc każda fala to osobna ramka na
 * żarówkę. Sieć Zigbee przyjmuje ich kilkanaście na sekundę; zalana oddaje
 * komendy z opóźnieniem i światła „dochodzą" jeszcze długo po puszczeniu
 * palca. Dlatego budżet rośnie z liczbą świateł, a powyżej progu wypełnienie
 * idzie za palcem lokalnie, a żarówki dostają jedną falę na końcu.
 */
export function liveIntervalMs(scaledCount: number): number | null {
  if (scaledCount <= 0 || scaledCount > LIVE_MAX_LIGHTS) return null;
  return Math.max(LIVE_MIN_INTERVAL_MS, scaledCount * LIVE_MS_PER_LIGHT);
}
