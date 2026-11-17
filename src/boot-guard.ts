// Pierwszy moduł ewaluowany w bundlu — MUSI być pierwszym importem
// w stratum-card.ts. Zakłada ochronę przed podwójnym załadowaniem, zanim
// którykolwiek `@customElement` w zależnościach zdąży zawołać define.
// Logika i uzasadnienie: load-guard.ts.

import { installLoadGuard } from './load-guard.js';
import { VERSION } from './version.js';

export const loadGuard = installLoadGuard(
  customElements,
  window as unknown as Record<symbol, unknown>,
  VERSION,
);

// Siatka bezpieczeństwa: stratum-card.ts zdejmuje filtr na końcu swojej
// ewaluacji, ale gdyby coś po drodze rzuciło, filtr nie może zostać
// w globalnym rejestrze na zawsze. Ewaluacja bundla jest synchroniczna,
// więc mikrozadanie odpali się dopiero po niej.
queueMicrotask(() => loadGuard.release());
