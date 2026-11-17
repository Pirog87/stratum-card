// Scena „w toku" — od tapnięcia do chwili, gdy światła przestały się zmieniać.
//
// Scena nie ma stanu „włączona": to jednorazowe polecenie. Dotąd kafel
// błyskał obwódką przez 0,9 s, a 26 lamp Zigbee kończyło zmianę po 2,5–3 s —
// przez większość tego czasu kafel wyglądał na bezczynny, więc użytkownik
// tapał drugi i trzeci raz, a każde powtórzenie dokładało do kolejki Zigbee
// kolejne 26 komend i opóźniało lampy, które jeszcze nie zdążyły.
//
// Tu jest czysta logika (bez DOM-u, bez Lita, testy w
// `tests/scene-pending.test.ts`): kiedy uznać scenę za „dojechaną".

import type { HassEntity, HomeAssistant } from './types.js';
import { groupMemberIds } from './area-entities.js';

/** Najdłużej tyle trzymamy stan „w toku" — potem i tak puszczamy. */
export const SCENE_MAX_MS = 4000;

/** Tyle ciszy po ostatnim raporcie członka = scena dojechała. */
export const SCENE_QUIET_MS = 700;

/** Bez żadnego raportu tyle czekamy (np. wszystko już było w stanie sceny). */
export const SCENE_NO_ECHO_MS = 1500;

export interface ScenePending {
  startedAt: number;
  /** Stany członków sceny w chwili tapnięcia (tożsamość obiektów). */
  snapshot: Map<string, HassEntity | undefined>;
  /** Członkowie, którzy już zaraportowali zmianę. */
  reported: Set<string>;
  lastChangeAt: number;
}

/** Członkowie sceny (atrybut `entity_id` encji sceny). */
export function sceneMembers(hass: HomeAssistant | undefined, sceneId: string): string[] {
  return groupMemberIds(hass?.states?.[sceneId]) ?? [];
}

export function startScenePending(
  hass: HomeAssistant | undefined,
  sceneId: string,
  now: number,
): ScenePending {
  const snapshot = new Map<string, HassEntity | undefined>();
  for (const id of sceneMembers(hass, sceneId)) snapshot.set(id, hass?.states?.[id]);
  return { startedAt: now, snapshot, reported: new Set(), lastChangeAt: now };
}

/**
 * Aktualizuje postęp i mówi, czy scena dojechała. Członek „zaraportował",
 * gdy jego obiekt stanu ma inną tożsamość niż w chwili tapnięcia (HA
 * podmienia obiekt tylko przy realnej zmianie).
 *
 * Koniec, gdy:
 *  - zaraportowali wszyscy członkowie, albo
 *  - ktoś już zaraportował, a od ostatniego raportu minęło SCENE_QUIET_MS
 *    (lampy, które były już w stanie sceny, nie raportują wcale), albo
 *  - nikt nie zaraportował przez SCENE_NO_ECHO_MS, albo
 *  - minęło SCENE_MAX_MS (bezpiecznik).
 */
export function sceneSettled(
  p: ScenePending,
  hass: HomeAssistant | undefined,
  now: number,
): boolean {
  for (const [id, before] of p.snapshot) {
    if (p.reported.has(id)) continue;
    if (hass?.states?.[id] !== before) {
      p.reported.add(id);
      p.lastChangeAt = now;
    }
  }
  if (now - p.startedAt >= SCENE_MAX_MS) return true;
  if (p.snapshot.size > 0 && p.reported.size === p.snapshot.size) return true;
  if (p.reported.size > 0) return now - p.lastChangeAt >= SCENE_QUIET_MS;
  return now - p.startedAt >= SCENE_NO_ECHO_MS;
}
