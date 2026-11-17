import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeSections,
  autoRoomChips,
  rawEntitiesForSection,
  resolveMediaList,
  autoSections,
  entitiesForSection,
  roomViewEntitiesForSection,
  sectionCountLabel,
  summaryMeasurement,
} from '../src/room-sections.js';
import { fieldColorStyle } from '../src/field-colors.js';
import type { HomeAssistant, RoomSectionSpec, RoomSectionType } from '../src/types.js';
import { entity, entry, makeHass } from './helpers.js';

describe('normalizeSections', () => {
  const auto: RoomSectionType[] = ['scenes', 'lights', 'covers'];

  it('bez configu: sekcje = auto-wykryte', () => {
    expect(normalizeSections(undefined, auto)).toEqual([
      { type: 'scenes' },
      { type: 'lights' },
      { type: 'covers' },
    ]);
  });

  it('explicit nadpisuje auto i idzie pierwszy, reszta auto doklejona', () => {
    const out = normalizeSections([{ type: 'lights', title: 'Lampy' }], auto);
    expect(out[0]).toEqual({ type: 'lights', title: 'Lampy' });
    expect(out.map((s) => s.type)).toEqual(['lights', 'scenes', 'covers']);
  });

  it('stringi w spec są normalizowane do obiektów', () => {
    expect(normalizeSections(['media'], auto).map((s) => s.type)).toEqual([
      'media',
      'scenes',
      'lights',
      'covers',
    ]);
  });

  describe('nieprawidłowe wpisy z YAML', () => {
    afterEach(() => vi.restoreAllMocks());

    it('nieznany typ jako string jest pomijany z jednym ostrzeżeniem', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spec = ['lightz', 'covers'] as unknown as RoomSectionSpec[];
      expect(normalizeSections(spec, auto).map((s) => s.type)).toEqual([
        'covers',
        'scenes',
        'lights',
      ]);
      // Drugi render z tą samą literówką nie powtarza ostrzeżenia.
      normalizeSections(spec, auto);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('lightz');
    });

    it('obiekt z nieznanym typem (nawet z entities) jest pomijany', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spec = [
        { type: 'light', entities: ['light.a'] },
      ] as unknown as RoomSectionSpec[];
      expect(normalizeSections(spec, auto)).toEqual([
        { type: 'scenes' },
        { type: 'lights' },
        { type: 'covers' },
      ]);
    });

    it('null, liczby i klucze prototypu nie rzucają i są pomijane', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spec = [null, 7, 'toString', { title: 'bez typu' }, 'media'] as unknown as RoomSectionSpec[];
      expect(() => normalizeSections(spec, auto)).not.toThrow();
      expect(normalizeSections(spec, auto).map((s) => s.type)).toEqual([
        'media',
        'scenes',
        'lights',
        'covers',
      ]);
    });
  });
});

describe('rawEntitiesForSection', () => {
  it('nieznany typ daje pustą listę zamiast undefined', () => {
    const hass = makeHass({});
    const out = rawEntitiesForSection(
      hass,
      [entry('light.a')],
      'light' as unknown as RoomSectionType,
    );
    expect(out).toEqual([]);
  });
});

describe('resolveMediaList', () => {
  const hass = {
    ...makeHass({
      'media_player.salon': entity('media_player.salon', 'paused'),
      'media_player.tv': entity('media_player.tv', 'playing'),
      'media_player.cast': entity('media_player.cast', 'off'),
      'media_player.obcy': entity('media_player.obcy', 'idle'),
    }),
    entities: {
      'media_player.salon': entry('media_player.salon', { area_id: 'salon' }),
      'media_player.tv': entry('media_player.tv', { area_id: 'salon' }),
    },
  } as unknown as HomeAssistant;

  it('kolejność listy, bez ukrytych, separatorów, duplikatów i encji bez stanu', () => {
    const { entries } = resolveMediaList(hass, {
      items: [
        { entity: 'media_player.tv' },
        { separator: true, label: 'Inne' },
        { entity: 'media_player.cast', hidden: true },
        { entity: 'media_player.brak' },
        { entity: 'media_player.salon' },
        { entity: 'media_player.tv' },
      ],
    });
    expect(entries.map((e) => e.entity_id)).toEqual([
      'media_player.tv',
      'media_player.salon',
    ]);
    // Wpis z rejestru zachowany (area_id), nie minimalny stub.
    expect(entries[0]!.area_id).toBe('salon');
  });

  it('encja spoza rejestru dostaje minimalny wpis', () => {
    const { entries } = resolveMediaList(hass, {
      items: [{ entity: 'media_player.obcy' }],
    });
    expect(entries).toEqual([{ entity_id: 'media_player.obcy' }]);
  });

  it('override nazwy/ikony/akcji tylko dla pozycji, które je mają', () => {
    const tap = { action: 'more-info' as const };
    const { overrides } = resolveMediaList(hass, {
      items: [
        { entity: 'media_player.tv', name: 'TV', icon: 'mdi:television', tap_action: tap },
        { entity: 'media_player.salon' },
      ],
    });
    expect(overrides.get('media_player.tv')).toEqual({
      name: 'TV',
      icon: 'mdi:television',
      tap_action: tap,
    });
    expect(overrides.has('media_player.salon')).toBe(false);
  });

  it('brak configu → puste wyniki', () => {
    const out = resolveMediaList(hass, undefined);
    expect(out.entries).toEqual([]);
    expect(out.overrides.size).toBe(0);
  });
});

describe('autoRoomChips', () => {
  it('temperatura/wilgotność doklejane tylko gdy są sensory', () => {
    const hass = makeHass({
      'sensor.temp': entity('sensor.temp', '21.5', {
        device_class: 'temperature',
      }),
    });
    const chips = autoRoomChips(hass, [entry('sensor.temp')]);
    expect(chips.some((c) => c.type === 'temperature')).toBe(true);
    expect(chips.some((c) => c.type === 'humidity')).toBe(false);
    expect(chips[0]!.type).toBe('lights');
  });
});

describe('fieldColorStyle', () => {
  it('mapuje field_colors na CSS vars, pomija nieznane pola', () => {
    const css = fieldColorStyle({
      field_colors: {
        lights: '#abc',
        temperature: 'var(--x)',
      },
    });
    expect(css).toBe(
      '--stratum-chip-lights-color:#abc;--stratum-field-temp-color:var(--x);',
    );
  });

  it('pusty config → pusty string', () => {
    expect(fieldColorStyle(undefined)).toBe('');
    expect(fieldColorStyle({})).toBe('');
  });
});

describe('widok popupu z niedostępnymi encjami', () => {
  const hass = makeHass({
    'cover.okno': entity('cover.okno', 'unavailable'),
    'light.lampa': entity('light.lampa', 'unknown'),
    'light.ok': entity('light.ok', 'on'),
  });
  const entries = [
    entry('cover.okno'),
    entry('light.lampa'),
    entry('light.ok'),
    entry('light.ukryta', { hidden: true }),
    entry('light.dioda', { entity_category: 'diagnostic' }),
    entry('light.usunieta'),
  ];

  it('roomViewEntitiesForSection zostawia unavailable/unknown, odrzuca ukryte, diagnostyczne i bez stanu', () => {
    const h = makeHass({
      ...hass.states,
      'light.ukryta': entity('light.ukryta', 'on'),
      'light.dioda': entity('light.dioda', 'on'),
    });
    expect(roomViewEntitiesForSection(h, entries, 'lights').map((e) => e.entity_id)).toEqual([
      'light.lampa',
      'light.ok',
    ]);
    // Sterowanie i liczenie dalej tylko na dostępnych.
    expect(entitiesForSection(h, entries, 'lights').map((e) => e.entity_id)).toEqual([
      'light.ok',
    ]);
  });

  it('pokój, którego jedyna roleta jest offline, zachowuje sekcję rolet', () => {
    expect(autoSections(hass, entries)).toContain('covers');
  });
});

describe('sectionCountLabel', () => {
  it('sceny nie mają stanu „aktywna" — sama liczba zamiast stałego 0/N', () => {
    expect(sectionCountLabel('scenes', 0, 3)).toBe('3');
    expect(sectionCountLabel('covers', 1, 2)).toBe('1/2');
  });
});

describe('summaryMeasurement', () => {
  it('formatuje jak chip nagłówka (jedno miejsce po przecinku)', () => {
    const hass = makeHass({
      'sensor.t': entity('sensor.t', '21.456', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'sensor.h': entity('sensor.h', '54.66', {
        device_class: 'humidity',
        unit_of_measurement: '%',
      }),
    });
    const entries = [entry('sensor.t'), entry('sensor.h')];
    expect(summaryMeasurement(hass, entries, 'temperature')).toEqual({
      value: '21.5°C',
      available: true,
    });
    expect(summaryMeasurement(hass, entries, 'humidity')?.value).toBe('54.7%');
  });

  it('pomija czujnik offline na rzecz działającego; same offline → „—"', () => {
    const hass = makeHass({
      'sensor.a': entity('sensor.a', 'unavailable', { device_class: 'temperature' }),
      'sensor.b': entity('sensor.b', '19', { device_class: 'temperature' }),
    });
    expect(
      summaryMeasurement(hass, [entry('sensor.a'), entry('sensor.b')], 'temperature'),
    ).toEqual({ value: '19.0°C', available: true });
    expect(summaryMeasurement(hass, [entry('sensor.a')], 'temperature')).toEqual({
      value: '—',
      available: false,
    });
  });

  it('brak czujnika danej klasy → null (pole znika)', () => {
    expect(summaryMeasurement(makeHass({}), [], 'humidity')).toBeNull();
  });
});
