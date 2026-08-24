import { describe, expect, it } from 'vitest';
import { normalizeSections, autoRoomChips } from '../src/room-sections.js';
import { fieldColorStyle } from '../src/field-colors.js';
import type { RoomSectionType } from '../src/types.js';
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
