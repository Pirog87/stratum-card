import { describe, expect, it } from 'vitest';
import { lightsSwitchGlowStyle } from '../src/lights-switch-glow.js';

describe('lightsSwitchGlowStyle', () => {
  it('stan on, pełna intensywność — trzy warstwy jak dawne rgba', () => {
    expect(lightsSwitchGlowStyle(true, 100, 30)).toBe('--lt-g1:95%;--lt-g2:60%;--lt-g3:25%');
  });

  it('stan off bierze własną intensywność i dwie warstwy', () => {
    expect(lightsSwitchGlowStyle(false, 100, 100)).toBe('--lt-g1:65%;--lt-g2:35%');
    expect(lightsSwitchGlowStyle(false, 100, 30)).toBe('--lt-g1:20%;--lt-g2:11%');
  });

  it('intensywność skalowana i przycinana do 0–100', () => {
    expect(lightsSwitchGlowStyle(true, 65, 0)).toBe('--lt-g1:62%;--lt-g2:39%;--lt-g3:16%');
    expect(lightsSwitchGlowStyle(true, 250, 0)).toBe('--lt-g1:95%;--lt-g2:60%;--lt-g3:25%');
  });

  it('zero, wartość ujemna albo NaN — bez poświaty', () => {
    expect(lightsSwitchGlowStyle(true, 0, 30)).toBe('');
    expect(lightsSwitchGlowStyle(false, 100, -5)).toBe('');
    expect(lightsSwitchGlowStyle(true, Number.NaN, 30)).toBe('');
  });

  it('bez literałów kolorów — kolor zostaje w CSS', () => {
    expect(lightsSwitchGlowStyle(true, 100, 100)).not.toMatch(/rgba?|#/);
  });
});
