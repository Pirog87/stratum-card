// Kontroler gestu jasności: kiedy i co wysłać do Home Assistanta.
//
// Matematyka („jakie jasności dla pozycji palca") siedzi w
// `light-dimming.ts`. Tu jest druga połowa: czas i sieć. Bez DOM-u i bez
// Lita — zegar i `hass` są wstrzykiwane, więc całość testuje się w Vitest
// z fałszywymi timerami (`tests/light-swipe.test.ts`).
//
// Zasady wysyłania:
//  - Wypełnienie na ekranie idzie za palcem lokalnie i natychmiast; żarówki
//    idą za nim w tempie, które sieć jest w stanie przyjąć.
//  - Jedna fala w locie, wygrywa najnowsza pozycja (żadnej kolejki): palec
//    nadpisuje tylko `t`, a następna fala bierze to, co jest aktualne.
//  - Fala = jedno `light.turn_on` na każdą RÓŻNĄ jasność docelową.
//  - Zgaszonych świateł nie dotykamy nigdy — ani w trakcie, ani na końcu.
//  - Włączanie i wyłączanie dzieje się wyłącznie po puszczeniu palca.

import type { HomeAssistant } from './types.js';
import {
  ARM_THRESHOLD,
  BRIGHTNESS_FLOOR,
  OFF_THRESHOLD,
  closedControllers,
  expandLightIds,
  gateView,
  liveIntervalMs,
  meanLevel,
  onLights,
  planWave,
  roomLevel,
  scaleTargets,
  viewOf,
  type ControllerState,
  type DimLight,
  type LightView,
  type WaveCall,
} from './light-dimming.js';

/** Co robi gest zaczęty na całkiem zgaszonym pokoju (gdy nie ma czego przywrócić). */
export type FromOffMode = 'all' | 'none';

/** Wynik puszczenia palca — wiersz wie, na czym zatrzymać wypełnienie. */
export interface SwipeResult {
  outcome: 'set' | 'off' | 'noop';
  /** Poziom (0..100), do którego wypełnienie ma dojść. */
  level: number;
}

/**
 * Cofnięcie stanu w toku po nieudanej komendzie. `failed` = encje komendy,
 * która padła: gest wysyła kilka komend (po jednej na poziom jasności,
 * osobno przekaźniki), a jedna nieudana nie może zgasić przełącznika
 * światłom, którym komenda doszła. Bez argumentu = cały zgłoszony zestaw.
 */
export type SwipePowerUndo = (failed?: readonly string[]) => void;

/**
 * Zgłoszenie „te światła zaraz będą włączone / zgaszone" — stan w toku
 * przełączników (power-pending.ts). Zwraca funkcję cofającą, wołaną, gdy
 * komenda do HA się nie uda.
 */
export type SwipePowerHook = (ids: string[], want: 'on' | 'off') => SwipePowerUndo | void;

export interface SwipeEnv {
  hass: () => HomeAssistant | undefined;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /**
   * Wstrzyknięte, a nie importowane: power-pending.ts sam importuje ten
   * moduł (markOff, rememberBeforeOff), więc import w drugą stronę dałby
   * cykl. Bez tego zgłoszenia przełącznik i licznik wiersza czekały 1–3 s
   * na raporty Zigbee, choć wypełnienie było już u celu — a tapnięcie tego
   * samego przełącznika reagowało natychmiast.
   */
  onPower?: SwipePowerHook;
}

/** Pokój bez ściemnialnych świateł: puszczenie poniżej tej pozycji gasi. */
const RELAY_OFF_BELOW = 50;

/** Ile ms nasza komenda wygrywa z (być może nieświeżym) stanem z `hass`. */
const OVERLAY_TTL_MS = 5000;
/** Jak długo pamiętamy zestaw zgaszony suwakiem (do przywrócenia). */
const MEMORY_TTL_MS = 15 * 60 * 1000;
/** Fala, która nie wróciła po tylu ms, wyłącza wysyłanie w trakcie ruchu. */
const STALL_MS = 2000;
/** Najdłużej tyle czekamy z falą końcową na falę będącą w locie. */
const FINAL_WAIT_MS = 600;
/** Przejście (s) dla fali końcowej — łagodzi „popcorn" w dużych pokojach. */
const FINAL_TRANSITION_S = 0.4;
/** Pomijamy zmiany mniejsze niż to (z 255) w trakcie ruchu / na końcu. */
const LIVE_MIN_DELTA = 4;
const FINAL_MIN_DELTA = 2;
/** Fala w trakcie ruchu leci dopiero, gdy palec odjechał o tyle punktów. */
const LIVE_MIN_MOVE = 2;

/**
 * Nakładka optymistyczna: to, co sami przed chwilą wysłaliśmy. HA odsyła
 * nowy stan po 0.2–2 s (Zigbee po kolei, żarówka po żarówce); drugi gest
 * zaczęty w tym oknie liczyłby proporcje ze starych wartości i światła
 * „skakałyby" z powrotem. Wpis jest ważny, dopóki HA nie zaraportował dla tej
 * encji NICZEGO nowego (ta sama tożsamość obiektu stanu) i nie minęło 5 s —
 * więc zgaszenie lampy przy ścianie od razu wygrywa z naszą pamięcią.
 */
interface OverlayEntry {
  /** 0 = zgaszone przez nas. */
  brightness: number;
  at: number;
  seen: unknown;
}
const overlay = new Map<string, OverlayEntry>();

/** Zestaw zgaszony suwakiem / włącznikiem — do przywrócenia kolejnym gestem. */
interface Memory {
  scaled: DimLight[];
  switchOnly: string[];
  at: number;
}
const memory = new Map<string, Memory>();

/**
 * Sterowniki WLED włączone przed chwilą przez nas (gest albo włącznik), na
 * tych samych zasadach co nakładka: ważne, dopóki HA nie zaraportował dla
 * sterownika niczego nowego i nie minęło 5 s. Bez tego segmenty, których
 * echo przyszło przed echem sterownika, na chwilę czytały się jako zgaszone.
 */
const controllersOn = new Map<string, { at: number; seen: unknown }>();

/**
 * Komendy końcowe WSZYSTKICH gestów, które czekają na falę w locie (do
 * 600 ms, patrz `_afterInflight`). Globalnie, a nie per instancja: ten sam
 * zestaw świateł przełącza wiersz karty, główny włącznik popupu (osobny
 * komponent, bez dostępu do suwaka wiersza) i kafel — a każdy z nich musi
 * umieć wypchnąć zaległą komendę gestu przed własną.
 */
interface PendingFinal {
  ids: ReadonlySet<string>;
  run: () => void;
}
const pendingFinals = new Set<PendingFinal>();

/**
 * Nowa komenda użytkownika (tapnięcie przełącznika) dla tych encji: zaległa
 * komenda gestu idzie TERAZ, przed nią. Inaczej kolejność się odwracała:
 * suwak do zera zaznaczał „off" od razu, ale `turn_off` czekał na falę;
 * tapnięcie w tym oknie czytało przełącznik jako zgaszony i wysyłało
 * `turn_on` — a spóźnione `turn_off` gestu gasiło światła po nim, wbrew
 * ostatniej decyzji użytkownika.
 */
export function flushSwipesTouching(ids: Iterable<string>): void {
  const wanted = new Set(ids);
  if (wanted.size === 0) return;
  for (const p of [...pendingFinals]) {
    for (const id of p.ids) {
      if (wanted.has(id)) {
        p.run();
        break;
      }
    }
  }
}

/** Tylko do testów: czyści pamięć między przypadkami. */
export function resetLightSwipeState(): void {
  overlay.clear();
  memory.clear();
  controllersOn.clear();
  pendingFinals.clear();
}

/** Zapisuje, że sami właśnie włączyliśmy te sterowniki WLED. */
export function markControllersOn(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  now: number = Date.now(),
): void {
  for (const id of ids) controllersOn.set(id, { at: now, seen: hass?.states?.[id] });
}

/** Czy sterownik włączyliśmy przed chwilą (a HA jeszcze tego nie odesłał). */
export function controllerOpenedBySwipe(
  hass: HomeAssistant | undefined,
  id: string,
  now: number = Date.now(),
): boolean {
  const e = controllersOn.get(id);
  if (!e) return false;
  if (now - e.at > OVERLAY_TTL_MS || e.seen !== hass?.states?.[id]) {
    controllersOn.delete(id);
    return false;
  }
  return true;
}

function controllerStateAt(hass: HomeAssistant | undefined, now: number): ControllerState {
  return (c) => (controllerOpenedBySwipe(hass, c, now) ? 'on' : hass?.states?.[c]?.state);
}

function viewWithOverlay(
  hass: HomeAssistant | undefined,
  id: string,
  now: number,
): LightView {
  const state = hass?.states?.[id];
  // Segment zgaszonego sterownika WLED jest dla gestu ciemny — także gdy
  // HA raportuje go jako „on" (patrz light-dimming.ts, „bramka zasilania").
  const base = gateView(hass, id, viewOf(state), controllerStateAt(hass, now));
  const o = overlay.get(id);
  if (!o) return base;
  if (now - o.at > OVERLAY_TTL_MS || o.seen !== state) {
    overlay.delete(id);
    return base;
  }
  if (o.brightness === 0) return { ...base, on: false, brightness: undefined };
  return { ...base, on: true, brightness: o.brightness };
}

/**
 * Zapamiętuje, co świeciło, zanim ktoś zgasił pokój (suwakiem do zera albo
 * mini-włącznikiem wiersza). Następne przeciągnięcie z ciemności przywróci
 * dokładnie ten zestaw w tych samych proporcjach, zamiast zapalać wszystko.
 */
export function rememberBeforeOff(
  key: string,
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  now: number = Date.now(),
): void {
  const leaves = expandLightIds(hass, ids);
  const lit = onLights(leaves, (id) => viewWithOverlay(hass, id, now));
  if (lit.scaled.length === 0 && lit.switchOnly.length === 0) return;
  // Pokój ma ściemnialne, a świeciły same przekaźniki / diody statusu:
  // to nie jest zestaw „do przywrócenia". Dawniej zapamiętany sam LED AP
  // sprawiał, że przeciągnięcie po ciemnym wierszu zapalało tylko LED,
  // a żarówki zostawały zgaszone.
  if (lit.scaled.length === 0 && lit.dimmableTotal > 0) return;
  memory.set(key, { scaled: lit.scaled, switchOnly: lit.switchOnly, at: now });
}

/**
 * Oznacza światła jako zgaszone przez nas (włącznik wiersza, akcja
 * `toggle-lights`). Zigbee odsyła stany po kolei przez 1–3 s; bez tego
 * przeciągnięcie w tym oknie widziało część pokoju jako „świecącą",
 * skalowało tylko ją i kasowało pamięć zestawu do przywrócenia.
 * Wołać PO `rememberBeforeOff` — inaczej nie byłoby czego zapamiętać.
 */
export function markOff(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  now: number = Date.now(),
): void {
  for (const id of expandLightIds(hass, ids)) {
    overlay.set(id, { brightness: 0, at: now, seen: hass?.states?.[id] });
  }
}

interface Gesture {
  mode: 'scale' | 'all' | 'restore';
  /** Skalowane żarówki z jasnością startową (albo zapamiętaną przy restore). */
  scaled: DimLight[];
  /** Włączone przekaźniki (scale) / przekaźniki do zapalenia (all, restore). */
  switchOnly: string[];
  /** Poziom startowy suwaka. */
  level: number;
  t: number;
  /** Najwyższa pozycja osiągnięta w geście — uzbrojenie gestu z ciemności. */
  maxT: number;
  lastSent: Map<string, number>;
  lastSentT?: number;
  interval: number | null;
  nextWaveAt: number;
  inflight?: Promise<unknown>;
  inflightSince: number;
  timer?: unknown;
  sentAny: boolean;
}

export class LightSwipe {
  private _g?: Gesture;

  private readonly _now: () => number;
  private readonly _setTimer: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimer: (handle: unknown) => void;

  /**
   * @param _key klucz pamięci „co było zgaszone" — strefa wiersza albo encja kafla.
   */
  constructor(
    private readonly _key: string,
    private readonly _env: SwipeEnv,
  ) {
    this._now = _env.now ?? (() => Date.now());
    this._setTimer = _env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimer =
      _env.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Poziom (0..100) widziany przez gest — z nakładką na świeże komendy. */
  public level(ids: readonly string[]): number | undefined {
    const hass = this._env.hass();
    const now = this._now();
    const leaves = expandLightIds(hass, ids);
    return roomLevel(onLights(leaves, (id) => viewWithOverlay(hass, id, now)));
  }

  /**
   * Start gestu: zamraża zestaw świateł. Zwraca poziom, od którego suwak ma
   * ruszyć, i czy gest w ogóle cokolwiek zrobi (`active: false` = wiersz ma
   * zostawić palec w spokoju).
   */
  public start(
    ids: readonly string[],
    fromOff: FromOffMode = 'all',
  ): { level: number; active: boolean } {
    this._abortTimers();
    // Poprzedni gest mógł zostawić komendę końcową czekającą na falę w
    // locie (do 600 ms). Gdyby poleciała już W TRAKCIE nowego gestu,
    // nadpisałaby go — np. spóźnione zgaszenie kasowało nowo ustawioną
    // jasność. Wysyłamy ją teraz, zanim zamrozimy nowy zestaw: puszczenie
    // palca było decyzją użytkownika, a nowy gest startuje od jej wyniku.
    this._flushPending();
    const hass = this._env.hass();
    const now = this._now();
    const view = (id: string): LightView => viewWithOverlay(hass, id, now);
    const leaves = expandLightIds(hass, ids);
    const lit = onLights(leaves, view);

    const fresh = (mode: Gesture['mode'], scaled: DimLight[], switchOnly: string[], level: number): Gesture => ({
      mode,
      scaled,
      switchOnly,
      level,
      t: level,
      maxT: level,
      lastSent: new Map(),
      interval: mode === 'scale' ? liveIntervalMs(scaled.length) : null,
      nextWaveAt: 0,
      inflightSince: 0,
      sentAny: false,
    });

    // Pokój „świeci", gdy świeci coś ściemnialnego — albo gdy w ogóle nie ma
    // ściemnialnych, a świecą przekaźniki (wtedy suwak działa jak włącznik).
    // Sam świecący przekaźnik / dioda AP przy zgaszonych żarówkach to dla
    // suwaka ciemny pokój: przeciągnięcie ma przywrócić albo zapalić żarówki.
    const relayOnlyRoom = lit.dimmableTotal === 0;
    if (lit.scaled.length > 0 || (relayOnlyRoom && lit.switchOnly.length > 0)) {
      // Coś świeci — pamięć „co było zgaszone" jest już nieaktualna.
      memory.delete(this._key);
      const level = roomLevel(lit) ?? 0;
      const g = fresh('scale', lit.scaled, lit.switchOnly, level);
      // Pierwsza fala najwcześniej po jednym odstępie: szybkie machnięcie to
      // dokładnie jedna komenda (końcowa), a nie dwie z rzędu.
      if (g.interval !== null) g.nextWaveAt = now + g.interval;
      this._g = g;
      return { level, active: true };
    }

    // Pokój ciemny. Najpierw: czy jest co przywrócić?
    const mem = memory.get(this._key);
    if (mem && now - mem.at <= MEMORY_TTL_MS) {
      // Tylko światła TEGO wiersza — dwa wiersze potrafią dzielić strefę
      // (np. osobne listy `field_entities.lights`), a przywrócenie nie może
      // zapalić niczego spoza zestawu, który użytkownik właśnie ciągnie.
      const own = new Set(leaves);
      const memScaled = mem.scaled.filter((l) => own.has(l.id));
      const memSwitch = mem.switchOnly.filter((id) => own.has(id));
      // Warunek „nic z zestawu nie świeci" liczymy po żarówkach; przekaźnik,
      // który ktoś zostawił włączony, nie blokuje przywrócenia reszty.
      const stillOff = (memScaled.length > 0 ? memScaled.map((l) => l.id) : memSwitch).every(
        (id) => !view(id).on,
      );
      const scaled = memScaled.filter((l) => view(l.id).available);
      const switchOnly = memSwitch.filter((id) => view(id).available);
      // W pokoju ze ściemnialnymi przywracamy tylko zestaw z żarówkami —
      // same przekaźniki to nie „jasność do przywrócenia" (patrz
      // rememberBeforeOff); wtedy gest idzie dalej jak z ciemności.
      const restorable =
        lit.dimmableTotal > 0 ? scaled.length > 0 : scaled.length + switchOnly.length > 0;
      if (stillOff && restorable) {
        this._g = fresh('restore', scaled, switchOnly, 0);
        return { level: 0, active: true };
      }
    }
    memory.delete(this._key);

    if (fromOff === 'none') {
      this._g = undefined;
      return { level: 0, active: false };
    }

    // Dawne zachowanie, zachowane jako domyślne: gest z ciemności zapala
    // wszystkie światła pokoju na jednym poziomie (nie ma proporcji do
    // zachowania, bo nic nie świeciło). Baza 255 = suwak absolutny.
    const scaled: DimLight[] = [];
    const switchOnly: string[] = [];
    for (const id of leaves) {
      const v = view(id);
      if (!v.available) continue;
      if (v.dimmable) scaled.push({ id, base: 255 });
      else switchOnly.push(id);
    }
    if (scaled.length + switchOnly.length === 0) {
      this._g = undefined;
      return { level: 0, active: false };
    }
    this._g = fresh('all', scaled, switchOnly, 0);
    return { level: 0, active: true };
  }

  /** Nowa pozycja palca. Nie wysyła nic sama — tylko planuje falę. */
  public move(t: number): void {
    const g = this._g;
    if (!g) return;
    g.t = Math.max(0, Math.min(100, t));
    if (g.t > g.maxT) g.maxT = g.t;
    // Fala, która utknęła (HA nie odpowiada), nie może blokować reszty gestu
    // ani kolejkować kolejnych — do końca gestu wysyłamy już tylko finał.
    if (g.inflight && this._now() - g.inflightSince > STALL_MS) g.interval = null;
    this._schedule();
  }

  /** Puszczenie palca: fala końcowa, zgaszenie albo nic. */
  public end(t: number): SwipeResult {
    const g = this._g;
    if (!g) return { outcome: 'noop', level: 0 };
    this._g = undefined;
    this._clearGestureTimer(g);
    g.t = Math.max(0, Math.min(100, t));
    if (g.t > g.maxT) g.maxT = g.t;
    const hass = this._env.hass();
    const now = this._now();

    if (g.mode !== 'scale') {
      // Z ciemności: nieuzbrojony gest (drgnięcie palca) nie zapala niczego.
      if (g.maxT < ARM_THRESHOLD || g.t <= OFF_THRESHOLD) {
        return { outcome: 'noop', level: 0 };
      }
      // Zapalamy — więc komendę dostaje KAŻDA żarówka z zestawu, także ta,
      // której cel wypada równy bazie (`planWave` by ją pominął jako „bez
      // zmian", a ona przecież jest zgaszona).
      const targets = scaleTargets(
        g.scaled.map((l) => l.base),
        g.t,
      );
      const byValue = new Map<number, string[]>();
      g.scaled.forEach((l, i) => {
        const v = Math.max(BRIGHTNESS_FLOOR, targets[i]!);
        const list = byValue.get(v);
        if (list) list.push(l.id);
        else byValue.set(v, [l.id]);
      });
      const calls: WaveCall[] = [...byValue.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([brightness, ids]) => ({ brightness, ids }));
      // Zgaszony sterownik WLED najpierw — osobno i BEZ jasności (ta idzie
      // do segmentów; na sterowniku by się z nią mnożyła).
      const controllers = closedControllers(
        hass,
        [...g.scaled.map((l) => l.id), ...g.switchOnly],
        controllerStateAt(hass, now),
      );
      // Zapalamy dokładnie ten zestaw (przywracany albo „wszystko") — nie
      // cały pokój. Przełącznik i licznik wiersza mają od razu pokazać wynik
      // gestu; inaczej tapnięcie „wyłączonego" przełącznika w oknie echa
      // zapalało cały pokój zamiast zgasić to, co właśnie zapaliliśmy.
      const undo = this._markPower([...g.scaled.map((l) => l.id), ...g.switchOnly], 'on');
      if (controllers.length > 0) {
        markControllersOn(hass, controllers, now);
        // Bez sterownika nie zapali się żaden jego segment — porażka cofa
        // cały zestaw, nie tylko (niezaznaczony) sterownik.
        this._turnOn(controllers, undo && (() => undo()));
      }
      void this._send(g, calls, FINAL_TRANSITION_S, undo);
      if (g.switchOnly.length > 0) this._turnOn(g.switchOnly, undo);
      memory.delete(this._key);
      // Same przekaźniki = pokój po prostu świeci; inaczej średnia celów,
      // czyli pozycja palca.
      const level =
        g.scaled.length > 0 ? meanLevel(calls.flatMap((c) => c.ids.map(() => c.brightness))) : 100;
      return { outcome: 'set', level };
    }

    const stillOn = (id: string): boolean => viewWithOverlay(hass, id, now).on;

    // Pokój z samymi przekaźnikami: nie ma czego ściemniać, więc suwak jest
    // włącznikiem — puszczenie poniżej połowy gasi, wyżej zostawia włączone.
    const offAt = g.scaled.length === 0 ? RELAY_OFF_BELOW : OFF_THRESHOLD;
    if (g.t <= offAt) {
      const ids = [...g.scaled.map((l) => l.id), ...g.switchOnly].filter(stillOn);
      if (ids.length === 0) return { outcome: 'noop', level: 0 };
      // Zapamiętujemy wartości SPRZED gestu, nie ściemnione po drodze.
      memory.set(this._key, {
        scaled: g.scaled.filter((l) => ids.includes(l.id)),
        switchOnly: g.switchOnly.filter((id) => ids.includes(id)),
        at: now,
      });
      // Stan w toku zgłaszamy TERAZ, nie w odroczonym `_turnOff`: ten potrafi
      // czekać do 600 ms na falę w locie, a przełącznik ma się przestawić
      // razem z wypełnieniem, w chwili puszczenia palca.
      const undo = this._markPower(ids, 'off');
      this._afterInflight(g, ids, () => this._turnOff(ids, undo));
      return { outcome: 'off', level: 0 };
    }

    const scaled = g.scaled.filter((l) => stillOn(l.id));
    const calls = planWave(scaled, g.t, g.lastSent, FINAL_MIN_DELTA);
    if (scaled.length === 0) {
      // Świecą same przekaźniki: nie ma czego skalować — pasek wraca na 100.
      return { outcome: 'noop', level: g.level };
    }
    if (calls.length === 0) {
      return { outcome: g.sentAny ? 'set' : 'noop', level: g.sentAny ? g.t : g.level };
    }
    this._afterInflight(
      g,
      calls.flatMap((c) => c.ids),
      () => this._send(g, calls, FINAL_TRANSITION_S),
    );
    return { outcome: 'set', level: g.t };
  }

  /**
   * Gest przerwany przez system (przeglądarka przejęła dotyk, drugi palec).
   * To nie jest zatwierdzenie: jeśli coś poszło po drodze, cofamy do
   * wartości startowych; jeśli nie — nie wysyłamy nic.
   */
  public cancel(): void {
    const g = this._g;
    if (!g) return;
    this._g = undefined;
    this._clearGestureTimer(g);
    if (g.mode !== 'scale' || !g.sentAny) return;
    this._afterInflight(g, g.scaled.map((l) => l.id), () => {
      // Stan sprawdzamy w chwili wysyłki: żarówki zgaszonej w międzyczasie
      // (ściana, automatyzacja) cofnięcie nie może zapalić.
      const hass = this._env.hass();
      const now = this._now();
      const byValue = new Map<number, string[]>();
      for (const l of g.scaled) {
        const sent = g.lastSent.get(l.id);
        if (sent === undefined || sent === l.base) continue;
        if (!viewWithOverlay(hass, l.id, now).on) continue;
        const list = byValue.get(l.base);
        if (list) list.push(l.id);
        else byValue.set(l.base, [l.id]);
      }
      const calls = [...byValue.entries()].map(([brightness, ids]) => ({ brightness, ids }));
      if (calls.length > 0) void this._send(g, calls, FINAL_TRANSITION_S);
    });
  }

  /**
   * Karta/kafel znika z DOM. Gest w toku przepada (palec nie został
   * puszczony — nic nie zatwierdzono), ale komenda już ZATWIERDZONA
   * puszczeniem palca, która czekała na falę w locie, idzie od razu.
   */
  public dispose(): void {
    this._abortTimers();
    this._g = undefined;
    this._flushPending();
  }

  /**
   * Wysyła od razu komendę zatwierdzoną puszczeniem palca, jeśli jeszcze
   * czeka na falę w locie. Dla wołających, którzy za chwilę wyślą własną
   * komendę do tych samych świateł — ta musi dojść do HA jako ostatnia.
   */
  public flush(): void {
    this._flushPending();
  }

  /** Komenda końcowa czekająca na falę w locie (patrz `_afterInflight`). */
  private _pending?: { run: () => void; timer: unknown };

  private _flushPending(): void {
    // `run` sam sprząta (_pending, timer, rejestr globalny) i jest
    // jednorazowy — ta sama ścieżka co flush z zewnątrz.
    this._pending?.run();
  }

  private _abortTimers(): void {
    if (this._g) this._clearGestureTimer(this._g);
  }

  private _clearGestureTimer(g: Gesture): void {
    if (g.timer !== undefined) {
      this._clearTimer(g.timer);
      g.timer = undefined;
    }
  }

  private _schedule(): void {
    const g = this._g;
    if (!g || g.mode !== 'scale' || g.interval === null) return;
    if (g.timer !== undefined || g.inflight) return;
    const wait = Math.max(0, g.nextWaveAt - this._now());
    g.timer = this._setTimer(() => {
      g.timer = undefined;
      this._fire(g);
    }, wait);
  }

  private _fire(g: Gesture): void {
    if (this._g !== g || g.interval === null || g.inflight) return;
    // W trakcie ruchu niczego nie gasimy — przejazd przez zero i z powrotem
    // jest darmowy. Poniżej progu po prostu nie wysyłamy.
    if (g.t <= OFF_THRESHOLD) return;
    if (g.lastSentT !== undefined && Math.abs(g.t - g.lastSentT) < LIVE_MIN_MOVE) return;
    const hass = this._env.hass();
    const now = this._now();
    // Żarówka zgaszona w międzyczasie przez kogoś innego nie wraca do gry.
    const scaled = g.scaled.filter((l) => viewWithOverlay(hass, l.id, now).on);
    const calls = planWave(scaled, g.t, g.lastSent, LIVE_MIN_DELTA);
    if (calls.length === 0) return;
    g.nextWaveAt = now + g.interval;
    // Przejście równe odstępowi fal: żarówka sama interpoluje między
    // próbkami, więc płynność powstaje na żarówce, nie na łączu.
    const done = this._send(g, calls, g.interval / 1000);
    g.inflight = done;
    g.inflightSince = now;
    void done.then(() => {
      if (g.inflight === done) g.inflight = undefined;
      // Palec mógł odjechać dalej w czasie lotu fali — wyślij najnowsze.
      if (this._g === g) this._schedule();
    });
  }

  /**
   * Wykonuje `fn` po fali będącej w locie (ale nie czeka w nieskończoność).
   * @param ids encje, których dotyczy komenda — po nich tapnięcie
   *   przełącznika znajduje ją w `flushSwipesTouching`.
   */
  private _afterInflight(g: Gesture, ids: readonly string[], fn: () => void): void {
    const pending = g.inflight;
    if (!pending) {
      fn();
      return;
    }
    // Zaległa komenda z jeszcze wcześniejszego gestu idzie pierwsza.
    this._flushPending();
    let ran = false;
    const entry: { run: () => void; timer: unknown } = {
      run: () => {
        if (ran) return;
        ran = true;
        pendingFinals.delete(registered);
        if (this._pending === entry) this._pending = undefined;
        this._clearTimer(entry.timer);
        fn();
      },
      timer: undefined,
    };
    const registered: PendingFinal = { ids: new Set(ids), run: entry.run };
    // Komenda końcowa nie może zostać wyprzedzona przez spóźnioną falę
    // pośrednią — inaczej żarówka kończy na starej wartości.
    entry.timer = this._setTimer(entry.run, FINAL_WAIT_MS);
    this._pending = entry;
    pendingFinals.add(registered);
    void pending.then(entry.run);
  }

  /** Zgłasza stan w toku (jeśli wołający go słucha); zwraca cofnięcie. */
  private _markPower(ids: string[], want: 'on' | 'off'): SwipePowerUndo | undefined {
    if (ids.length === 0) return undefined;
    return this._env.onPower?.(ids, want) ?? undefined;
  }

  /**
   * @param onFail cofnięcie stanu w toku — komenda, która nie doszła, nie
   *   może zostawić przełącznika w położeniu, którego nie ma (jak tapPower).
   */
  private _send(
    g: Gesture,
    calls: WaveCall[],
    transition: number,
    onFail?: SwipePowerUndo,
  ): Promise<unknown> {
    const hass = this._env.hass();
    if (!hass || calls.length === 0) return Promise.resolve();
    const now = this._now();
    const promises: Promise<unknown>[] = [];
    g.sentAny = true;
    g.lastSentT = g.t;
    for (const call of calls) {
      for (const id of call.ids) {
        g.lastSent.set(id, call.brightness);
        overlay.set(id, { brightness: call.brightness, at: now, seen: hass.states?.[id] });
      }
      promises.push(
        Promise.resolve(
          hass.callService(
            'light',
            'turn_on',
            { brightness: call.brightness, transition },
            { entity_id: call.ids },
          ),
          // Błąd pojedynczej komendy nie może wywrócić gestu; HA pokaże toast.
          // Stan w toku cofamy tylko jej światłom — reszcie komenda doszła.
        ).catch(() => onFail?.(call.ids)),
      );
    }
    return Promise.all(promises);
  }

  private _turnOn(ids: string[], onFail?: SwipePowerUndo): void {
    const hass = this._env.hass();
    if (!hass || ids.length === 0) return;
    void Promise.resolve(
      hass.callService('light', 'turn_on', {}, { entity_id: ids }),
    ).catch(() => onFail?.(ids));
  }

  private _turnOff(ids: string[], onFail?: SwipePowerUndo): void {
    const hass = this._env.hass();
    if (!hass || ids.length === 0) return;
    const now = this._now();
    for (const id of ids) {
      overlay.set(id, { brightness: 0, at: now, seen: hass.states?.[id] });
    }
    void Promise.resolve(
      hass.callService('light', 'turn_off', {}, { entity_id: ids }),
    ).catch(() => onFail?.(ids));
  }
}
