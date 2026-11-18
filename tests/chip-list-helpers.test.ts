import { describe, expect, it } from 'vitest';
import {
  alarmEntityIds,
  chipDefaultTap,
  chipEntityIds,
  chipMoreInfoEntity,
  chipSupportsList,
  listRowsUpdate,
} from '../src/chip-list-helpers.js';
import type { ChipConfig, HomeAssistant } from '../src/types.js';
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

  it('temperatura i wilgotność nie otwierają (zawsze pustej) listy', () => {
    expect(chipSupportsList({ type: 'temperature' } as ChipConfig)).toBe(false);
    expect(chipSupportsList({ type: 'humidity' } as ChipConfig)).toBe(false);
  });
});

describe('chipMoreInfoEntity', () => {
  const hass = makeHass({
    'sensor.salon_temp': entity('sensor.salon_temp', '21.5', { device_class: 'temperature' }),
    'sensor.salon_hum': entity('sensor.salon_hum', '48', { device_class: 'humidity' }),
    'sensor.kuchnia_temp': entity('sensor.kuchnia_temp', '23', { device_class: 'temperature' }),
    'switch.ekspres': entity('switch.ekspres', 'off'),
  });
  const entries = [entry('sensor.salon_hum'), entry('sensor.salon_temp')];

  it('temperatura/wilgotność: wykryty czujnik strefy — ten sam, z którego chip bierze wartość', () => {
    expect(chipMoreInfoEntity(hass, entries, { type: 'temperature' } as ChipConfig)).toBe(
      'sensor.salon_temp',
    );
    expect(chipMoreInfoEntity(hass, entries, { type: 'humidity' } as ChipConfig)).toBe(
      'sensor.salon_hum',
    );
  });

  it('jawna encja z configu wygrywa nad wykrytą', () => {
    expect(
      chipMoreInfoEntity(hass, entries, {
        type: 'temperature',
        entity: 'sensor.kuchnia_temp',
      } as ChipConfig),
    ).toBe('sensor.kuchnia_temp');
  });

  it('brak czujnika, nieznana encja albo tap_action: none = chip nieklikalny', () => {
    expect(chipMoreInfoEntity(hass, [], { type: 'temperature' } as ChipConfig)).toBeUndefined();
    expect(
      chipMoreInfoEntity(hass, entries, { type: 'entity', entity: 'switch.literowka' } as ChipConfig),
    ).toBeUndefined();
    expect(
      chipMoreInfoEntity(hass, entries, {
        type: 'temperature',
        tap_action: { action: 'none' },
      } as ChipConfig),
    ).toBeUndefined();
  });

  it('chip encji: more-info swojej encji; chipy zbiorcze: nic (mają listę)', () => {
    expect(
      chipMoreInfoEntity(hass, entries, { type: 'entity', entity: 'switch.ekspres' } as ChipConfig),
    ).toBe('switch.ekspres');
    expect(chipMoreInfoEntity(hass, entries, { type: 'lights' } as ChipConfig)).toBeUndefined();
  });
});

describe('chipDefaultTap', () => {
  const hass = makeHass({
    'sensor.t': entity('sensor.t', '21.5', { device_class: 'temperature' }),
    'sensor.h': entity('sensor.h', '45', { device_class: 'humidity' }),
    'switch.ekspres': entity('switch.ekspres', 'off'),
  });
  const entries = [entry('sensor.t'), entry('sensor.h')];

  it('temperatura/wilgotność w karcie pokoju: more-info czujnika, nie martwy chip', () => {
    expect(chipDefaultTap(hass, entries, { type: 'temperature' } as ChipConfig)).toEqual({
      kind: 'more-info',
      entityId: 'sensor.t',
    });
    expect(chipDefaultTap(hass, entries, { type: 'humidity' } as ChipConfig)).toEqual({
      kind: 'more-info',
      entityId: 'sensor.h',
    });
    expect(
      chipDefaultTap(hass, entries, { type: 'entity', entity: 'switch.ekspres' } as ChipConfig),
    ).toEqual({ kind: 'more-info', entityId: 'switch.ekspres' });
  });

  it('chipy zbiorcze: lista', () => {
    expect(chipDefaultTap(hass, entries, { type: 'lights' } as ChipConfig)).toEqual({
      kind: 'list',
    });
  });

  it('brak listy i brak czujnika = nieklikalny', () => {
    expect(chipDefaultTap(hass, [], { type: 'temperature' } as ChipConfig)).toBeUndefined();
    expect(chipDefaultTap(hass, entries, { type: 'template' } as ChipConfig)).toBeUndefined();
    expect(
      chipDefaultTap(hass, entries, { type: 'lights', show_list: false } as ChipConfig),
    ).toBeUndefined();
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

  it('device_class wyłącznie z atrybutów stanu (tam HA wpisuje też override „Pokaż jako")', () => {
    // Rejestr wyświetlania HA (`hass.entities`) nie ma pola device_class —
    // override usera (np. SATEL) i tak ląduje w atrybutach stanu.
    const hass = makeHass({
      'binary_sensor.satel': entity('binary_sensor.satel', 'on', { device_class: 'window' }),
      'binary_sensor.bez_klasy': entity('binary_sensor.bez_klasy', 'on'),
    });
    const entries = [entry('binary_sensor.satel'), entry('binary_sensor.bez_klasy')];
    expect(
      chipEntityIds(hass, entries, { type: 'windows' } as ChipConfig),
    ).toEqual(['binary_sensor.satel']);
  });

  it('lights: bez diody statusu (config) i ukrytych; grupa za ukrytymi członkami liczy się raz', () => {
    const hass = {
      states: {
        'light.sufit': entity('light.sufit', 'on'),
        'light.ap_led': entity('light.ap_led', 'on'),
        'light.kinkiet': entity('light.kinkiet', 'on'),
        // Członkowie grupy są ukryci (nie trafiają do puli) — grupa ich zastępuje.
        'light.grupa_listwy': entity('light.grupa_listwy', 'on', {
          entity_id: ['light.listwa_1', 'light.listwa_2'],
        }),
      },
      entities: {
        'light.ap_led': { entity_id: 'light.ap_led', entity_category: 'config' },
        'light.kinkiet': { entity_id: 'light.kinkiet', hidden: true },
      },
    } as unknown as HomeAssistant;
    const entries = [
      entry('light.sufit'),
      entry('light.ap_led'),
      entry('light.kinkiet'),
      entry('light.grupa_listwy'),
    ];
    expect(chipEntityIds(hass, entries, { type: 'lights' } as ChipConfig)).toEqual([
      'light.sufit',
      'light.grupa_listwy',
    ]);
  });

  it('motion pomija czujnik diagnostyczny, battery_low i problem go zostawiają', () => {
    const hass = makeHass({
      'binary_sensor.ruch_diag': entity('binary_sensor.ruch_diag', 'on', { device_class: 'motion' }),
      'binary_sensor.bateria': entity('binary_sensor.bateria', 'on', { device_class: 'battery' }),
      'binary_sensor.sabotaz': entity('binary_sensor.sabotaz', 'on', { device_class: 'tamper' }),
    });
    const entries = [
      entry('binary_sensor.ruch_diag', { entity_category: 'diagnostic' }),
      entry('binary_sensor.bateria', { entity_category: 'diagnostic' }),
      entry('binary_sensor.sabotaz', { entity_category: 'diagnostic' }),
    ];
    expect(chipEntityIds(hass, entries, { type: 'motion' } as ChipConfig)).toEqual([]);
    expect(chipEntityIds(hass, entries, { type: 'battery_low' } as ChipConfig)).toEqual([
      'binary_sensor.bateria',
    ]);
    expect(chipEntityIds(hass, entries, { type: 'problem' } as ChipConfig)).toEqual([
      'binary_sensor.sabotaz',
    ]);
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

describe('listRowsUpdate', () => {
  it('przypięte: zgaszony wiersz zostaje, nowy dopisany na końcu', () => {
    expect(listRowsUpdate(['light.a', 'light.b'], ['light.b', 'light.c'], false)).toEqual({
      shown: ['light.a', 'light.b', 'light.c'],
      leaving: [],
    });
  });
  it('po „Wyłącz wszystkie": zgaszone wychodzą, aktywne zostają', () => {
    expect(listRowsUpdate(['light.a', 'light.b'], ['light.b'], true)).toEqual({
      shown: ['light.a', 'light.b'],
      leaving: ['light.a'],
    });
  });
  it('po „Wyłącz wszystkie": wszystko zgaszone = wszystko wychodzi', () => {
    expect(listRowsUpdate(['light.a', 'light.b'], [], true).leaving).toEqual(['light.a', 'light.b']);
  });
});
