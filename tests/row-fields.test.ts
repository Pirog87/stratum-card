import { describe, expect, it } from 'vitest';
import {
  badgeCap,
  capByPriority,
  rowNarrowLevel,
  singleLineCap,
  topAlarmField,
  withoutBadgeFields,
} from '../src/row-fields.js';
import type { TileField } from '../src/types.js';

describe('capByPriority', () => {
  it('mieści się w limicie: wszystko w kolejności z configu', () => {
    expect(capByPriority(['temperature', 'lights', 'motion'], 4, 4)).toEqual({
      shown: ['temperature', 'lights', 'motion'],
      hiddenCount: 0,
    });
  });

  it('ponad limit wygrywa priorytet, kolejność zostaje z configu', () => {
    const r = capByPriority(['temperature', 'windows', 'motion', 'leak', 'lights'], 3, 4);
    expect(r.shown).toEqual(['motion', 'leak', 'lights']);
    expect(r.hiddenCount).toBe(2);
  });

  it('obniżony limit: włącznik świateł nie znika nigdy', () => {
    const r = capByPriority(['smoke', 'gas', 'lights'], 1, 4);
    expect(r.shown).toEqual(['smoke', 'lights']);
    expect(r.hiddenCount).toBe(1);
  });
});

describe('odznaka alarmu w wierszu (R1)', () => {
  // Zgłoszony przypadek: wyciek w „Łazienka parter" na telefonie 360 px.
  const withValue: TileField[] = ['temperature', 'motion', 'leak', 'lights'];

  it('pola alarmowe znikają, gdy stoi odznaka — odznaka je zastępuje', () => {
    expect(withoutBadgeFields(withValue, true)).toEqual(['temperature', 'motion', 'lights']);
    expect(withoutBadgeFields(withValue, false)).toEqual(withValue);
    expect(withoutBadgeFields(['smoke', 'gas', 'problem', 'doors'], true)).toEqual(['doors']);
  });

  it('odznaka zajmuje slot limitu, ale zostawia miejsce na włącznik', () => {
    expect(badgeCap(4, true)).toBe(3);
    expect(badgeCap(2, true)).toBe(1);
    expect(badgeCap(1, true)).toBe(1);
    expect(badgeCap(2, false)).toBe(2);
  });

  it('wąski wiersz z alarmem: odznaka + włącznik, reszta w „+n" (bez dubla wycieku)', () => {
    const r = capByPriority(withoutBadgeFields(withValue, true), badgeCap(2, true), 4);
    expect(r.shown).toEqual(['lights']);
    expect(r.hiddenCount).toBe(2);
  });

  it('ikona odznaki = najważniejszy aktywny alarm', () => {
    expect(topAlarmField({ leak: 1, problem: 2 })).toBe('leak');
    expect(topAlarmField({ smoke: 1, leak: 3 })).toBe('smoke');
    expect(topAlarmField({ problem: 1 })).toBe('problem');
    expect(topAlarmField({ leak: 0 })).toBeUndefined();
  });
});

describe('poziom ciasnoty wiersza z szerokości', () => {
  it('progi 310 / 360 / 450 px', () => {
    expect(rowNarrowLevel(300)).toEqual({ level: 2, tight: false });
    expect(rowNarrowLevel(310)).toEqual({ level: 2, tight: false });
    expect(rowNarrowLevel(320)).toEqual({ level: 1, tight: false });
    expect(rowNarrowLevel(360)).toEqual({ level: 1, tight: false });
    expect(rowNarrowLevel(390)).toEqual({ level: 0, tight: true });
    expect(rowNarrowLevel(412)).toEqual({ level: 0, tight: true });
    // 413 px: odznaka + 3 pola zostawiały nazwie 94 px — wciąż ciasno.
    expect(rowNarrowLevel(413)).toEqual({ level: 0, tight: true });
    expect(rowNarrowLevel(450)).toEqual({ level: 0, tight: true });
    expect(rowNarrowLevel(451)).toEqual({ level: 0, tight: false });
    expect(rowNarrowLevel(600)).toEqual({ level: 0, tight: false });
    expect(rowNarrowLevel(900)).toEqual({ level: 0, tight: false });
  });

  it('niewymierzony wiersz (0 px) nie jest ciasny', () => {
    expect(rowNarrowLevel(0)).toEqual({ level: 0, tight: false });
  });
});

describe('limit pól w jednej linii (singleLineCap)', () => {
  it('szeroki wiersz z alarmem: pełny limit → odznaka + 3 pola', () => {
    // Zgłoszony przypadek: 900 px, alarm zwijał pola do samego włącznika.
    const cap = singleLineCap('fields', 0, false, true);
    expect(cap).toBeUndefined();
    expect(badgeCap(cap ?? 4, true)).toBe(3);
  });

  it('pasmo 361–450 px z alarmem: o poziom wcześniej (2 → odznaka + 1 pole)', () => {
    expect(singleLineCap('fields', 0, true, true)).toBe(2);
  });

  it('pasmo 361–450 px BEZ alarmu: bez zwijania', () => {
    expect(singleLineCap('fields', 0, true, false)).toBeUndefined();
  });

  it('wąskie poziomy: alarm zwija o poziom, maksymalnie do 1', () => {
    expect(singleLineCap('fields', 1, false, false)).toBe(2);
    expect(singleLineCap('fields', 1, false, true)).toBe(1);
    expect(singleLineCap('fields', 2, false, false)).toBe(1);
    expect(singleLineCap('fields', 2, false, true)).toBe(1);
  });

  it('inne tryby nie reagują na odznakę ani na pasmo 361–450 px', () => {
    expect(singleLineCap('compact', 2, false, true)).toBe(3);
    expect(singleLineCap('compact', 1, false, true)).toBeUndefined();
    expect(singleLineCap('compact', 0, true, true)).toBeUndefined();
    expect(singleLineCap('two-line', 2, false, true)).toBeUndefined();
    expect(singleLineCap('off', 0, true, true)).toBeUndefined();
  });
});
