// Ładowanie edytorów na żądanie (PKG-3, v1.110.0) — wołane z
// getConfigElement() obu kart. Adres i decyzje: editors-url.ts (czyste,
// z testami); tutaj tylko import(), timer i jedno ostrzeżenie w konsoli.
//
// Dlaczego `loadEditor` NIGDY nie odrzuca obietnicy: sprawdzone w źródłach
// frontendu HA (hui-element-editor + hui-dialog-edit-card). Odrzucone
// getConfigElement() → `_errors` + `GUImode=false`, a `_canSave` dialogu
// zwraca false przy błędzie — przycisk Zapisz zablokowany, podgląd
// rozmyty, a każda zmiana w YAML-u woła getConfigElement() ponownie i znów
// kończy się błędem. `undefined` → HA pokazuje „Edytor wizualny nie jest
// obsługiwany" + YAML, i Zapisz działa. Brak pliku edytorów ma więc
// oznaczać „edycja w YAML-u", nie zepsuty dialog.

import { EDITORS_VERSION_KEY } from './load-guard.js';
import { DEV_BUILD, VERSION } from './version.js';
import { docLanguage, localize } from './localize/localize.js';
import {
  EDITORS_FILE,
  LOAD_TIMEOUT_MS,
  editorsUrl,
  editorsVerdict,
  mayRetry,
} from './editors-url.js';

export type EditorTag = 'stratum-card-editor' | 'stratum-room-card-editor';

type FailReason = 'missing' | 'mismatch' | 'timeout';

const MODULE_URL: string = import.meta.url;

// W dev-loopie wersja stoi w miejscu między przebudowaniami — znacznik
// czasu ładowania strony sprawia, że po Ctrl+Shift+R edytory też są świeże.
// W produkcji sama wersja: ten sam adres = trafienie w cache przeglądarki.
const TOKEN = DEV_BUILD ? `${VERSION}-${Date.now().toString(36)}` : VERSION;

/** Jeden import na stronę, wspólny dla obu kart i równoległych wywołań. */
let pending: Promise<unknown> | undefined;
let attempt = 0;
let failedAt: number | undefined;
let warned = false;

function warnOnce(reason: FailReason, err?: unknown): void {
  if (warned) return;
  warned = true;
  const lang = docLanguage();
  console.warn(
    localize(lang, 'console.editors_unavailable', {
      file: EDITORS_FILE,
      reason: localize(lang, `console.editors_reason_${reason}`),
    }),
    ...(err === undefined ? [] : [err]),
  );
}

/** Czeka na `p`, ale najwyżej LOAD_TIMEOUT_MS; true = zdążyło. */
async function within(p: Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([p.then(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Element edytora albo `undefined` (HA przejdzie wtedy na YAML). */
export async function loadEditor(tag: EditorTag): Promise<HTMLElement | undefined> {
  if (!customElements.get(tag)) {
    if (!pending && !mayRetry(failedAt, Date.now())) return undefined;
    const current = (pending ??= import(
      /* @vite-ignore */ editorsUrl(MODULE_URL, TOKEN, attempt)
    ));
    try {
      if (!(await within(current))) {
        // Import dalej trwa — nie przerywamy go. Gdy dojdzie, następne
        // wywołanie (HA woła przy każdej zmianie configu) dostanie edytor.
        warnOnce('timeout');
        return undefined;
      }
    } catch (err) {
      if (pending === current) {
        pending = undefined;
        attempt += 1;
        failedAt = Date.now();
      }
      warnOnce('missing', err);
      return undefined;
    }
  }
  const verdict = editorsVerdict(
    !!customElements.get(tag),
    (window as unknown as Record<symbol, unknown>)[EDITORS_VERSION_KEY],
    VERSION,
  );
  if (verdict !== 'ok') {
    warnOnce(verdict);
    return undefined;
  }
  return document.createElement(tag);
}
