import { describe, expect, it } from 'vitest';
import {
  commonWords,
  dragIntent,
  needsSections,
  sectionDots,
  sectionsStartCollapsed,
  pctFromX,
  sortModeFor,
  sortRows,
  stripAreaName,
  withoutWords,
} from '../src/chip-list-rows.js';

describe('needsSections', () => {
  it('jedna pozycja na pokój = bez sekcji', () => {
    expect(needsSections(['igor', 'lenka', 'kuchnia'])).toBe(false);
  });
  it('pokój z dwiema pozycjami = sekcje', () => {
    expect(needsSections(['igor', 'lenka', 'igor'])).toBe(true);
  });
});

describe('sectionsStartCollapsed', () => {
  it('jeden pokój nigdy nie startuje zwinięty', () => {
    expect(sectionsStartCollapsed(1, 30)).toBe(false);
  });
  it('krótka lista w kilku pokojach zostaje rozwinięta', () => {
    expect(sectionsStartCollapsed(3, 8)).toBe(false);
  });
  it('długa lista w kilku pokojach startuje zwinięta', () => {
    expect(sectionsStartCollapsed(2, 9)).toBe(true);
    expect(sectionsStartCollapsed(5, 17)).toBe(true);
  });
});

describe('sectionDots', () => {
  it('różne kolory w kolejności wierszy, bez powtórzeń', () => {
    expect(sectionDots(['rgb(1, 2, 3)', 'rgb(1, 2, 3)', 'rgb(9, 9, 9)'])).toEqual([
      'rgb(1, 2, 3)',
      'rgb(9, 9, 9)',
    ]);
  });
  it('najwyżej trzy kropki', () => {
    expect(sectionDots(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
  it('światło bez koloru daje jedną kropkę domyślną', () => {
    expect(sectionDots([undefined, undefined, 'a'])).toEqual([undefined, 'a']);
  });
  it('pusta lista = brak kropek', () => {
    expect(sectionDots([])).toEqual([]);
  });
});

describe('stripAreaName', () => {
  it('wycina nazwę pokoju z początku', () => {
    expect(stripAreaName('Igor żarówka 8', 'Igor')).toBe('żarówka 8');
  });
  it('wycina ze środka i bez wielkości liter', () => {
    expect(stripAreaName('Czujka obecności korytarz piętro schody Zajętość', 'Korytarz piętro')).toBe(
      'Czujka obecności schody Zajętość',
    );
  });
  it('nie tnie fragmentu słowa', () => {
    expect(stripAreaName('Igorek lampka', 'Igor')).toBe('Igorek lampka');
  });
  it('sprząta separator po wycięciu', () => {
    expect(stripAreaName('Kuchnia – blat', 'Kuchnia')).toBe('blat');
  });
  it('sama nazwa pokoju = pusto', () => {
    expect(stripAreaName('Salon', 'Salon')).toBe('');
  });
});

describe('commonWords / withoutWords', () => {
  it('słowa obecne we wszystkich nazwach znikają', () => {
    const names = ['Czujka obecności Zajętość', 'Czujka obecności schody Zajętość'];
    const c = commonWords(names);
    expect(withoutWords(names[0]!, c)).toBe('');
    expect(withoutWords(names[1]!, c)).toBe('schody');
  });
  it('jedna nazwa — nic nie jest wspólne', () => {
    expect(commonWords(['żarówka 1']).size).toBe(0);
  });
  it('różne nazwy zostają', () => {
    const c = commonWords(['żarówka 1', 'żarówka 2', 'plafon']);
    expect(c.size).toBe(0);
  });
});

describe('sortModeFor', () => {
  it('wg typu chipa', () => {
    expect(sortModeFor('motion', false)).toBe('recent');
    expect(sortModeFor('windows', false)).toBe('oldest');
    expect(sortModeFor('battery_low', false)).toBe('level');
    expect(sortModeFor('lights', false)).toBe('name');
    expect(sortModeFor('lights', true)).toBe('severity');
  });
});

describe('sortRows', () => {
  const info: Record<string, { name: string; changed?: number; device_class?: string; level?: number }> = {
    a: { name: 'żarówka 10', changed: 100, device_class: 'problem', level: 40 },
    b: { name: 'żarówka 2', changed: 300, device_class: 'smoke', level: 8 },
    c: { name: 'Plafon', changed: 200, device_class: 'gas', level: 19 },
  };
  const get = (id: string) => info[id]!;
  it('recent: najświeższe na górze', () => {
    expect(sortRows(['a', 'b', 'c'], 'recent', get)).toEqual(['b', 'c', 'a']);
  });
  it('oldest: najdłużej otwarte na górze', () => {
    expect(sortRows(['a', 'b', 'c'], 'oldest', get)).toEqual(['a', 'c', 'b']);
  });
  it('severity: gaz, dym, problem', () => {
    expect(sortRows(['a', 'b', 'c'], 'severity', get)).toEqual(['c', 'b', 'a']);
  });
  it('level: od najniższej baterii', () => {
    expect(sortRows(['a', 'b', 'c'], 'level', get)).toEqual(['b', 'c', 'a']);
  });
  it('name: alfabetycznie z liczbami naturalnie (2 przed 10)', () => {
    expect(sortRows(['a', 'b', 'c'], 'name', get)).toEqual(['c', 'b', 'a']);
  });
});

describe('pctFromX / dragIntent', () => {
  it('pozycja palca na wierszu', () => {
    expect(pctFromX(150, 100, 200)).toBe(25);
    expect(pctFromX(50, 100, 200, 1)).toBe(1);
    expect(pctFromX(400, 100, 200)).toBe(100);
  });
  it('pion = przewijanie, poziom = przeciąganie', () => {
    expect(dragIntent(2, 14)).toBe('scroll');
    expect(dragIntent(9, 3)).toBe('drag');
    expect(dragIntent(3, 3)).toBe('none');
  });
});
