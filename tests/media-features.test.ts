import { describe, expect, it } from 'vitest';
import { MP_FEATURE, playerCaps, volumeMode } from '../src/media-features.js';

describe('playerCaps', () => {
  it('brak / zły supported_features → nic nie wspierane', () => {
    for (const f of [undefined, null, 'abc', NaN]) {
      const c = playerCaps(f);
      expect(c.prev || c.next || c.playPause || c.volumeSet || c.playMedia).toBe(false);
    }
  });

  it('TV na HDMI: bez prev/next/play, głośność jest', () => {
    const c = playerCaps(
      MP_FEATURE.VOLUME_SET | MP_FEATURE.VOLUME_MUTE | MP_FEATURE.TURN_ON | MP_FEATURE.TURN_OFF,
    );
    expect(c.prev).toBe(false);
    expect(c.next).toBe(false);
    expect(c.playPause).toBe(false);
    expect(c.volumeSet).toBe(true);
    expect(c.mute).toBe(true);
    expect(c.turnOn && c.turnOff).toBe(true);
  });

  it('play/pause: wystarczy PLAY albo PAUSE (jak walidacja usługi w HA)', () => {
    expect(playerCaps(MP_FEATURE.PAUSE).playPause).toBe(true);
    expect(playerCaps(MP_FEATURE.PLAY).playPause).toBe(true);
    expect(playerCaps(MP_FEATURE.NEXT_TRACK).playPause).toBe(false);
  });

  it('PLAY_MEDIA osobno — warunek krótkofalówki', () => {
    expect(playerCaps(MP_FEATURE.PLAY_MEDIA).playMedia).toBe(true);
    expect(playerCaps(MP_FEATURE.PLAY | MP_FEATURE.VOLUME_SET).playMedia).toBe(false);
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
