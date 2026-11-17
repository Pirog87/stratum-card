import { describe, expect, it } from 'vitest';
import { GLIGHT_KEY_STEP, glightKeyLevel } from '../src/glight-keys.js';

describe('glightKeyLevel', () => {
  it('→ / ← o krok, wskakując na siatkę kroku', () => {
    expect(glightKeyLevel(38, 'ArrowRight')).toBe(40);
    expect(glightKeyLevel(40, 'ArrowRight')).toBe(50);
    expect(glightKeyLevel(38, 'ArrowLeft')).toBe(30);
    expect(glightKeyLevel(40, 'ArrowLeft')).toBe(30);
  });

  it('przycina do 0–100', () => {
    expect(glightKeyLevel(100, 'ArrowRight')).toBe(100);
    expect(glightKeyLevel(95, 'ArrowRight')).toBe(100);
    expect(glightKeyLevel(0, 'ArrowLeft')).toBe(0);
    expect(glightKeyLevel(4, 'ArrowLeft')).toBe(0);
  });

  it('z ciemności pierwsza strzałka w prawo daje jeden krok', () => {
    expect(glightKeyLevel(0, 'ArrowRight')).toBe(GLIGHT_KEY_STEP);
  });

  it('inne klawisze (w tym ↑/↓ — przewijanie popupu) nie są nasze', () => {
    expect(glightKeyLevel(50, 'ArrowUp')).toBeUndefined();
    expect(glightKeyLevel(50, 'ArrowDown')).toBeUndefined();
    expect(glightKeyLevel(50, 'Enter')).toBeUndefined();
  });

  it('wartość spoza zakresu / NaN nie psuje wyniku', () => {
    expect(glightKeyLevel(Number.NaN, 'ArrowRight')).toBe(10);
    expect(glightKeyLevel(140, 'ArrowLeft')).toBe(90);
  });
});
