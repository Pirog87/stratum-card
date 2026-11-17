// Aktywacja sceny z kafla — decyzje bez DOM-u i bez Lita (testy
// w `tests/scene-activation.test.ts`).
//
// Problem: kafel zakładał sukces. `callService` szło bez `catch`, a stan
// „w toku" zawsze kończył się zwykłym pierścieniem „zrobione" — także gdy
// HA odrzucił polecenie (scena usunięta/przemianowana, urządzenia offline).
// Kafel mówił „gotowe", a w konsoli lądowało nieobsłużone odrzucenie.

import type { HomeAssistant } from './types.js';

/**
 * Co pokazać od razu po tapnięciu:
 *  - `pending` — scena istnieje i jest dostępna: obwódka stoi, aż światła
 *    dojadą (scene-pending.ts), powtórny tap nie wysyła drugi raz;
 *  - `await`  — scena nieznana albo `unavailable`: nic nie obiecujemy z góry,
 *    pierścień pokaże dopiero wynik wywołania (sukces albo błąd);
 *  - `ack`    — skrypt / automatyzacja: krótki błysk potwierdzenia jak dotąd.
 */
export type SceneTapPlan = 'pending' | 'await' | 'ack';

export function sceneTapPlan(hass: HomeAssistant | undefined, entityId: string): SceneTapPlan {
  if (!entityId.startsWith('scene.')) return 'ack';
  const st = hass?.states?.[entityId];
  if (!st || st.state === 'unavailable') return 'await';
  return 'pending';
}

/**
 * Wynik wywołania usługi: true = HA przyjął, false = odrzucił albo rzuciło
 * synchronicznie (stub hass, zerwane połączenie). Nigdy nie odrzuca —
 * wołający nie musi pamiętać o `catch`.
 */
export async function activationFailed(call: () => unknown): Promise<boolean> {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}
