import { describe, expect, it } from 'vitest';
import {
  alarmEntityIds,
  chipEntityIds,
  chipSupportsList,
} from '../src/chip-list-helpers.js';
import type { ChipConfig } from '../src/types.js';
import { entity, entry, makeHass } from './helpers.js';

describe('chipSupportsList', () => {
  it('listy mają chipy agregujące, nie entity/template', () => {
    expect(chipSupportsList({ type: 'lights' } as ChipConfig)).toBe(true);
    expect(chipSupportsList({ type: 'motion' } as ChipConfig)).toBe(true);
    expect(
      chipSupportsList({ type: 'entity', entity: 'light.a' } as ChipConfig),
    ).toBe(false);
    expect(chipSupportsList({ type: 'template' } as ChipConfig)).toBe(false);
  });

  it('show_list: false wyłącza listę', () => {
    expect(
      chipSupportsList({ type: 'lights', show_list: false } as ChipConfig),
    ).toBe(false);
  });
});

describe('chipEntityIds', () => {
  it('lights: tylko włączone i bez grup-pomocników', () => {
    const hass = makeHass({
      'light.a': entity('light.a', 'on'),
      'light.b': entity('light.b', 'off'),
      // grupa świateł — ma attributes.entity_id (listę członków)
      'light.grupa': entity('light.grupa', 'on', {
        entity_id: ['light.a', 'light.b'],
      }),
    });
    const entries = [entry('light.a'), entry('light.b'), entry('light.grupa')];
    expect(chipEntityIds(hass, entries, { type: 'lights' } as ChipConfig)).toEqual(
      ['light.a'],
    );
  });

  it('motion: motion + occupancy, zdeduplikowane, tylko aktywne', () => {
    const hass = makeHass({
      'binary_sensor.ruch': entity('binary_sensor.ruch', 'on', {
        device_class: 'motion',
      }),
      'binary_sensor.obecnosc': entity('binary_sensor.obecnosc', 'on', {
        device_class: 'occupancy',
      }),
      'binary_sensor.spokoj': entity('binary_sensor.spokoj', 'off', {
        device_class: 'motion',
      }),
    });
    const entries = [
      entry('binary_sensor.ruch'),
      entry('binary_sensor.obecnosc'),
      entry('binary_sensor.spokoj'),
    ];
    expect(
      chipEntityIds(hass, entries, { type: 'motion' } as ChipConfig).sort(),
    ).toEqual(['binary_sensor.obecnosc', 'binary_sensor.ruch']);
  });

  it('windows: window + opening (generyczne Aqara)', () => {
    const hass = makeHass({
      'binary_sensor.okno': entity('binary_sensor.okno', 'on', {
        device_class: 'window',
      }),
      'binary_sensor.kontaktron': entity('binary_sensor.kontaktron', 'on', {
        device_class: 'opening',
      }),
    });
    const entries = [entry('binary_sensor.okno'), entry('binary_sensor.kontaktron')];
    expect(
      chipEntityIds(hass, entries, { type: 'windows' } as ChipConfig).sort(),
    ).toEqual(['binary_sensor.kontaktron', 'binary_sensor.okno']);
  });

  it('device_class czytany też z registry (override, np. SATEL)', () => {
    const hass = makeHass({
      // brak device_class w attributes — tylko w registry entry
      'binary_sensor.satel': entity('binary_sensor.satel', 'on'),
    });
    const entries = [entry('binary_sensor.satel', { device_class: 'window' })];
    expect(
      chipEntityIds(hass, entries, { type: 'windows' } as ChipConfig),
    ).toEqual(['binary_sensor.satel']);
  });

  it('filter: domena + device_class + niestandardowy stan', () => {
    const hass = makeHass({
      'cover.roleta': entity('cover.roleta', 'open'),
      'cover.brama': entity('cover.brama', 'closed'),
      'light.a': entity('light.a', 'open'),
    });
    const entries = [entry('cover.roleta'), entry('cover.brama'), entry('light.a')];
    expect(
      chipEntityIds(hass, entries, {
        type: 'filter',
        domain: 'cover',
        state: 'open',
      } as ChipConfig),
    ).toEqual(['cover.roleta']);
  });
});

describe('alarmEntityIds', () => {
  it('zbiera aktywne encje klas alarmowych, deduplikuje', () => {
    const hass = makeHass({
      'binary_sensor.dym': entity('binary_sensor.dym', 'on', {
        device_class: 'smoke',
      }),
      'binary_sensor.wyciek': entity('binary_sensor.wyciek', 'on', {
        device_class: 'moisture',
      }),
      'binary_sensor.ok': entity('binary_sensor.ok', 'off', {
        device_class: 'smoke',
      }),
      'binary_sensor.okno': entity('binary_sensor.okno', 'on', {
        device_class: 'window',
      }),
    });
    const entries = Object.keys(hass.states!).map((id) => entry(id));
    expect(alarmEntityIds(hass, entries).sort()).toEqual([
      'binary_sensor.dym',
      'binary_sensor.wyciek',
    ]);
  });
});
