import { describe, expect, it } from 'vitest';
import {
  interpolate,
  langOf,
  localize,
  lookup,
  messages,
  pickPlural,
  pluralCategory,
  pluralCategoryFallback,
  type MessageKey,
} from '../src/localize/localize.js';
import { pl } from '../src/localize/pl.js';
import { en } from '../src/localize/en.js';
import { editorPl } from '../src/localize/editor-pl.js';
import { editorEn } from '../src/localize/editor-en.js';
import { editorMessages, localizeUi } from '../src/localize/editor-localize.js';

// Słowniki karty i edytorów razem — testy kompletu kluczy obejmują oba.
const PL = { ...pl, editor: editorPl };
const EN = { ...en, editor: editorEn };

/** Klucze liści (napis albo komplet form liczby mnogiej). */
const leafKeys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null && !('one' in v)
      ? leafKeys(v as object, `${p}${k}.`)
      : [`${p}${k}`],
  );

describe('langOf', () => {
  it('polski jest bazą: brak języka i pl-* → pl', () => {
    expect(langOf(undefined)).toBe('pl');
    expect(langOf(null)).toBe('pl');
    expect(langOf('')).toBe('pl');
    expect(langOf('pl')).toBe('pl');
    expect(langOf('pl-PL')).toBe('pl');
    expect(langOf('PL')).toBe('pl');
  });

  it('każdy inny język → angielski', () => {
    expect(langOf('en')).toBe('en');
    expect(langOf('en-GB')).toBe('en');
    expect(langOf('de')).toBe('en');
    expect(langOf('uk')).toBe('en');
  });

  it('hass: locale.language wygrywa nad language', () => {
    expect(langOf({ language: 'pl' })).toBe('pl');
    expect(langOf({ language: 'en' })).toBe('en');
    expect(langOf({ language: 'pl', locale: { language: 'de' } })).toBe('en');
    expect(langOf({ language: 'en', locale: { language: 'pl' } })).toBe('pl');
    expect(langOf({ language: 'en', locale: {} })).toBe('en');
  });
});

describe('liczba mnoga', () => {
  const plCases: Array<[number, string]> = [
    [0, 'many'],
    [1, 'one'],
    [2, 'few'],
    [3, 'few'],
    [4, 'few'],
    [5, 'many'],
    [11, 'many'],
    [12, 'many'],
    [13, 'many'],
    [14, 'many'],
    [21, 'many'],
    [22, 'few'],
    [24, 'few'],
    [25, 'many'],
    [101, 'many'],
    [102, 'few'],
    [112, 'many'],
    [122, 'few'],
  ];

  it('reguła awaryjna PL: one / few (2–4, nie 12–14) / many', () => {
    for (const [n, cat] of plCases) expect(pluralCategoryFallback('pl', n), String(n)).toBe(cat);
  });

  it('Intl i reguła awaryjna zgadzają się dla liczb całkowitych', () => {
    for (const [n] of plCases) {
      expect(pluralCategory('pl', n), `pl ${n}`).toBe(pluralCategoryFallback('pl', n));
      expect(pluralCategory('en', n), `en ${n}`).toBe(pluralCategoryFallback('en', n));
    }
  });

  it('reguła awaryjna EN: one / other', () => {
    expect(pluralCategoryFallback('en', 1)).toBe('one');
    expect(pluralCategoryFallback('en', 0)).toBe('other');
    expect(pluralCategoryFallback('en', 2)).toBe('other');
    expect(pluralCategoryFallback('en', 1.5)).toBe('other');
  });

  it('brakująca forma spada na other → many → one', () => {
    expect(pickPlural('pl', { one: 'a', many: 'm' }, 1.5)).toBe('m');
    expect(pickPlural('pl', { one: 'a' }, 3)).toBe('a');
    expect(pickPlural('en', { one: 'a', other: 'o' }, 7)).toBe('o');
  });

  it('licznik listy chipa — poprawne polskie formy (R8)', () => {
    expect(localize('pl', 'chip_list.items', { count: 1 })).toBe('1 pozycja');
    expect(localize('pl', 'chip_list.items', { count: 3 })).toBe('3 pozycje');
    expect(localize('pl', 'chip_list.items', { count: 12 })).toBe('12 pozycji');
    expect(localize('pl', 'chip_list.items', { count: 22 })).toBe('22 pozycje');
    expect(localize('pl', 'chip_list.items', { count: 60 })).toBe('60 pozycji');
    expect(localize('pl', 'chip_list.rooms', { count: 1 })).toBe('1 pokój');
    expect(localize('pl', 'chip_list.rooms', { count: 2 })).toBe('2 pokoje');
    expect(localize('pl', 'chip_list.rooms', { count: 9 })).toBe('9 pokoi');
    expect(localize('pl', 'chip_list.rooms', { count: 14 })).toBe('14 pokoi');
  });

  it('angielski: one / other', () => {
    expect(localize('en', 'chip_list.items', { count: 1 })).toBe('1 item');
    expect(localize('en', 'chip_list.items', { count: 3 })).toBe('3 items');
    expect(localize('de', 'chip_list.rooms', { count: 0 })).toBe('0 rooms');
  });
});

describe('localize', () => {
  it('wybiera słownik po języku', () => {
    expect(localize('pl', 'common.close')).toBe('Zamknij');
    expect(localize({ language: 'en' }, 'common.close')).toBe('Close');
    expect(localize(undefined, 'common.close')).toBe('Zamknij');
  });

  it('podstawia parametry', () => {
    expect(localize('pl', 'common.alarms_aria', { count: 2 })).toBe(
      'Aktywne alarmy: 2. Pokaż listę',
    );
    expect(localize('en', 'common.entity_details_named', { name: 'Lamp' })).toBe(
      'Entity details: Lamp',
    );
  });

  it('nieznany klucz → sam klucz, bez wyjątku', () => {
    expect(localize('pl', 'nie.ma.takiego' as MessageKey)).toBe('nie.ma.takiego');
    expect(localize('en', 'common.constructor' as MessageKey)).toBe('common.constructor');
    expect(localize('en', 'common' as MessageKey)).toBe('common');
  });

  it('interpolate zostawia nieznane klucze i nie sięga do prototypu', () => {
    expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
    expect(interpolate('{toString}', {})).toBe('{toString}');
  });

  it('lookup po kluczu z danych', () => {
    expect(lookup(messages('pl').chip_list.titles, 'lights')).toBe('Włączone światła');
    expect(lookup(messages('en').chip_list.titles, 'lights')).toBe('Lights on');
    expect(lookup(messages('en').chip_list.titles, 'constructor')).toBeUndefined();
    expect(lookup(messages('en').chip_list.titles, undefined)).toBeUndefined();
  });
});

describe('słowniki', () => {
  it('EN ma dokładnie te same klucze co PL', () => {
    expect(leafKeys(EN).sort()).toEqual(leafKeys(PL).sort());
  });

  it('żaden tekst nie jest pusty', () => {
    const walk = (o: object, p = ''): void => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string') expect(v.trim(), `${p}${k}`).not.toBe('');
        else walk(v as object, `${p}${k}.`);
      }
    };
    walk(PL);
    walk(EN);
  });

  it('formy liczby mnogiej: PL ma one/few/many, EN one/other', () => {
    const plurals = (o: object, p = ''): Array<[string, Record<string, string>]> =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v !== 'object' || v === null
          ? []
          : 'one' in v
          ? [[`${p}${k}`, v as Record<string, string>] as [string, Record<string, string>]]
          : plurals(v as object, `${p}${k}.`),
      );
    for (const [k, forms] of plurals(PL)) expect(Object.keys(forms).sort(), k).toEqual(['few', 'many', 'one']);
    for (const [k, forms] of plurals(EN)) expect(Object.keys(forms).sort(), k).toEqual(['one', 'other']);
  });

  it('parametry {x} są te same w obu językach', () => {
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    const flat = (o: object, p = ''): Array<[string, string]> =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'string'
          ? [[`${p}${k}`, v] as [string, string]]
          : flat(v as object, `${p}${k}.`),
      );
    const enMap = new Map(flat(EN));
    for (const [k, v] of flat(PL)) {
      const other = enMap.get(k.replace(/\.(few|many)$/, '.other'));
      if (other === undefined) continue;
      expect(params(other), k).toEqual(params(v));
    }
  });
});

describe('słowniki edytorów (osobne wejście)', () => {
  it('runtime karty nie zawiera napisów edytora', () => {
    expect('editor' in pl).toBe(false);
    expect('editor' in en).toBe(false);
  });

  it('localizeUi: klucze editor.* ze słownika edytora, reszta z karty', () => {
    expect(localizeUi('pl', 'editor.common.clear_color')).toBe(editorPl.common.clear_color);
    expect(localizeUi('en', 'editor.common.clear_color')).toBe(editorEn.common.clear_color);
    expect(localizeUi('en', 'common.close')).toBe(localize('en', 'common.close'));
    expect(localizeUi('de', 'editor.common.clear_color')).toBe(editorEn.common.clear_color);
  });

  it('nieznany klucz edytora → sam klucz, bez wyjątku', () => {
    expect(localizeUi('en', 'editor.nope.nope' as never)).toBe('editor.nope.nope');
  });

  it('editorMessages wybiera słownik po języku', () => {
    expect(editorMessages('pl')).toBe(editorPl);
    expect(editorMessages({ language: 'en' })).toBe(editorEn);
  });
});
