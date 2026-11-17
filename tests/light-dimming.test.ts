import { describe, expect, it } from 'vitest';
import {
  expandLightIds,
  isDimmable,
  liveIntervalMs,
  meanLevel,
  onLights,
  planWave,
  roomLevel,
  roomLevelFromHass,
  scaleTargets,
  viewOf,
} from '../src/light-dimming.js';
import { entity, makeHass } from './helpers.js';

const dim = (id: string, brightness: number) =>
  entity(id, 'on', { brightness, supported_color_modes: ['brightness'] });
const relay = (id: string, state = 'on') =>
  entity(id, state, { supported_color_modes: ['onoff'] });
const off = (id: string) => entity(id, 'off', { supported_color_modes: ['brightness'] });

describe('scaleTargets — proporcjonalne ściemnianie', () => {
  it('pozycja startowa zwraca dokładnie wartości startowe', () => {
    for (const bases of [[255, 51], [204, 102, 51], [1, 2, 255], [128], [3, 3, 3]]) {
      expect(scaleTargets(bases, meanLevel(bases))).toEqual(bases);
    }
  });

  it('w dół zachowuje proporcje między żarówkami', () => {
    // 100% i 20% (średnia 60) → suwak na 33.
    expect(scaleTargets([255, 51], 33)).toEqual([140, 28]);
    const [a, b, c] = scaleTargets([204, 102, 51], 20);
    expect(a! / b!).toBeCloseTo(2, 1);
    expect(b! / c!).toBeCloseTo(2, 1);
  });

  it('w górę nasyca najjaśniejsze, reszta rośnie dalej (średnia = palec)', () => {
    expect(scaleTargets([255, 51], 80)).toEqual([255, 153]);
    expect(scaleTargets([204, 102, 51], 72)).toEqual([255, 197, 99]);
    expect(scaleTargets([204, 102, 51], 88)).toEqual([255, 255, 163]);
  });

  it('100% = wszystko na pełnej jasności', () => {
    expect(scaleTargets([255, 51], 100)).toEqual([255, 255]);
    expect(scaleTargets([10, 20, 30, 40], 100)).toEqual([255, 255, 255, 255]);
  });

  it('średnia celów równa się pozycji suwaka (pasek nie ma dokąd odskoczyć)', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 400; i++) {
      const n = 1 + Math.floor(rnd() * 24);
      const bases = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 255));
      const t = 4 + rnd() * 96;
      const level = meanLevel(scaleTargets(bases, t));
      expect(Math.abs(level - t)).toBeLessThan(0.7);
    }
  });

  it('cele nie maleją, gdy suwak rośnie', () => {
    const bases = [255, 180, 90, 40, 5];
    let prev = scaleTargets(bases, 0);
    for (let t = 1; t <= 100; t++) {
      const cur = scaleTargets(bases, t);
      cur.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev[i]!));
      prev = cur;
    }
  });

  it('jedna żarówka = zwykły suwak absolutny', () => {
    expect(scaleTargets([128], 50)).toEqual([128]);
    expect(scaleTargets([128], 25)).toEqual([64]);
    expect(scaleTargets([40], 100)).toEqual([255]);
  });

  it('podłoga 1% — ale słabszej żarówki nie podbija', () => {
    expect(scaleTargets([255, 51], 2.5)).toEqual([11, 3]);
    // Żarówka już na 2/255 zostaje na 2, nie rośnie do 3 przy ściemnianiu.
    expect(scaleTargets([2, 255], 25)).toEqual([2, 127]);
  });

  it('powrót w tym samym geście jest odwracalny', () => {
    const bases = [255, 51, 120];
    const start = meanLevel(bases);
    scaleTargets(bases, 100);
    scaleTargets(bases, 3);
    expect(scaleTargets(bases, start)).toEqual(bases);
  });

  it('pusty zbiór i wartości spoza zakresu', () => {
    expect(scaleTargets([], 50)).toEqual([]);
    expect(scaleTargets([100], 150)).toEqual([255]);
    expect(scaleTargets([100], -20)).toEqual([3]);
  });
});

describe('planWave — fala komend', () => {
  const lights = [
    { id: 'light.a', base: 255 },
    { id: 'light.b', base: 51 },
    { id: 'light.c', base: 51 },
  ];

  it('jedno wywołanie na każdą różną jasność, od najjaśniejszych', () => {
    const calls = planWave(lights, 20, new Map(), 2);
    expect(calls).toEqual([
      { brightness: 109, ids: ['light.a'] },
      { brightness: 22, ids: ['light.b', 'light.c'] },
    ]);
  });

  it('powrót do pozycji startowej nie wysyła nic', () => {
    const level = meanLevel(lights.map((l) => l.base));
    expect(planWave(lights, level, new Map(), 2)).toEqual([]);
  });

  it('nasycona żarówka wypada z fali', () => {
    // Suwak w górę: a jest już na 255 — komenda tylko dla b i c.
    const calls = planWave(lights, 70, new Map(), 2);
    expect(calls.flatMap((c) => c.ids)).toEqual(['light.b', 'light.c']);
  });

  it('pomija zmiany mniejsze niż próg względem ostatnio wysłanej wartości', () => {
    const sent = new Map([
      ['light.a', 110],
      ['light.b', 22],
      ['light.c', 22],
    ]);
    expect(planWave(lights, 20, sent, 4)).toEqual([]);
    // …ale wysyła, gdy od ostatniej komendy coś realnie się zmieniło.
    expect(planWave(lights, 30, sent, 4).length).toBeGreaterThan(0);
  });

  it('kuchnia: 23 światła w trzech poziomach = trzy wywołania', () => {
    const kitchen = [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `light.k${i}`, base: 153 })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `light.f${i}`, base: 255 })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `light.d${i}`, base: 64 })),
    ];
    const calls = planWave(kitchen, 30, new Map(), 2);
    expect(calls.map((c) => c.ids.length)).toEqual([3, 18, 2]);
    expect(calls.reduce((n, c) => n + c.ids.length, 0)).toBe(23);
  });
});

describe('zestaw świecących i poziom pokoju', () => {
  it('ściemnialność: tryby inne niż onoff, a bez listy trybów — po jasności', () => {
    expect(isDimmable(dim('light.a', 100))).toBe(true);
    expect(isDimmable(relay('light.r'))).toBe(false);
    expect(isDimmable(entity('light.x', 'on', { supported_color_modes: ['color_temp', 'xy'] }))).toBe(true);
    expect(isDimmable(entity('light.stare', 'on', { brightness: 80 }))).toBe(true);
    expect(isDimmable(entity('light.stare2', 'on', {}))).toBe(false);
    expect(isDimmable(undefined)).toBe(false);
  });

  it('zgaszone i niedostępne nie wchodzą do gestu', () => {
    const hass = makeHass({
      'light.a': dim('light.a', 255),
      'light.b': off('light.b'),
      'light.c': entity('light.c', 'unavailable', {}),
      'light.r': relay('light.r'),
    });
    const lit = onLights(['light.a', 'light.b', 'light.c', 'light.r', 'light.nie_ma'], (id) => viewOf(hass.states[id]));
    expect(lit.scaled).toEqual([{ id: 'light.a', base: 255 }]);
    expect(lit.switchOnly).toEqual(['light.r']);
  });

  it('ściemnialne z nieznaną jasnością traktujemy jak przekaźnik', () => {
    const hass = makeHass({
      'light.a': entity('light.a', 'on', { supported_color_modes: ['brightness'], brightness: null }),
    });
    const lit = onLights(['light.a'], (id) => viewOf(hass.states[id]));
    expect(lit).toEqual({ scaled: [], switchOnly: ['light.a'], dimmableTotal: 1 });
  });

  it('przekaźniki nie zawyżają poziomu, gdy świeci coś ściemnialnego', () => {
    // Jedna żarówka na 26/255 + przekaźnik: 10%, nie 55% jak dawniej.
    const lit = { scaled: [{ id: 'light.a', base: 26 }], switchOnly: ['light.r'], dimmableTotal: 1 };
    expect(roomLevel(lit)!).toBeCloseTo(10.2, 1);
  });

  it('pokój z samymi przekaźnikami = 100; nic nie świeci = undefined', () => {
    expect(roomLevel({ scaled: [], switchOnly: ['light.r'], dimmableTotal: 0 })).toBe(100);
    expect(roomLevel({ scaled: [], switchOnly: [], dimmableTotal: 0 })).toBeUndefined();
  });

  it('dioda AP / przekaźnik przy zgaszonych żarówkach = ciemny pokój, nie 100%', () => {
    expect(roomLevel({ scaled: [], switchOnly: ['light.ap_led'], dimmableTotal: 11 })).toBeUndefined();
  });

  it('poziom z hass liczy się po członkach grupy, nie po grupie', () => {
    const hass = makeHass({
      'light.grupa': entity('light.grupa', 'on', {
        entity_id: ['light.a', 'light.b', 'light.c'],
        brightness: 153,
        supported_color_modes: ['brightness'],
      }),
      'light.a': dim('light.a', 255),
      'light.b': dim('light.b', 51),
      'light.c': off('light.c'),
    });
    expect(roomLevelFromHass(hass, ['light.grupa'])!).toBeCloseTo(60, 5);
    expect(roomLevelFromHass(hass, ['light.c'])).toBeUndefined();
  });
});

describe('expandLightIds — grupy do żarówek', () => {
  const hass = makeHass({
    'light.grupa': entity('light.grupa', 'on', { entity_id: ['light.a', 'light.podgrupa'] }),
    'light.podgrupa': entity('light.podgrupa', 'on', { entity_id: ['light.b', 'light.grupa', 'switch.gniazdko'] }),
    'light.a': dim('light.a', 100),
    'light.b': dim('light.b', 100),
    'switch.gniazdko': entity('switch.gniazdko', 'on'),
  });

  it('rozwija zagnieżdżone grupy bez duplikatów i bez pętli', () => {
    expect(expandLightIds(hass, ['light.grupa', 'light.a'])).toEqual(['light.a', 'light.b']);
  });

  it('pomija encje bez stanu i spoza domeny light', () => {
    expect(expandLightIds(hass, ['light.nie_ma', 'switch.gniazdko', 'light.b'])).toEqual(['light.b']);
  });

  it('żarówka wymieniona wprost i przez grupę pojawia się raz', () => {
    expect(expandLightIds(hass, ['light.b', 'light.podgrupa'])).toEqual(['light.b', 'light.a']);
  });
});

describe('liveIntervalMs — budżet łącza', () => {
  it('mały pokój: na żywo, nie częściej niż co 300 ms', () => {
    expect(liveIntervalMs(1)).toBe(300);
    expect(liveIntervalMs(3)).toBe(300);
    expect(liveIntervalMs(5)).toBe(400);
    expect(liveIntervalMs(8)).toBe(640);
  });
  it('duży pokój: dopiero po puszczeniu palca', () => {
    expect(liveIntervalMs(9)).toBeNull();
    expect(liveIntervalMs(23)).toBeNull();
    expect(liveIntervalMs(0)).toBeNull();
  });
});
