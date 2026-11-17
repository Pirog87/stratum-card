// Krótkofalówka — klasyfikacja porażek i limit czasu. Czyste funkcje,
// testy w tests/intercom.test.ts.
//
// Dawniej każda porażka była cicha: brak zgody na mikrofon w aplikacji HA
// na Androidzie, 403 przy uploadzie przez Nabu Casa, brak `media_dirs` —
// przycisk wracał do spoczynku, a użytkownik był pewny, że komunikat
// poleciał. Zawieszony upload (fetch bez limitu) zostawiał stan
// „wysyłanie" na zawsze, a kolejne przytrzymania były ignorowane.

import type { TileStrings } from './localize/tile.js';
import { fillTemplate } from './tile-state-text.js';

export type IntercomFailure =
  | 'mic_denied'
  | 'mic_missing'
  | 'mic_failed'
  | 'upload_denied'
  | 'upload_failed'
  | 'network'
  | 'play_failed'
  | 'timeout';

export class IntercomError extends Error {
  public readonly kind: IntercomFailure;

  public readonly status?: number;

  constructor(kind: IntercomFailure, status?: number) {
    super(status !== undefined ? `${kind} ${status}` : kind);
    this.kind = kind;
    this.status = status;
  }
}

/** Limit uploadu nagrania (Nabu Casa na słabym LTE bywa wolny, ale nie 15 s). */
export const INTERCOM_UPLOAD_TIMEOUT_MS = 15000;

/**
 * Ile czekamy na odpowiedź `play_media`, zanim przycisk wróci do spoczynku.
 * To NIE jest limit porażki: część integracji (Music Assistant
 * `play_announcement`) odpowiada dopiero po odegraniu komunikatu, a
 * nagranie ma do 30 s. Dawniej 15-sekundowa wiadomość kończyła się po 10 s
 * czerwonym mikrofonem i „przerwano" — w trakcie odtwarzania — więc
 * użytkownik nagrywał ją drugi raz. Po tym czasie uznajemy wysyłkę za
 * dokonaną (plik jest na serwerze, usługa poszła), a błąd pokazujemy tylko
 * wtedy, gdy usługa później naprawdę odrzuci wywołanie (settleWithin).
 * „Przerwano" (`timeout`) zostaje dla uploadu — tam abort faktycznie
 * zrywa połączenie.
 */
export const INTERCOM_PLAY_CONFIRM_MS = 10000;

/** Jak długo przycisk pokazuje stan błędu, zanim wróci do spoczynku. */
export const INTERCOM_ERROR_MS = 3000;

/** Błąd `getUserMedia` → rodzaj porażki (nazwy z DOMException). */
export function micFailure(err: unknown): IntercomFailure {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'mic_denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'mic_missing';
  return 'mic_failed';
}

/** Status HTTP uploadu → rodzaj porażki (401/403 = brak uprawnień admina). */
export function uploadFailure(status: number): IntercomFailure {
  return status === 401 || status === 403 ? 'upload_denied' : 'upload_failed';
}

/** Dowolny wyjątek ścieżki wysyłki → rodzaj porażki. */
export function sendFailure(err: unknown): IntercomError {
  if (err instanceof IntercomError) return err;
  // AbortError bez naszego timeoutu się nie zdarza — abort robi tylko on.
  if ((err as { name?: unknown } | null)?.name === 'AbortError') {
    return new IntercomError('timeout');
  }
  // fetch odrzuca TypeError przy zerwanym połączeniu.
  if (err instanceof TypeError) return new IntercomError('network');
  return new IntercomError('play_failed');
}

/** Komunikat dla użytkownika (toast + podpis przycisku). */
export function intercomMessage(err: IntercomError, s: TileStrings): string {
  return fillTemplate(s.intercom[err.kind], { status: err.status ?? '?' });
}

/**
 * Uruchamia `run` z limitem czasu. Po przekroczeniu: abort sygnału (fetch
 * przerywa połączenie) i odrzucenie `IntercomError('timeout')` — nawet
 * jeśli `run` sygnału nie słucha (np. `callService` po WebSockecie).
 */
export function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const ctl = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ctl.abort();
      reject(new IntercomError('timeout'));
    }, ms);
    let p: Promise<T>;
    try {
      p = Promise.resolve(run(ctl.signal));
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      return;
    }
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Czeka na `p` najwyżej `ms`. `'done'` — spełniona w czasie; `'pending'` —
 * czas minął, a `p` dalej trwa (nie jest przerywana ani odrzucana);
 * odrzucenie `p` w czasie przechodzi dalej jako błąd. W odróżnieniu od
 * withTimeout przekroczenie czasu nie jest porażką — patrz
 * INTERCOM_PLAY_CONFIRM_MS. Odrzucenie po czasie obsługuje wywołujący
 * (własnym `.catch` na `p`); tu jest tylko połykane, żeby nie wisiało
 * jako „unhandled rejection".
 */
export function settleWithin(p: Promise<unknown>, ms: number): Promise<'done' | 'pending'> {
  return new Promise((resolve, reject) => {
    let over = false;
    const timer = setTimeout(() => {
      over = true;
      resolve('pending');
    }, ms);
    p.then(
      () => {
        clearTimeout(timer);
        if (!over) resolve('done');
      },
      (e: unknown) => {
        clearTimeout(timer);
        if (!over) reject(e);
      },
    );
  });
}
