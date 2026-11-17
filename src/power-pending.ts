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
import { expandLightIds, viewOf, type LightView } from './light-dimming.js';
import { markOff, rememberBeforeOff } from './light-swipe.js';

export type PowerWant = 'on' | 'off';

/** Po tylu ms oczekiwany stan wygasa i znów pokazujemy stan z HA. */
export const PENDING_TTL_MS = 5000;

interface Pending {
  want: PowerWant;
  at: number;
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
): void {
  const all = new Set<string>(ids);
  for (const id of ids) {
    if (!id.startsWith('light.')) continue;
    for (const leaf of expandLightIds(hass, [id])) all.add(leaf);
  }
  for (const id of all) pending.set(id, { want, at: now });
  notify(all);
  // Po wygaśnięciu przerysuj — jeśli HA nie potwierdził, przełącznik ma
  // wrócić do prawdy, a nie wisieć w stanie, którego nie ma.
  setTimeout(() => notify(all), PENDING_TTL_MS + 50);
}

/** Komenda się nie udała — od razu wracamy do stanu z HA. */
export function clearPower(ids: readonly string[]): void {
  const all = new Set(ids);
  for (const id of ids) pending.delete(id);
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
  // HA potwierdził albo minął czas: wpis znika. Nie kasujemy na samą zmianę
  // tożsamości stanu — obiekt grupy zmienia się przy raporcie KAŻDEGO członka.
  if (now - p.at > PENDING_TTL_MS || actual === p.want) {
    pending.delete(id);
    return undefined;
  }
  return p.want;
}

/** Stan do pokazania: oczekiwany, jeśli coś czeka; inaczej ten z HA. */
export function effectiveState(
  hass: HomeAssistant | undefined,
  id: string,
  now: number = Date.now(),
): string | undefined {
  return pendingWant(hass, id, now) ?? hass?.states?.[id]?.state;
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
  const base = viewOf(hass?.states?.[id]);
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
  markPower(hass, [entityId], want);
  void Promise.resolve(
    hass.callService(domain, want === 'on' ? 'turn_on' : 'turn_off', {}, { entity_id: entityId }),
  ).catch(() => clearPower([entityId]));
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
  const lit = scope.filter((id) => {
    const s = effectiveState(hass, id, now);
    // `unknown` też gasimy — lepiej wysłać o jedną komendę za dużo niż
    // zostawić światło, którego stanu nie znamy.
    return s === 'on' || s === 'unknown';
  });
  if (lit.length > 0) {
    if (rememberKey) rememberBeforeOff(rememberKey, hass, ids, now);
    markOff(hass, lit, now);
    markPower(hass, [...ids, ...lit], 'off', now);
    void Promise.resolve(
      hass.callService('light', 'turn_off', {}, { entity_id: lit }),
    ).catch(() => clearPower([...ids, ...lit]));
    return;
  }
  const targets = scope.filter((id) => hass.states?.[id]?.state !== 'unavailable');
  if (targets.length === 0) return;
  markPower(hass, [...ids, ...targets], 'on', now);
  void Promise.resolve(
    hass.callService('light', 'turn_on', {}, { entity_id: targets }),
  ).catch(() => clearPower([...ids, ...targets]));
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
