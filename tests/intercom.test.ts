import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IntercomError,
  intercomMessage,
  micFailure,
  sendFailure,
  settleWithin,
  uploadFailure,
  withTimeout,
} from '../src/intercom.js';
import { tileEn, tilePl } from '../src/localize/tile.js';

describe('micFailure', () => {
  it('odmowa zgody → mic_denied', () => {
    expect(micFailure({ name: 'NotAllowedError' })).toBe('mic_denied');
    expect(micFailure({ name: 'SecurityError' })).toBe('mic_denied');
  });

  it('brak urządzenia → mic_missing, reszta → mic_failed', () => {
    expect(micFailure({ name: 'NotFoundError' })).toBe('mic_missing');
    expect(micFailure(new Error('x'))).toBe('mic_failed');
    expect(micFailure(null)).toBe('mic_failed');
  });
});

describe('uploadFailure / sendFailure', () => {
  it('401/403 → brak uprawnień, inne statusy → ogólna porażka', () => {
    expect(uploadFailure(403)).toBe('upload_denied');
    expect(uploadFailure(401)).toBe('upload_denied');
    expect(uploadFailure(400)).toBe('upload_failed');
    expect(uploadFailure(500)).toBe('upload_failed');
  });

  it('klasyfikuje wyjątki ścieżki wysyłki', () => {
    const own = new IntercomError('upload_denied', 403);
    expect(sendFailure(own)).toBe(own);
    expect(sendFailure(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(sendFailure({ name: 'AbortError' }).kind).toBe('timeout');
    expect(sendFailure(new Error('service')).kind).toBe('play_failed');
  });
});

describe('intercomMessage', () => {
  it('wstawia status HTTP', () => {
    expect(intercomMessage(new IntercomError('upload_denied', 403), tilePl)).toContain('HTTP 403');
    expect(intercomMessage(new IntercomError('upload_failed', 400), tileEn)).toContain('HTTP 400');
  });

  it('każdy rodzaj porażki ma tekst w obu językach', () => {
    for (const kind of [
      'mic_denied',
      'mic_missing',
      'mic_failed',
      'upload_denied',
      'upload_failed',
      'network',
      'play_failed',
      'timeout',
    ] as const) {
      const e = new IntercomError(kind, 500);
      expect(intercomMessage(e, tilePl)).not.toMatch(/\{/);
      expect(intercomMessage(e, tileEn)).not.toMatch(/\{/);
    }
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('zwraca wynik, gdy zdąży', async () => {
    await expect(withTimeout(async () => 7, 1000)).resolves.toBe(7);
  });

  it('przepuszcza własny błąd', async () => {
    const err = new IntercomError('upload_denied', 403);
    await expect(withTimeout(async () => Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('zawieszone zadanie: timeout + abort sygnału', async () => {
    let signal: AbortSignal | undefined;
    const p = withTimeout((s) => {
      signal = s;
      return new Promise<never>(() => undefined);
    }, 15000);
    const check = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(15000);
    await check;
    expect(signal?.aborted).toBe(true);
  });

  it('synchroniczny wyjątek w run → odrzucenie, nie throw', async () => {
    await expect(
      withTimeout(() => {
        throw new Error('sync');
      }, 1000),
    ).rejects.toThrow('sync');
  });
});

describe('settleWithin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spełniona w czasie → done', async () => {
    await expect(settleWithin(Promise.resolve(1), 1000)).resolves.toBe('done');
  });

  it('odrzucona w czasie → ten sam błąd', async () => {
    const err = new IntercomError('play_failed');
    await expect(settleWithin(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('nadal trwa po czasie → pending, bez błędu (komunikat MA gra 15 s)', async () => {
    let finish!: () => void;
    const play = new Promise<void>((r) => {
      finish = r;
    });
    const out = settleWithin(play, 10000);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(out).resolves.toBe('pending');
    finish();
    await expect(play).resolves.toBeUndefined();
  });

  it('odrzucenie po czasie nie zmienia wyniku — obsługuje je wywołujący', async () => {
    let fail!: (e: unknown) => void;
    const play = new Promise<void>((_, rej) => {
      fail = rej;
    });
    const late = play.catch((e: unknown) => e);
    const out = settleWithin(play, 10000);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(out).resolves.toBe('pending');
    const err = new IntercomError('play_failed');
    fail(err);
    await expect(late).resolves.toBe(err);
  });
});
