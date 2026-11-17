// Stan „w toku" dla przełączników — natychmiastowa reakcja na tapnięcie.
//
// Między tapnięciem a potwierdzeniem z Home Assistanta mija 0,3–3 s
// (WebSocket → HA → MQTT → Zigbee → urządzenie → raport → WebSocket; przy
// gaszeniu kuchni HA raportuje 26 lamp po kolei). Dotąd przełącznik stał
// w starym położeniu aż do ostatniego raportu, więc użytkownik tapał drugi
// raz — a `toggle` odwracał wtedy jego własną akcję.
//
// Tu trzymamy oczekiwany stan per encja: przełącznik pokazuje go od razu,
// aż HA zaraportuje to samo albo minie 5 s (wtedy wygrywa prawda z HA —
// komenda mogła się nie udać i nie wolno tego ukryć). Czyste funkcje, bez
// DOM-u i Lita; komponenty subskrybują zmiany, żeby przerysować się od razu.

import type { HomeAssistant } from './types.js';
import { groupMemberIds } from './area-entities.js';
import {
  closedControllers,
  expandLightIds,
  gateView,
  lightControllerOf,
  viewOf,
  type ControllerState,
  type LightView,
} from './light-dimming.js';
import { controllerOpenedBySwipe, markControllersOn, markOff, rememberBeforeOff } from './light-swipe.js';

export type PowerWant = 'on' | 'off';

/** Po tylu ms oczekiwany stan wygasa i znów pokazujemy stan z HA. */
export const PENDING_TTL_MS = 5000;

interface Pending {
  want: PowerWant;
  at: number;
  /**
   * Czy od zaznaczenia HA pokazał choć raz stan INNY niż oczekiwany. Bez
   * tego drugi tap w trakcie potwierdzania psuł sprawę: tap 1 = zgaś, tap 2
   * = zapal, HA wciąż pokazuje „on" sprzed tapu 1 — i wpis „on" od razu
   * uznawał się za potwierdzony, a spóźnione echo „off" z tapu 1 przestawiało
   * przełącznik z powrotem. Potwierdzeniem jest dopiero przejście
   * „inny stan → oczekiwany".
   */
  sawOther: boolean;
}

const pending = new Map<string, Pending>();
const listeners = new Set<(ids: ReadonlySet<string>) => void>();

/** Subskrypcja zmian stanu „w toku" (ustawienie, wygaśnięcie). */
export function subscribePower(cb: (ids: ReadonlySet<string>) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(ids: ReadonlySet<string>): void {
  for (const cb of [...listeners]) cb(ids);
}

/** Tylko do testów. */
export function resetPowerPending(): void {
  pending.clear();
}

/**
 * Zapamiętuje oczekiwany stan dla encji. Grupy świateł (pomocnik HA,
 * sterownik WLED) zaznaczamy razem z członkami — kafel grupy i wiersz pokoju
 * liczą swoje stany z różnych poziomów.
 */
export function markPower(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  want: PowerWant,
  now: number = Date.now(),
  /**
   * `false` = zaznacz tylko podane encje, bez członków. Dla sterownika WLED
   * włączanego obok segmentów: jego segmenty spoza zapalanego zestawu nie
   * dostają komendy, więc nie mogą też udawać, że zaraz się zapalą.
   */
  expandGroups = true,
): Set<string> {
  const all = new Set<string>(ids);
  for (const id of ids) {
    if (!expandGroups || !id.startsWith('light.')) continue;
    for (const leaf of expandLightIds(hass, [id])) all.add(leaf);
  }
  for (const id of [...all]) {
    const actual = hass?.states?.[id]?.state;
    // Encja niedostępna nie dostaje stanu w toku — ma wyglądać na martwą,
    // a nie na działającą lampę, która zaraz się zapali.
    if (actual === 'unavailable' || actual === undefined) {
      all.delete(id);
      continue;
    }
    pending.set(id, { want, at: now, sawOther: actual !== want });
  }
  notify(all);
  // Po wygaśnięciu przerysuj — jeśli HA nie potwierdził, przełącznik ma
  // wrócić do prawdy, a nie wisieć w stanie, którego nie ma.
  setTimeout(() => notify(all), PENDING_TTL_MS + 50);
  return all;
}

/**
 * Komenda się nie udała — od razu wracamy do stanu z HA. Przyjmuje zbiór
 * zwrócony przez `markPower` (z rozwiniętymi członkami grup).
 */
export function clearPower(ids: Iterable<string>): void {
  const all = new Set(ids);
  for (const id of all) pending.delete(id);
  notify(all);
}

/** Oczekiwany stan encji albo `undefined`, gdy nic nie czeka. */
export function pendingWant(
  hass: HomeAssistant | undefined,
  id: string,
  now: number = Date.now(),
): PowerWant | undefined {
  const p = pending.get(id);
  if (!p) return undefined;
  const actual = hass?.states?.[id]?.state;
  // Minął czas albo encja padła: wraca prawda z HA. Nie kasujemy na samą
  // zmianę tożsamości stanu — obiekt grupy zmienia się przy raporcie
  // KAŻDEGO członka.
  if (now - p.at > PENDING_TTL_MS || actual === 'unavailable' || actual === undefined) {
    pending.delete(id);
    return undefined;
  }
  if (actual !== p.want) {
    p.sawOther = true;
    return p.want;
  }
  // HA pokazuje oczekiwany stan — potwierdzenie tylko po przejściu z innego.
  if (p.sawOther) {
    pending.delete(id);
    return undefined;
  }
  return p.want;
}

/**
 * Stan sterownika WLED widziany przez przełączniki: oczekiwany (tapnięcie),
 * włączony przed chwilą gestem, albo ten z HA. Celowo NIE `effectiveState`
 * — ten dla grupy liczy stan z segmentów, a segmenty pytają o sterownik
 * (nieskończona rekurencja).
 */
function controllerStateAt(hass: HomeAssistant | undefined, now: number): ControllerState {
  return (c) =>
    pendingWant(hass, c, now) ??
    (controllerOpenedBySwipe(hass, c, now) ? 'on' : hass?.states?.[c]?.state);
}

/**
 * Włącza zgaszone sterowniki WLED zapalanych segmentów: osobne `turn_on`
 * BEZ jasności (jasność na sterowniku mnożyłaby się z jasnością segmentów)
 * i stan „w toku", żeby segmenty od razu czytały się jako zapalane.
 * Sterownik niedostępny i włączony zostają w spokoju.
 */
export function turnOnControllers(
  hass: HomeAssistant | undefined,
  leafIds: readonly string[],
  now: number = Date.now(),
): void {
  if (!hass) return;
  const controllers = closedControllers(hass, leafIds, controllerStateAt(hass, now));
  if (controllers.length === 0) return;
  markControllersOn(hass, controllers, now);
  const marked = markPower(hass, controllers, 'on', now, false);
  void Promise.resolve(
    hass.callService('light', 'turn_on', {}, { entity_id: controllers }),
  ).catch(() => clearPower(marked));
}

/** Stan do pokazania: oczekiwany, jeśli coś czeka; inaczej ten z HA. */
export function effectiveState(
  hass: HomeAssistant | undefined,
  id: string,
  now: number = Date.now(),
): string | undefined {
  const own = pendingWant(hass, id, now);
  if (own) return own;
  const raw = hass?.states?.[id];
  // Segment zgaszonego sterownika WLED nie świeci, choć HA mówi „on".
  // Tylko „on" — niedostępny segment ma dalej wyglądać na niedostępny.
  if (raw?.state === 'on') {
    const controller = lightControllerOf(hass, id);
    if (controller !== undefined && controllerStateAt(hass, now)(controller) === 'off') {
      return 'off';
    }
  }
  // Grupa świateł: gdy któryś członek czeka na potwierdzenie, stan grupy
  // wyliczamy z członków — inaczej kafel grupy po głównym włączniku pokoju
  // świecił „on, 0%" aż do raportu ostatniego członka. Bez członków w toku
  // zostaje stan z HA (szanuje np. grupy `all: true`).
  if (id.startsWith('light.') && groupMemberIds(raw)) {
    const leaves = expandLightIds(hass, [id]);
    if (leaves.some((l) => pending.has(l))) {
      return leaves.some((l) => (pendingWant(hass, l, now) ?? hass?.states?.[l]?.state) === 'on')
        ? 'on'
        : 'off';
    }
  }
  return raw?.state;
}

export function isOnEffective(
  hass: HomeAssistant | undefined,
  id: string,
  now: number = Date.now(),
): boolean {
  return effectiveState(hass, id, now) === 'on';
}

/** `viewOf` z uwzględnieniem stanu w toku — dla poziomu wypełnienia wiersza. */
export function effectiveView(
  hass: HomeAssistant | undefined,
  id: string,
  now: number = Date.now(),
): LightView {
  const base = gateView(hass, id, viewOf(hass?.states?.[id]), controllerStateAt(hass, now));
  const want = pendingWant(hass, id, now);
  if (want === 'off') return { ...base, on: false, brightness: undefined };
  if (want === 'on') return { ...base, on: true };
  return base;
}

/** Czy zbiór encji dotyczy któregoś z podanych id (encja albo członek grupy). */
export function touches(
  hass: HomeAssistant | undefined,
  entityId: string,
  changed: ReadonlySet<string>,
): boolean {
  if (changed.has(entityId)) return true;
  const members = groupMemberIds(hass?.states?.[entityId]);
  return Boolean(members?.some((m) => changed.has(m)));
}

const TOGGLEABLE = new Set([
  'light',
  'switch',
  'fan',
  'input_boolean',
  'automation',
  'siren',
  'humidifier',
]);

/**
 * Tapnięcie przełącznika jednej encji. Zamiast `toggle` wysyłamy jawne
 * `turn_on` / `turn_off` wyliczone ze stanu, który użytkownik WIDZI (z
 * oczekiwanym włącznie). Drugi tap w trakcie gaszenia nie zapala więc
 * z powrotem; zapalanie i gaszenie mają jedno znaczenie niezależnie od tego,
 * co HA zdążył już zaraportować.
 *
 * Zwraca `false`, gdy domeny nie obsługujemy (wołający robi wtedy swoje).
 */
export function tapPower(hass: HomeAssistant | undefined, entityId: string): boolean {
  const domain = entityId.split('.')[0] ?? '';
  if (!hass || !TOGGLEABLE.has(domain)) return false;
  const on = isOnEffective(hass, entityId);
  const want: PowerWant = on ? 'off' : 'on';
  // Kafel segmentu WLED przy zgaszonym sterowniku: zapalamy też sterownik.
  // (Tapnięcie samego sterownika i tak go włącza — nie dublujemy komendy.)
  if (want === 'on' && lightControllerOf(hass, entityId) !== undefined) {
    turnOnControllers(hass, [entityId]);
  }
  const marked = markPower(hass, [entityId], want);
  void Promise.resolve(
    hass.callService(domain, want === 'on' ? 'turn_on' : 'turn_off', {}, { entity_id: entityId }),
  ).catch(() => clearPower(marked));
  return true;
}

/**
 * Włącznik wszystkich świateł pokoju (wiersz, główny włącznik popupu, akcja
 * `toggle-lights`). Cokolwiek świeci → zgaś; nic → zapal wszystko.
 *
 * Gasimy TYLKO to, co świeci. Komenda do 26 lamp, z których świeci 10,
 * to 26 ramek Zigbee zamiast 10 — „popcorn" po kolei trwał przez to 2–3×
 * dłużej, niż trzeba.
 *
 * `rememberKey` — klucz pamięci suwaka wiersza: przeciągnięcie po ciemnym
 * wierszu przywróci zgaszony tu zestaw zamiast zapalać cały pokój.
 */
export function toggleRoomLights(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
  rememberKey?: string,
): void {
  if (!hass || ids.length === 0) return;
  const now = Date.now();
  const leaves = expandLightIds(hass, ids);
  const scope = leaves.length > 0 ? leaves : [...ids];
  // Decyzja tym samym kryterium, co wyświetlany stan przełącznika
  // (`anyLightOn`): inaczej pokój z jedną lampą „unknown" pokazywał
  // „wyłączone", a tapnięcie gasiło zamiast zapalić.
  const anyOn = scope.some((id) => isOnEffective(hass, id, now));
  if (anyOn) {
    // Gasząc, bierzemy też `unknown` — lepiej o jedną komendę za dużo niż
    // zostawić światło, którego stanu nie znamy.
    const lit = scope.filter((id) => {
      const s = effectiveState(hass, id, now);
      return s === 'on' || s === 'unknown';
    });
    if (rememberKey) rememberBeforeOff(rememberKey, hass, ids, now);
    markOff(hass, lit, now);
    const marked = markPower(hass, lit, 'off', now);
    void Promise.resolve(
      hass.callService('light', 'turn_off', {}, { entity_id: lit }),
    ).catch(() => clearPower(marked));
    return;
  }
  const targets = scope.filter((id) => hass.states?.[id]?.state !== 'unavailable');
  if (targets.length === 0) return;
  // Najpierw zgaszone sterowniki WLED — sam `turn_on` segmentów nie
  // zapala paska, gdy sterownik jest wyłączony.
  turnOnControllers(hass, targets, now);
  const marked = markPower(hass, targets, 'on', now);
  void Promise.resolve(
    hass.callService('light', 'turn_on', {}, { entity_id: targets }),
  ).catch(() => clearPower(marked));
}

/**
 * Hak `onPower` dla LightSwipe (gest jasności wiersza / kafla). Gest, który
 * gasi pokój albo zapala go z ciemności, zaznacza stan w toku tak samo jak
 * tapnięcie przełącznika — przełącznik, licznik i podświetlenie wiersza idą
 * za wynikiem gestu od razu, a nie za raportami Zigbee 1–3 s później.
 * Cofnięcie = `clearPower` dokładnie zaznaczonego zbioru (komenda padła).
 */
export function swipePowerHook(
  hass: () => HomeAssistant | undefined,
): (ids: string[], want: PowerWant) => () => void {
  return (ids, want) => {
    const marked = markPower(hass(), ids, want);
    return () => clearPower(marked);
  };
}

/** Czy cokolwiek z zestawu świeci — z uwzględnieniem stanu w toku. */
export function anyLightOn(
  hass: HomeAssistant | undefined,
  ids: readonly string[],
): boolean {
  const now = Date.now();
  const leaves = expandLightIds(hass, ids);
  const scope = leaves.length > 0 ? leaves : ids;
  return scope.some((id) => isOnEffective(hass, id, now));
}
