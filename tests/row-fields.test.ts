import { describe, expect, it } from 'vitest';
import {
  badgeCap,
  capByPriority,
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
