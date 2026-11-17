// Co player umie — z bitów `supported_features` media_playera HA.
//
// Dawniej ⏮ ⏯ ⏭ i ± szły bezwarunkowo: TV na wejściu HDMI albo Sonos
// z line-in dostawał wywołanie usługi, której nie obsługuje, a HA
// odpowiadał toastem „Nie udało się wykonać akcji". Czysta funkcja —
// testy w tests/media-features.test.ts.

/** Bity `MediaPlayerEntityFeature` z HA core. */
export const MP_FEATURE = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  PLAY_MEDIA: 512,
  VOLUME_STEP: 1024,
  PLAY: 16384,
} as const;

export interface PlayerCaps {
  prev: boolean;
  next: boolean;
  /** `media_play` — wznowienie / start odtwarzania. */
  play: boolean;
  /** `media_pause` — pauza w trakcie odtwarzania. */
  pause: boolean;
  seek: boolean;
  mute: boolean;
  /** `volume_set` — suwak i ± z wartością docelową. */
  volumeSet: boolean;
  /** `volume_up` / `volume_down` — urządzenie zna tylko krok (IR, część TV). */
  volumeStep: boolean;
  /** `play_media` — warunek krótkofalówki (nagranie leci przez play_media). */
  playMedia: boolean;
  turnOn: boolean;
  turnOff: boolean;
}

export function playerCaps(features: unknown): PlayerCaps {
  const f = typeof features === 'number' && Number.isFinite(features) ? features : 0;
  const has = (bit: number): boolean => (f & bit) !== 0;
  return {
    prev: has(MP_FEATURE.PREVIOUS_TRACK),
    next: has(MP_FEATURE.NEXT_TRACK),
    play: has(MP_FEATURE.PLAY),
    pause: has(MP_FEATURE.PAUSE),
    seek: has(MP_FEATURE.SEEK),
    mute: has(MP_FEATURE.VOLUME_MUTE),
    volumeSet: has(MP_FEATURE.VOLUME_SET),
    volumeStep: has(MP_FEATURE.VOLUME_STEP),
    playMedia: has(MP_FEATURE.PLAY_MEDIA),
    turnOn: has(MP_FEATURE.TURN_ON),
    turnOff: has(MP_FEATURE.TURN_OFF),
  };
}

/**
 * Jak regulować głośność: `set` (suwak + ± z wartością), `step`
 * (± wysyła volume_up/down, bez suwaka — nie znamy poziomu albo urządzenie
 * go nie przyjmie), `none` (bez ±). `set` wymaga też znanego poziomu:
 * bez `volume_level` suwak nie miałby czego pokazać.
 */
export function volumeMode(caps: PlayerCaps, volumeLevel: unknown): 'set' | 'step' | 'none' {
  if (caps.volumeSet && typeof volumeLevel === 'number') return 'set';
  if (caps.volumeStep) return 'step';
  return 'none';
}

/**
 * Usługa przycisku ⏯ dla stanu playera. `undefined` = urządzenie tej
 * akcji nie obsłuży (przycisk wyłączony / kafel otwiera more-info).
 *
 * Nie `media_play_pause`: HA rejestruje ją z wymaganiem PLAY *i* PAUSE
 * naraz (jeden zestaw bitów = wszystkie wymagane), więc player z samym
 * PAUSE albo samym PLAY dostawał toast „akcja nieobsługiwana". Robimy
 * jak frontend HA: grający → `media_pause` (bit PAUSE), każdy inny stan
 * → `media_play` (bit PLAY). Player z samym PLAY zachowuje działający
 * start zamiast martwego przycisku.
 */
export function playPauseService(
  state: string | undefined,
  caps: PlayerCaps,
): 'media_play' | 'media_pause' | undefined {
  if (state === 'playing') return caps.pause ? 'media_pause' : undefined;
  return caps.play ? 'media_play' : undefined;
}
