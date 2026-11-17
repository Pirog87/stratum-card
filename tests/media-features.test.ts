import { describe, expect, it } from 'vitest';
import { MP_FEATURE, playPauseService, playerCaps, volumeMode } from '../src/media-features.js';

describe('playerCaps', () => {
  it('brak / zły supported_features → nic nie wspierane', () => {
    for (const f of [undefined, null, 'abc', NaN]) {
      const c = playerCaps(f);
      expect(c.prev || c.next || c.play || c.pause || c.volumeSet || c.playMedia).toBe(false);
    }
  });

  it('TV na HDMI: bez prev/next/play, głośność jest', () => {
    const c = playerCaps(
      MP_FEATURE.VOLUME_SET | MP_FEATURE.VOLUME_MUTE | MP_FEATURE.TURN_ON | MP_FEATURE.TURN_OFF,
    );
    expect(c.prev).toBe(false);
    expect(c.next).toBe(false);
    expect(c.play || c.pause).toBe(false);
    expect(c.volumeSet).toBe(true);
    expect(c.mute).toBe(true);
    expect(c.turnOn && c.turnOff).toBe(true);
  });

  it('play i pause to osobne bity', () => {
    expect(playerCaps(MP_FEATURE.PAUSE)).toMatchObject({ play: false, pause: true });
    expect(playerCaps(MP_FEATURE.PLAY)).toMatchObject({ play: true, pause: false });
    expect(playerCaps(MP_FEATURE.NEXT_TRACK)).toMatchObject({ play: false, pause: false });
  });

  it('PLAY_MEDIA osobno — warunek krótkofalówki', () => {
    expect(playerCaps(MP_FEATURE.PLAY_MEDIA).playMedia).toBe(true);
    expect(playerCaps(MP_FEATURE.PLAY | MP_FEATURE.VOLUME_SET).playMedia).toBe(false);
  });
});

describe('playPauseService', () => {
  const both = playerCaps(MP_FEATURE.PLAY | MP_FEATURE.PAUSE);

  it('grający → media_pause, każdy inny stan → media_play', () => {
    expect(playPauseService('playing', both)).toBe('media_pause');
    for (const st of ['paused', 'idle', 'on', 'buffering', undefined]) {
      expect(playPauseService(st, both)).toBe('media_play');
    }
  });

  it('nigdy media_play_pause — HA wymaga do niej obu bitów naraz', () => {
    expect(playPauseService('playing', both)).not.toBe('media_play_pause');
    expect(playPauseService('paused', both)).not.toBe('media_play_pause');
  });

  it('sam PAUSE: pauza działa, start nie', () => {
    const c = playerCaps(MP_FEATURE.PAUSE);
    expect(playPauseService('playing', c)).toBe('media_pause');
    expect(playPauseService('paused', c)).toBeUndefined();
  });

  it('sam PLAY: start działa, pauza nie', () => {
    const c = playerCaps(MP_FEATURE.PLAY);
    expect(playPauseService('paused', c)).toBe('media_play');
    expect(playPauseService('playing', c)).toBeUndefined();
  });

  it('bez bitów → brak akcji', () => {
    expect(playPauseService('playing', playerCaps(0))).toBeUndefined();
    expect(playPauseService('paused', playerCaps(0))).toBeUndefined();
  });
});

describe('volumeMode', () => {
  it('VOLUME_SET + znany poziom → suwak', () => {
    expect(volumeMode(playerCaps(MP_FEATURE.VOLUME_SET), 0.3)).toBe('set');
  });

  it('VOLUME_SET bez poziomu, ale z krokiem → ±', () => {
    expect(
      volumeMode(playerCaps(MP_FEATURE.VOLUME_SET | MP_FEATURE.VOLUME_STEP), undefined),
    ).toBe('step');
  });

  it('sam krok (IR) → ± przez volume_up/down', () => {
    expect(volumeMode(playerCaps(MP_FEATURE.VOLUME_STEP), 0.5)).toBe('step');
  });

  it('poziom raportowany, ale bez bitów głośności → brak regulacji', () => {
    expect(volumeMode(playerCaps(MP_FEATURE.PLAY), 0.5)).toBe('none');
  });
});
