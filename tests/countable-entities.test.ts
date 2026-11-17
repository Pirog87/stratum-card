// Ukryte i pomocnicze (config/diagnostic) encje w zliczeniach: diody statusu
// AP UniFi nie są „światłem w pokoju", temperatura wewnętrzna wtyczki nie
// jest temperaturą pokoju — ale bateria diagnostyczna dalej zapala chip.

import { describe, expect, it } from 'vitest';
import { countableLights, getEntitiesInArea, isPrimaryEntity } from '../src/area-entities.js';
import { computeTileData, resolveFieldEntityIds } from '../src/tile-data.js';
import { evaluateChip } from '../src/chip-defaults.js';
import type { TemplateRenderer } from '../src/template-renderer.js';
import type { ChipConfig, HassEntity, HassEntityRegistryEntry, HomeAssistant } from '../src/types.js';
import { entity } from './helpers.js';

const templates = {} as TemplateRenderer;

/** Hass z rejestrem wyświetlania: wpis rejestru dla każdego stanu, area „pokoj". */
function home(
  states: HassEntity[],
  registry: Record<string, Partial<HassEntityRegistryEntry>> = {},
): HomeAssistant {
  const s: Record<string, HassEntity> = {};
  const entities: Record<string, HassEntityRegistryEntry> = {};
  for (const st of states) {
    s[st.entity_id] = st;
    entities[st.entity_id] = { entity_id: st.entity_id, area_id: 'pokoj', ...registry[st.entity_id] };
  }
  return { states: s, entities, devices: {}, areas: {} } as unknown as HomeAssistant;
}

const ids = (list: readonly { entity_id: string }[]) => list.map((e) => e.entity_id);

describe('isPrimaryEntity', () => {
  it('ukryta albo z kategorią → nie; czyta też rejestr, gdy wpis jest „gołym" entry', () => {
    const hass = home([entity('light.a', 'on'), entity('light.b', 'on'), entity('light.c', 'on')], {
      'light.b': { hidden: true },
      'light.c': { entity_category: 'config' },
    });
    expect(isPrimaryEntity(hass, { entity_id: 'light.a' })).toBe(true);
    expect(isPrimaryEntity(hass, { entity_id: 'light.b' })).toBe(false);
    expect(isPrimaryEntity(hass, { entity_id: 'light.c' })).toBe(false);
  });
});

describe('countableLights', () => {
  it('niedostępne światło zostaje (ma się liczyć jako niedostępne, nie znikać)', () => {
    const hass = home([entity('light.a', 'on'), entity('light.b', 'unavailable')]);
    expect(ids(countableLights(hass, getEntitiesInArea(hass, 'pokoj')))).toEqual(['light.a', 'light.b']);
  });

  it('grupa z członkiem w puli odpada (bez podwójnego liczenia)', () => {
    const hass = home([
      entity('light.a', 'on'),
      entity('light.b', 'off'),
      entity('light.grupa', 'on', { entity_id: ['light.a', 'light.b'] }),
    ]);
    expect(ids(countableLights(hass, getEntitiesInArea(hass, 'pokoj')))).toEqual(['light.a', 'light.b']);
  });

  it('grupa, której członkowie są ukryci, zastępuje ich i liczy się raz', () => {
    const hass = home(
      [
        entity('light.listwa_1', 'on'),
        entity('light.listwa_2', 'on'),
        entity('light.listwy', 'on', { entity_id: ['light.listwa_1', 'light.listwa_2'] }),
      ],
      { 'light.listwa_1': { hidden: true }, 'light.listwa_2': { hidden: true } },
    );
    const entries = getEntitiesInArea(hass, 'pokoj');
    expect(ids(entries)).toEqual(['light.listwy']);
    expect(ids(countableLights(hass, entries))).toEqual(['light.listwy']);
  });
});

describe('resolveFieldEntityIds / computeTileData', () => {
  const room = () =>
    home(
      [
        entity('light.sufit', 'off', { supported_color_modes: ['brightness'] }),
        entity('light.ap_led', 'on', { supported_color_modes: ['onoff'] }),
        entity('light.ukryta', 'on', { supported_color_modes: ['onoff'] }),
        entity('binary_sensor.ruch', 'off', { device_class: 'motion' }),
        entity('binary_sensor.ruch_ap', 'on', { device_class: 'motion' }),
        entity('binary_sensor.okno_cfg', 'on', { device_class: 'window' }),
        entity('binary_sensor.wyciek', 'on', { device_class: 'moisture' }),
        entity('sensor.wtyczka_temp', '41.2', { device_class: 'temperature', unit_of_measurement: '°C' }),
        entity('sensor.pokoj_temp', '21.5', { device_class: 'temperature', unit_of_measurement: '°C' }),
      ],
      {
        'light.ap_led': { entity_category: 'config' },
        'light.ukryta': { hidden: true },
        'binary_sensor.ruch_ap': { entity_category: 'diagnostic' },
        'binary_sensor.okno_cfg': { entity_category: 'config' },
        'binary_sensor.wyciek': { entity_category: 'diagnostic' },
        'sensor.wtyczka_temp': { entity_category: 'diagnostic' },
      },
    );

  it('dioda AP (config) i ukryte światło nie liczą się jako „świeci"', () => {
    const hass = room();
    const entries = getEntitiesInArea(hass, 'pokoj');
    expect(resolveFieldEntityIds(hass, entries, 'lights')).toEqual(['light.sufit']);
    expect(computeTileData(hass, entries).lightsOn).toBe(0);
  });

  it('ruch i okna bez pomocniczych czujników; wyciek diagnostyczny zostaje', () => {
    const hass = room();
    const entries = getEntitiesInArea(hass, 'pokoj');
    const data = computeTileData(hass, entries);
    expect(data.motion).toBe(false);
    expect(data.windowsOpen).toBe(0);
    expect(data.leakActive).toBe(1);
  });

  it('temperatura pokoju nie pochodzi z diagnostycznej temperatury wtyczki', () => {
    const hass = room();
    const data = computeTileData(hass, getEntitiesInArea(hass, 'pokoj'));
    expect(data.temperatureValue).toBe(21.5);
  });

  it('jawna lista field_entities zostaje bez filtrów', () => {
    const hass = room();
    const entries = getEntitiesInArea(hass, 'pokoj');
    const fe = { lights: ['light.ap_led'], motion: ['binary_sensor.ruch_ap'] };
    expect(resolveFieldEntityIds(hass, entries, 'lights', fe)).toEqual(['light.ap_led']);
    const data = computeTileData(hass, entries, fe);
    expect(data.lightsOn).toBe(1);
    expect(data.motion).toBe(true);
  });
});

describe('evaluateChip', () => {
  it('chip „światła" nie liczy diody AP; „niska bateria" liczy baterię diagnostyczną', () => {
    const hass = home(
      [
        entity('light.sufit', 'on'),
        entity('light.ap_led', 'on'),
        entity('binary_sensor.bateria', 'on', { device_class: 'battery' }),
      ],
      {
        'light.ap_led': { entity_category: 'config' },
        'binary_sensor.bateria': { entity_category: 'diagnostic' },
      },
    );
    const entries = getEntitiesInArea(hass, 'pokoj');
    expect(evaluateChip(hass, entries, { type: 'lights' } as ChipConfig, templates).label).toBe('1');
    expect(evaluateChip(hass, entries, { type: 'battery_low' } as ChipConfig, templates)).toEqual({
      label: '1',
      active: true,
    });
  });

  it('chip temperatury pomija diagnostyczną temperaturę wtyczki', () => {
    const hass = home(
      [
        entity('sensor.wtyczka_temp', '41', { device_class: 'temperature', unit_of_measurement: '°C' }),
        entity('sensor.pokoj_temp', '21', { device_class: 'temperature', unit_of_measurement: '°C' }),
      ],
      { 'sensor.wtyczka_temp': { entity_category: 'diagnostic' } },
    );
    const v = evaluateChip(hass, getEntitiesInArea(hass, 'pokoj'), { type: 'temperature' } as ChipConfig, templates);
    expect(v.label).toBe('21.0°C');
  });

  it('segment WLED przy zgaszonym sterowniku nie liczy się jako świecący', () => {
    const hass = home([
      entity('light.wled', 'off', { group_entities: ['light.seg1', 'light.seg2'] }),
      entity('light.seg1', 'on'),
      entity('light.seg2', 'on'),
    ], { 'light.wled': { platform: 'wled' } });
    expect(evaluateChip(hass, getEntitiesInArea(hass, 'pokoj'), { type: 'lights' } as ChipConfig, templates).label).toBe('0');
  });

  it('grupa podgrupy spoza strefy nie dubluje żarówek (przegląd v1.109.0)', () => {
    const states = [
      entity('light.kuchnia', 'on', { entity_id: ['light.blat'] }),
      entity('light.b1', 'on'),
      entity('light.b2', 'on'),
    ];
    const hass = home(states);
    // Podgrupa „blat" bez strefy — jest w stanach, nie w rejestrze strefy.
    (hass.states as Record<string, HassEntity>)['light.blat'] = entity('light.blat', 'on', {
      entity_id: ['light.b1', 'light.b2'],
    });
    expect(ids(countableLights(hass, getEntitiesInArea(hass, 'pokoj')))).toEqual(['light.b1', 'light.b2']);
  });
});
