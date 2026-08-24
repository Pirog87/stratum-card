import { describe, expect, it } from 'vitest';
import { lightColorOf } from '../src/tile-data.js';
import { resolveColor } from '../src/colors.js';
import { ago } from '../src/chip-defaults.js';
import { afterEach, beforeEach, vi } from 'vitest';

describe('lightColorOf', () => {
  it('zgaszone / brak stanu → undefined', () => {
    expect(lightColorOf(undefined)).toBeUndefined();
    expect(lightColorOf({ state: 'off', attributes: {} })).toBeUndefined();
  });

  it('color_temp wygrywa nad stęchłym rgb_color (bug CT-żarówek)', () => {
    // Żarówka w trybie CT trzyma stary rgb_color z trybu koloru —
    // liczy się color_mode, nie sama obecność rgb_color.
    const color = lightColorOf({
      state: 'on',
      attributes: {
        color_mode: 'color_temp',
        color_temp_kelvin: 2700,
        rgb_color: [255, 0, 0],
      },
    })!;
    expect(color).not.toBe('rgb(255, 0, 0)');
    const m = color.match(/rgb\((\d+), (\d+), (\d+)\)/)!;
    const [r, g, b] = [+m[1]!, +m[2]!, +m[3]!];
    // 2700K = ciepła biel: r > g > b
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('tryb kolorowy → rgb_color wprost', () => {
    expect(
      lightColorOf({
        state: 'on',
        attributes: { color_mode: 'hs', rgb_color: [10, 200, 30] },
      }),
    ).toBe('rgb(10, 200, 30)');
  });

  it('sam kelvin bez color_mode też daje kolor', () => {
    expect(
      lightColorOf({ state: 'on', attributes: { color_temp_kelvin: 6500 } }),
    ).toMatch(/^rgb\(/);
  });
});

describe('resolveColor', () => {
  it('przepuszcza #hex, rgb(), var()', () => {
    expect(resolveColor('#ffcc00')).toBe('#ffcc00');
    expect(resolveColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(resolveColor('var(--primary-color)')).toBe('var(--primary-color)');
  });

  it('puste → undefined', () => {
    expect(resolveColor(undefined)).toBeUndefined();
    expect(resolveColor('')).toBeUndefined();
  });
});

describe('ago', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('formatuje sekundy/minuty/godziny/dni jak mushroom', () => {
    expect(ago('2026-08-24T11:59:44Z')).toBe('16s');
    expect(ago('2026-08-24T11:56:00Z')).toBe('4min');
    expect(ago('2026-08-24T10:00:00Z')).toBe('2h');
    expect(ago('2026-08-21T12:00:00Z')).toBe('3d');
  });

  it('przyszłość nie daje ujemnych wartości', () => {
    expect(ago('2026-08-24T12:00:30Z')).toBe('0s');
  });
});

describe('appBrandGradient', () => {
  it('rozpoznaje popularne aplikacje niezależnie od wielkości liter', async () => {
    const { appBrandGradient } = await import('../src/media-brands.js');
    expect(appBrandGradient('Netflix')).toContain('#b20710');
    expect(appBrandGradient('Disney+')).toContain('#1a3ccc');
    expect(appBrandGradient('Prime Video')).toContain('#0f79af');
    expect(appBrandGradient('com.spotify.music')).toContain('#169c46');
  });

  it('nieznana aplikacja / brak → undefined', async () => {
    const { appBrandGradient } = await import('../src/media-brands.js');
    expect(appBrandGradient('Kodi')).toBeUndefined();
    expect(appBrandGradient(undefined)).toBeUndefined();
  });
});
