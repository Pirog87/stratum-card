import { describe, expect, it } from 'vitest';
import {
  COVER_WANT_TTL_MS,
  brightnessPct,
  chipRowKind,
  coverServiceForTap,
  coverShownOpen,
  coverShownPos,
  coverStateOpen,
  sliderPct,
} from '../src/chip-list-control.js';
import { entity } from './helpers.js';

describe('chipRowKind', () => {
  it('niedostępna albo bez stanu → offline, niezależnie od domeny', () => {
    expect(chipRowKind('light', entity('light.a', 'unavailable'))).toBe('offline');
    expect(chipRowKind('binary_sensor', entity('binary_sensor.a', 'unavailable'))).toBe(
      'offline',
    );
    expect(chipRowKind('switch', undefined)).toBe('offline');
  });

  it('light/switch/cover → sterowalny, reszta → czujka', () => {
    expect(chipRowKind('light', entity('light.a', 'off'))).toBe('control');
    expect(chipRowKind('cover', entity('cover.a', 'open'))).toBe('control');
    expect(chipRowKind('switch', entity('switch.a', 'unknown'))).toBe('control');
    expect(chipRowKind('binary_sensor', entity('binary_sensor.a', 'on'))).toBe('sensor');
  });
});

describe('roleta jako przełącznik', () => {
  it('otwarta i otwierająca się = włączona; zamykająca się już nie', () => {
    expect(coverStateOpen('open')).toBe(true);
    expect(coverStateOpen('opening')).toBe(true);
    expect(coverStateOpen('closing')).toBe(false);
    expect(coverStateOpen('closed')).toBe(false);
    expect(coverStateOpen('on')).toBe(false);
  });

  it('tap wysyła jawne open/close wg tego, co widać — nie toggle', () => {
    expect(coverServiceForTap(true)).toBe('close_cover');
    expect(coverServiceForTap(false)).toBe('open_cover');
  });

  it('świeży tap przestawia przełącznik od razu, do potwierdzenia z HA', () => {
    const want = { open: false, at: 1000 };
    expect(coverShownOpen('open', want, 1500)).toEqual({ open: false, settled: false });
    // HA zgłosił kierunek — oczekiwanie do zapomnienia.
    expect(coverShownOpen('closing', want, 2000)).toEqual({ open: false, settled: true });
  });

  it('bez potwierdzenia po TTL wraca prawda z HA; niedostępna od razu', () => {
    const want = { open: true, at: 0 };
    expect(coverShownOpen('closed', want, COVER_WANT_TTL_MS + 1)).toEqual({
      open: false,
      settled: true,
    });
    expect(coverShownOpen('unavailable', want, 10).settled).toBe(true);
    expect(coverShownOpen('open', undefined, 0)).toEqual({ open: true, settled: true });
  });
});

describe('coverShownPos — cel suwaka trzymany do dojechania', () => {
  it('w trakcie przeciągania pokazuje palec, nie raport', () => {
    expect(coverShownPos(10, 'open', { pos: 70, at: 0, sent: false }, 50_000)).toEqual({
      pos: 70,
      settled: false,
    });
  });

  it('roleta jedzie: cel zostaje, mimo raportów pośrednich', () => {
    const t = { pos: 70, at: 0, sent: true };
    expect(coverShownPos(9, 'opening', t, 20_000).pos).toBe(70);
    // Pierwsze 3 s po wysłaniu, zanim silnik ruszy.
    expect(coverShownPos(4, 'closed', t, 2000).pos).toBe(70);
  });

  it('dojechała, stoi po 3 s albo minęło 90 s → pozycja z HA', () => {
    const t = { pos: 70, at: 0, sent: true };
    expect(coverShownPos(70, 'open', t, 30_000)).toEqual({ pos: 70, settled: true });
    expect(coverShownPos(4, 'open', t, 3500)).toEqual({ pos: 4, settled: true });
    expect(coverShownPos(40, 'opening', t, 91_000)).toEqual({ pos: 40, settled: true });
  });
});

describe('suwak jasności w wierszu listy', () => {
  it('jasność 0–255 → 1–100 %', () => {
    expect(brightnessPct(255)).toBe(100);
    expect(brightnessPct(128)).toBe(50);
    expect(brightnessPct(1)).toBe(1);
    expect(brightnessPct(undefined)).toBeUndefined();
    expect(brightnessPct('128')).toBeUndefined();
  });

  it('świeci z raportem → wartość prawdziwa (do zapamiętania)', () => {
    expect(sliderPct(true, 128, 20)).toEqual({ pct: 50, live: true });
  });

  it('zgaszona albo zapalanie w toku → ostatnia znana, inaczej 0', () => {
    expect(sliderPct(false, undefined, 35)).toEqual({ pct: 35, live: false });
    expect(sliderPct(true, undefined, 35)).toEqual({ pct: 35, live: false });
    expect(sliderPct(false, undefined, undefined)).toEqual({ pct: 0, live: false });
    // Zgaszona lampa z przeterminowaną jasnością w atrybutach — nie „świeci".
    expect(sliderPct(false, 200, undefined)).toEqual({ pct: 0, live: false });
  });
});
