// Pierwszy moduł pliku edytorów — MUSI być pierwszym importem
// w editors-entry.ts, z tego samego powodu co boot-guard.ts w karcie:
// filtr na `define` musi stać, zanim dekoratory @customElement edytorów
// zawołają define. Gdy edytory są już zarejestrowane (druga ewaluacja pliku
// pod innym adresem), ta kopia niczego nie definiuje i nie rzuca.
// Pierwsza ewaluacja zapisuje id swojego builda (BUILD_ID, nie samą wersję)
// pod EDITORS_VERSION_KEY — po nim loader karty poznaje, czy edytory
// pochodzą z tego samego builda co karta (editors-url.ts).

import {
  EDITORS_SENTINEL_TAG,
  EDITORS_VERSION_KEY,
  installLoadGuard,
} from './load-guard.js';
import { BUILD_ID } from './version.js';

export const editorsGuard = installLoadGuard(
  customElements,
  window as unknown as Record<symbol, unknown>,
  BUILD_ID,
  { sentinel: EDITORS_SENTINEL_TAG, versionKey: EDITORS_VERSION_KEY },
);

// Siatka bezpieczeństwa jak w boot-guard.ts: gdyby ewaluacja rzuciła przed
// editors-entry.ts, filtr nie może zostać w globalnym rejestrze na zawsze.
queueMicrotask(() => editorsGuard.release());
