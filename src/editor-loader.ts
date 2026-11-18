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
import { BUILD_ID, DEV_BUILD } from './version.js';
import { docLanguage, localize } from './localize/localize.js';
import {
  EDITORS_FILE,
  LOAD_TIMEOUT_MS,
  editorsUrl,
  editorsVerdict,
  loadStep,
  type AttemptStatus,
} from './editors-url.js';

export type EditorTag = 'stratum-card-editor' | 'stratum-room-card-editor';

type FailReason = 'missing' | 'mismatch' | 'timeout';

const MODULE_URL: string = import.meta.url;

// Produkcja: id builda (wersja + skrót źródeł, version.ts) — ten sam kod =
// ten sam adres = trafienie w cache, zmieniony kod = nowy adres, także przy
// tej samej wersji. Dev-loop (`npm run watch`): id stoi w miejscu przez całą
// sesję watchera, więc dokładamy znacznik czasu ładowania strony — po
// odświeżeniu edytory też są świeże.
const TOKEN = DEV_BUILD ? `${BUILD_ID}-${Date.now().toString(36)}` : BUILD_ID;

interface Attempt {
  status: AttemptStatus;
  /** Rozstrzyga się po imporcie, błędzie albo timeoucie — nigdy nie odrzuca. */
  settled: Promise<void>;
}

/** Bieżąca próba — wspólna dla obu kart i równoległych wywołań (jedno żądanie). */
let current: Attempt | undefined;
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

function startAttempt(): Attempt {
  const entry: Attempt = { status: 'loading', settled: Promise.resolve() };
  const url = editorsUrl(MODULE_URL, TOKEN, attempt);
  // Pierwsze rozstrzygnięcie wygrywa. Timeout zamyka próbę jako nieudaną,
  // choć import() dalej wisi (przerwać go nie umiemy): następne wywołania
  // nie czekają na niego drugi raz (loadStep), a po odstępie idzie nowa
  // próba pod nowym adresem (retry=n). Jeśli wiszący import jednak dojdzie,
  // edytory się zarejestrują i loadEditor użyje ich bez pytania o stan.
  const fail = (reason: FailReason, err?: unknown): void => {
    if (entry.status !== 'loading') return;
    entry.status = 'failed';
    attempt += 1;
    failedAt = Date.now();
    warnOnce(reason, err);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const imported = import(/* @vite-ignore */ url).then(
    () => {
      if (entry.status === 'loading') entry.status = 'loaded';
    },
    (err: unknown) => fail('missing', err),
  );
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      fail('timeout');
      resolve();
    }, LOAD_TIMEOUT_MS);
  });
  entry.settled = Promise.race([imported, timedOut]).finally(() => clearTimeout(timer));
  return entry;
}

/** Element edytora albo `undefined` (HA przejdzie wtedy na YAML). */
export async function loadEditor(tag: EditorTag): Promise<HTMLElement | undefined> {
  if (!customElements.get(tag)) {
    const step = loadStep(current?.status ?? 'none', failedAt, Date.now());
    if (step === 'start') current = startAttempt();
    if (step !== 'skip' && current) await current.settled;
  }
  const verdict = editorsVerdict(
    !!customElements.get(tag),
    (window as unknown as Record<symbol, unknown>)[EDITORS_VERSION_KEY],
    BUILD_ID,
  );
  if (verdict !== 'ok') {
    warnOnce(verdict);
    return undefined;
  }
  return document.createElement(tag);
}
