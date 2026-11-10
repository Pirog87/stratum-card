import { describe, expect, it } from 'vitest';
import {
  averageLightColor,
  buildHeaderStripes,
  clampStripesMax,
  stripeInk,
  type StripeRoom,
} from '../src/header-stripes.js';

const room = (name: string, lightsOn: number, color?: string): StripeRoom => ({
  area_id: name.toLowerCase(),
  name,
  lightsOn,
  color,
});

describe('clampStripesMax', () => {
  it('brak / śmieci → domyślne 3', () => {
    expect(clampStripesMax(undefined)).toBe(3);
    expect(clampStripesMax(Number.NaN)).toBe(3);
  });

  it('trzyma zakres 1–4', () => {
    expect(clampStripesMax(0)).toBe(1);
    expect(clampStripesMax(9)).toBe(4);
    expect(clampStripesMax(2)).toBe(2);
  });
});

describe('buildHeaderStripes', () => {
  it('pomija pokoje bez światła i trzyma kolejność z karty', () => {
    const stripes = buildHeaderStripes(
      [room('Kuchnia', 2), room('Jadalnia', 0), room('Salon', 1)],
      3,
    );
    expect(stripes.map((s) => s.label)).toEqual(['Kuchnia', 'Salon']);
    expect(stripes.every((s) => s.kind === 'room')).toBe(true);
  });

  it('nic nie świeci → brak pasków', () => {
    expect(buildHeaderStripes([room('Taras', 0)], 3)).toEqual([]);
  });

  it('dokładnie tyle pokoi co limit → same nazwy, bez „+N"', () => {
    const stripes = buildHeaderStripes(
      [room('Lenka', 3), room('Igor', 2), room('Biuro', 1)],
      3,
    );
    expect(stripes.map((s) => s.label)).toEqual(['Lenka', 'Igor', 'Biuro']);
  });

  it('więcej pokoi niż limit → ostatni pasek to „+N" z resztą', () => {
    const stripes = buildHeaderStripes(
      [
        room('Lenka', 3),
        room('Igor', 2),
        room('Sypialnia', 4),
        room('Korytarz', 2),
        room('Pralnia', 1),
        room('Biuro', 1),
      ],
      3,
    );
    expect(stripes.map((s) => s.label)).toEqual(['Lenka', 'Igor', '+4']);
    expect(stripes[2]).toEqual({ kind: 'more', label: '+4' });
  });

  it('pasek pokoju niesie area_id i kolor światła', () => {
    const [stripe] = buildHeaderStripes(
      [room('Lenka', 1, 'rgb(183, 156, 255)')],
      3,
    );
    expect(stripe).toEqual({
      kind: 'room',
      area_id: 'lenka',
      label: 'Lenka',
      color: 'rgb(183, 156, 255)',
    });
  });

  it('limit 1 przy kilku pokojach → sam pasek „+N"', () => {
    const stripes = buildHeaderStripes([room('A', 1), room('B', 1)], 1);
    expect(stripes).toEqual([{ kind: 'more', label: '+2' }]);
  });
});

describe('stripeInk', () => {
  it('brak koloru / nieparsowalny → ciemny napis', () => {
    expect(stripeInk(undefined)).toBe('dark');
    expect(stripeInk('var(--primary-color)')).toBe('dark');
  });

  it('jasne tła (ciepła biel, złoty, chłodna biel) → ciemny napis', () => {
    expect(stripeInk('rgb(255, 241, 214)')).toBe('dark');
    expect(stripeInk('rgb(255, 209, 102)')).toBe('dark');
    expect(stripeInk('rgb(207, 227, 255)')).toBe('dark');
  });

  it('ciemne, nasycone tła (granat, głęboka czerwień) → jasny napis', () => {
    expect(stripeInk('rgb(0, 0, 255)')).toBe('light');
    expect(stripeInk('rgb(160, 0, 20)')).toBe('light');
  });
});

describe('averageLightColor', () => {
  it('średnia kanałów po świecących pokojach z kolorem', () => {
    expect(
      averageLightColor([
        room('A', 1, 'rgb(200, 100, 0)'),
        room('B', 3, 'rgb(100, 200, 50)'),
      ]),
    ).toBe('rgb(150, 150, 25)');
  });

  it('pokój liczy się raz, bez względu na liczbę świateł', () => {
    const one = averageLightColor([
      room('A', 1, 'rgb(255, 0, 0)'),
      room('B', 1, 'rgb(0, 0, 255)'),
    ]);
    const many = averageLightColor([
      room('A', 9, 'rgb(255, 0, 0)'),
      room('B', 1, 'rgb(0, 0, 255)'),
    ]);
    expect(many).toBe(one);
  });

  it('pomija zgaszone pokoje i pokoje bez koloru', () => {
    expect(
      averageLightColor([
        room('A', 0, 'rgb(0, 0, 255)'),
        room('B', 2),
        room('C', 1, 'rgb(255, 200, 100)'),
      ]),
    ).toBe('rgb(255, 200, 100)');
  });

  it('żaden świecący pokój nie zna koloru → undefined', () => {
    expect(averageLightColor([room('A', 2), room('B', 0)])).toBeUndefined();
  });
});
