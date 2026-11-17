import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeSections,
  autoRoomChips,
  rawEntitiesForSection,
  resolveMediaList,
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
