import { describe, expect, it } from 'vitest';
import { AMBIENT_FALLBACK_COLOR, ambientPct, ambientStyle } from '../src/tile-ambient.js';
import { lightColorOf } from '../src/tile-data.js';

// Regres: doklejanie alfy w hexie do `rgb(...)` dawało `rgb(255, 120, 40)94`
// — niepoprawny CSS, tło kafla nie działało dla żadnej żarówki z kolorem.
const BROKEN_ALPHA = /\)[0-9a-f]{2}\b/i;

describe('ambientStyle', () => {
  it('żarówka RGB: tylko zmienne, bez doklejonej alfy', () => {
    const color = lightColorOf({
      state: 'on',
      attributes: { color_mode: 'rgb', rgb_color: [255, 120, 40], brightness: 200 },
    });
    const s = ambientStyle(true, color, 78);
    expect(s).toBe('--stratum-ambient-color:rgb(255, 120, 40);--stratum-ambient-pct:58%;');
    expect(s).not.toMatch(BROKEN_ALPHA);
    expect(s).not.toContain('background');
  });

  it('żarówka CT (kelvin): kolor rgb() z temperatury', () => {
    const color = lightColorOf({
      state: 'on',
      attributes: { color_mode: 'color_temp', color_temp_kelvin: 2700 },
    });
    const s = ambientStyle(true, color, 50);
    expect(s).toMatch(/^--stratum-ambient-color:rgb\(\d+, \d+, \d+\);--stratum-ambient-pct:43%;$/);
    expect(s).not.toMatch(BROKEN_ALPHA);
  });

  it('bez koloru: token świateł, nie hex', () => {
    const s = ambientStyle(true, undefined, 100);
    expect(s).toContain(`--stratum-ambient-color:${AMBIENT_FALLBACK_COLOR};`);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('zgaszone: pusty styl (tło z CSS kafla)', () => {
    expect(ambientStyle(false, 'rgb(1, 2, 3)', 80)).toBe('');
  });
});

describe('ambientPct', () => {
  it('krzywa 15–70% wg jasności, przycięta do 0–100', () => {
    expect(ambientPct(true, 0)).toBe(15);
    expect(ambientPct(true, 100)).toBe(70);
    expect(ambientPct(true, 150)).toBe(70);
    expect(ambientPct(true, -5)).toBe(15);
    expect(ambientPct(false, 80)).toBe(0);
  });
});
