import { describe, expect, it } from 'vitest';
import {
  composite,
  contrastRatio,
  inkForFill,
  mixRgb,
  parseCssColor,
  type Rgb,
  type Rgba,
} from '../src/ink-contrast.js';

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
// Powierzchnia kafla: surface-1 = tło 96% + tekst (jasny motyw HA: #fff/#212121,
// ciemny: #1c1c1c/#e1e1e1).
const LIGHT_SURFACE = mixRgb(WHITE, 96, [33, 33, 33]);
const DARK_SURFACE = mixRgb([28, 28, 28], 96, [225, 225, 225]);

/** Atramenty tak, jak liczy je CSS kafla (12% / 20% akcentu). */
function pick(accent: Rgb, surface: Rgb): 'light' | 'dark' {
  const fill: Rgba = [...accent, 0.8];
  return inkForFill(fill, surface, mixRgb(accent, 12, WHITE), mixRgb(accent, 20, BLACK));
}

function inkContrast(accent: Rgb, surface: Rgb): number {
  const ink = pick(accent, surface) === 'light' ? mixRgb(accent, 12, WHITE) : mixRgb(accent, 20, BLACK);
  return contrastRatio(ink, composite([...accent, 0.8], surface));
}

describe('parseCssColor', () => {
  it('czyta zapisy z getComputedStyle i z tokenów', () => {
    expect(parseCssColor('rgb(255, 80, 80)')).toEqual([255, 80, 80, 1]);
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5]);
    expect(parseCssColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseCssColor(' #3f51b5 ')).toEqual([63, 81, 181, 1]);
    const c = parseCssColor('color(srgb 1 0.756863 0.027451 / 0.8)')!;
    expect(c.map(Math.round)).toEqual([255, 193, 7, 1]);
    expect(c[3]).toBeCloseTo(0.8);
    // oklab w trakcie tranzycji — biel to L=1, a=b=0
    expect(parseCssColor('oklab(1 0 0)')!.map(Math.round)).toEqual([255, 255, 255, 1]);
  });

  it('nieznany zapis → undefined', () => {
    expect(parseCssColor('')).toBeUndefined();
    expect(parseCssColor(undefined)).toBeUndefined();
    expect(parseCssColor('var(--x)')).toBeUndefined();
    expect(parseCssColor('lab(50 20 20)')).toBeUndefined();
  });
});

describe('inkForFill', () => {
  it('czerwień, róż i magenta na JASNYM motywie dostają ciemny napis', () => {
    // Regresja: stripeInk na surowym kolorze dawał biały napis, 2,3–3,0:1.
    for (const accent of [[255, 80, 80], [255, 0, 160], [255, 0, 0]] as Rgb[]) {
      expect(pick(accent, LIGHT_SURFACE)).toBe('dark');
      expect(inkContrast(accent, LIGHT_SURFACE)).toBeGreaterThan(4.5);
    }
  });

  it('ciemny token świateł bez rgb (granat, fiolet) na ciemnym motywie → jasny napis', () => {
    // Regresja: bez koloru żarówki zakładaliśmy żółty i ciemny napis (2,3:1).
    for (const accent of [[63, 81, 181], [156, 39, 176]] as Rgb[]) {
      expect(pick(accent, DARK_SURFACE)).toBe('light');
      expect(inkContrast(accent, DARK_SURFACE)).toBeGreaterThan(4.5);
    }
  });

  it('żółty domyślny zostaje przy ciemnym napisie w obu motywach', () => {
    expect(pick([255, 193, 7], LIGHT_SURFACE)).toBe('dark');
    expect(pick([255, 193, 7], DARK_SURFACE)).toBe('dark');
  });

  it('zawsze wybiera wyższy z dwóch kontrastów', () => {
    for (const accent of [[0, 60, 255], [160, 0, 255], [0, 200, 120], [120, 120, 120]] as Rgb[]) {
      for (const surface of [LIGHT_SURFACE, DARK_SURFACE]) {
        const fill: Rgba = [...accent, 0.8];
        const light = mixRgb(accent, 12, WHITE);
        const dark = mixRgb(accent, 20, BLACK);
        const bg = composite(fill, surface);
        const best = Math.max(contrastRatio(light, bg), contrastRatio(dark, bg));
        const chosen = inkForFill(fill, surface, light, dark) === 'light' ? light : dark;
        expect(contrastRatio(chosen, bg)).toBe(best);
      }
    }
  });
});
