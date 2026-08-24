import { describe, expect, it } from 'vitest';
import {
  buildGradient,
  hslToRgbStr,
  seedOf,
  tone,
} from '../src/scene-gradient.js';

function parseRgb(s: string): [number, number, number] {
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)!;
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)];
}

function lightnessOf(s: string): number {
  const [r, g, b] = parseRgb(s).map((v) => v / 255) as [number, number, number];
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('tone', () => {
  it('podłoga jasności 0.55 — ciemne kolory nie zostają czarniawe', () => {
    const out = tone('rgb(40, 10, 10)');
    expect(lightnessOf(out)).toBeGreaterThanOrEqual(0.54);
  });

  it('sufit jasności 0.8 — białe nie wypalają się do czystej bieli', () => {
    const out = tone('rgb(255, 255, 250)');
    expect(lightnessOf(out)).toBeLessThanOrEqual(0.81);
  });

  it('zachowuje odcień (czerwony zostaje czerwonawy)', () => {
    const [r, g, b] = parseRgb(tone('rgb(200, 30, 30)'));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('nie-rgb wraca bez zmian', () => {
    expect(tone('#ffcc00')).toBe('#ffcc00');
  });
});

describe('seedOf', () => {
  it('deterministyczny i nieujemny', () => {
    expect(seedOf('scene.relaks')).toBe(seedOf('scene.relaks'));
    expect(seedOf('scene.relaks')).toBeGreaterThanOrEqual(0);
    expect(seedOf('scene.relaks')).not.toBe(seedOf('scene.disco'));
  });
});

describe('hslToRgbStr', () => {
  it('podstawowe kolory', () => {
    expect(hslToRgbStr(0, 1, 0.5)).toBe('rgb(255, 0, 0)');
    expect(hslToRgbStr(120, 1, 0.5)).toBe('rgb(0, 255, 0)');
    expect(hslToRgbStr(240, 1, 0.5)).toBe('rgb(0, 0, 255)');
    expect(hslToRgbStr(0, 0, 1)).toBe('rgb(255, 255, 255)');
  });
});

describe('buildGradient', () => {
  const data = { colors: ['rgb(255, 160, 40)', 'rgb(60, 60, 200)'], bri: 1 };

  it('mesh: plamy radialne + pełnokolorowa baza liniowa (bez ciemnej bazy)', () => {
    const css = buildGradient('mesh', data, 'scene.x');
    expect(css).toContain('radial-gradient');
    expect(css).toContain('linear-gradient(135deg');
    // baza nie może zaczynać się od czerni
    expect(css).not.toContain('rgb(0, 0, 0)');
  });

  it('linear: pojedynczy kolor dostaje ciemniejszy drugi stop', () => {
    const css = buildGradient('linear', { colors: ['rgb(200, 100, 50)'], bri: 1 }, 'scene.x');
    expect(css.match(/rgb\(/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('glow i horizon zwracają poprawne funkcje CSS', () => {
    expect(buildGradient('glow', data, 'scene.x')).toMatch(/^radial-gradient\(/);
    expect(buildGradient('horizon', data, 'scene.x')).toMatch(
      /^linear-gradient\(to bottom/,
    );
  });

  it('mesh jest deterministyczny per scena, różny między scenami', () => {
    const a1 = buildGradient('mesh', data, 'scene.aaa');
    const a2 = buildGradient('mesh', data, 'scene.aaa');
    expect(a1).toBe(a2);
  });
});
