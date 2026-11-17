import { describe, expect, it } from 'vitest';
import {
  addGroupMembers,
  collectEntityIds,
  statesEmpty,
  statesReadyLatch,
  structureChanged,
  watchedStateChanged,
} from '../src/hass-watch.js';
import { nextTickMs } from '../src/ago-ticker.js';
import { getEntitiesInArea, getEntitiesInFloor } from '../src/area-entities.js';
import type { HomeAssistant } from '../src/types.js';

const st = (entity_id: string, state = 'on', attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state,
  attributes,
  last_changed: '2026-01-01T00:00:00Z',
  last_updated: '2026-01-01T00:00:00Z',
});

function hassOf(states: Record<string, unknown>, extra: Record<string, unknown> = {}): HomeAssistant {
  return { states, entities: {}, devices: {}, areas: {}, floors: {}, ...extra } as unknown as HomeAssistant;
}

describe('statesEmpty', () => {
  it('rozpoznaje brak i pusty obiekt stanów', () => {
    expect(statesEmpty(undefined)).toBe(true);
    expect(statesEmpty({})).toBe(true);
    expect(statesEmpty({ 'light.a': st('light.a') } as never)).toBe(false);
  });
});

describe('watchedStateChanged', () => {
  it('ignoruje zmianę encji spoza zbioru', () => {
    const a = st('light.a');
    const prev = hassOf({ 'light.a': a, 'sensor.x': st('sensor.x', '1') });
    const next = hassOf({ 'light.a': a, 'sensor.x': st('sensor.x', '2') });
    expect(watchedStateChanged(prev, next, ['light.a'])).toBe(false);
  });

  it('wykrywa zmianę tożsamości obserwowanej encji', () => {
    const prev = hassOf({ 'light.a': st('light.a', 'on') });
    const next = hassOf({ 'light.a': st('light.a', 'off') });
    expect(watchedStateChanged(prev, next, new Set(['light.a']))).toBe(true);
  });

  it('wykrywa pojawienie się i zniknięcie encji', () => {
    const a = st('light.a');
    expect(watchedStateChanged(hassOf({}), hassOf({ 'light.a': a }), ['light.a'])).toBe(true);
    expect(watchedStateChanged(hassOf({ 'light.a': a }), hassOf({}), ['light.a'])).toBe(true);
  });

  it('ten sam obiekt states = brak zmiany, bez iterowania', () => {
    const states = { 'light.a': st('light.a') };
    expect(watchedStateChanged(hassOf(states), hassOf(states), ['light.a'])).toBe(false);
  });
});

describe('structureChanged', () => {
  it('nie reaguje na samą zmianę stanów', () => {
    const shared = { entities: {}, devices: {}, areas: {}, floors: {} };
    const prev = hassOf({ a: 1 }, shared);
    const next = hassOf({ a: 2 }, shared);
    expect(structureChanged(prev, next)).toBe(false);
  });

  it('reaguje na nowy rejestr, motyw i użytkownika', () => {
    const shared = { entities: {}, devices: {}, areas: {}, floors: {}, themes: {}, user: {} };
    const prev = hassOf({}, shared);
    expect(structureChanged(prev, hassOf({}, { ...shared, entities: {} }))).toBe(true);
    expect(structureChanged(prev, hassOf({}, { ...shared, areas: {} }))).toBe(true);
    expect(structureChanged(prev, hassOf({}, { ...shared, themes: {} }))).toBe(true);
    expect(structureChanged(prev, hassOf({}, { ...shared, user: {} }))).toBe(true);
  });
});

describe('collectEntityIds', () => {
  it('zbiera encje z zagnieżdżonego configu — wartości i klucze', () => {
    const ids = collectEntityIds({
      type: 'custom:stratum-card',
      floor_id: 'parter',
      chips: [{ type: 'entity', entity: 'sensor.temp_salon' }],
      rooms: [
        {
          area_id: 'kuchnia',
          field_entities: { lights: ['light.kuchnia_blat', 'light.kuchnia_sufit'], temperature: 'sensor.kuchnia_t' },
          light_auto_entities: { kuchnia: 'input_boolean.kuchnia_auto' },
          scenes: { items: [{ entity: 'scene.kuchnia_wieczor' }] },
          tap_action: { action: 'call-service', service: 'light.turn_on' },
        },
      ],
      by_key: { 'switch.pompa': { label: 'Pompa' } },
    });
    expect([...ids].sort()).toEqual(
      [
        'input_boolean.kuchnia_auto',
        'light.kuchnia_blat',
        'light.kuchnia_sufit',
        // Nazwa usługi wygląda jak entity_id — fałszywe trafienie jest
        // nieszkodliwe (jedno porównanie referencji więcej).
        'light.turn_on',
        'scene.kuchnia_wieczor',
        'sensor.kuchnia_t',
        'sensor.temp_salon',
        'switch.pompa',
      ].sort(),
    );
  });

  it('nie łapie zwykłych tekstów, typów kart ani ikon', () => {
    const ids = collectEntityIds({
      type: 'custom:stratum-card',
      icon: 'mdi:home',
      name: 'Parter. Kuchnia',
      width: '12.5px',
      color: 'var(--primary-color)',
    });
    expect(ids.size).toBe(0);
  });

  it('nie zapętla się na cyklicznym obiekcie', () => {
    const a: Record<string, unknown> = { entity: 'light.a' };
    a.self = a;
    expect([...collectEntityIds(a)]).toEqual(['light.a']);
  });
});

describe('addGroupMembers', () => {
  it('dokłada członków grup, także zagnieżdżonych, bez pętli', () => {
    const hass = hassOf({
      'light.grupa': st('light.grupa', 'on', { entity_id: ['light.a', 'light.podgrupa'] }),
      'light.podgrupa': st('light.podgrupa', 'on', { entity_id: ['light.b', 'light.grupa'] }),
      'light.a': st('light.a'),
      'light.b': st('light.b'),
    });
    const ids = addGroupMembers(hass, new Set(['light.grupa']));
    expect([...ids].sort()).toEqual(['light.a', 'light.b', 'light.grupa', 'light.podgrupa']);
  });
});

describe('nextTickMs', () => {
  it('poniżej minuty tyka co sekundę', () => {
    expect(nextTickMs(0)).toBe(1000);
    expect(nextTickMs(59.2)).toBe(1000);
  });
  it('poniżej godziny budzi się na zmianę minuty', () => {
    expect(nextTickMs(60)).toBe(60_050);
    expect(nextTickMs(119)).toBe(1050);
    expect(nextTickMs(119.9)).toBe(1000);
  });
  it('dalej wystarczy raz na minutę', () => {
    expect(nextTickMs(3600)).toBe(60_000);
    expect(nextTickMs(90_000)).toBe(60_000);
  });
});

describe('indeks area → encje', () => {
  const entities = {
    'light.a': { entity_id: 'light.a', area_id: 'kuchnia' },
    'light.b': { entity_id: 'light.b', device_id: 'dev1' },
    'light.c': { entity_id: 'light.c', area_id: 'salon', device_id: 'dev1' },
    'light.ukryte': { entity_id: 'light.ukryte', area_id: 'kuchnia', hidden_by: 'user' },
    'light.wylaczone': { entity_id: 'light.wylaczone', area_id: 'kuchnia', disabled_by: 'user' },
    'sensor.bez_area': { entity_id: 'sensor.bez_area' },
  };
  const devices = { dev1: { id: 'dev1', area_id: 'kuchnia' } };
  const areas = {
    kuchnia: { area_id: 'kuchnia', name: 'Kuchnia', floor_id: 'parter' },
    salon: { area_id: 'salon', name: 'Salon', floor_id: 'parter' },
    strych: { area_id: 'strych', name: 'Strych', floor_id: 'pietro' },
  };
  const hass = { states: {}, entities, devices, areas, floors: {} } as unknown as HomeAssistant;

  it('area encji wygrywa z area urządzenia; ukryte i wyłączone odpadają', () => {
    expect(getEntitiesInArea(hass, 'kuchnia').map((e) => e.entity_id)).toEqual(['light.a', 'light.b']);
    expect(getEntitiesInArea(hass, 'salon').map((e) => e.entity_id)).toEqual(['light.c']);
    expect(getEntitiesInArea(hass, 'nie_ma')).toEqual([]);
  });

  it('piętro zbiera swoje strefy bez duplikatów', () => {
    expect(getEntitiesInFloor(hass, 'parter').map((e) => e.entity_id).sort()).toEqual(['light.a', 'light.b', 'light.c']);
    expect(getEntitiesInFloor(hass, 'pietro')).toEqual([]);
  });

  it('nowy rejestr encji albo urządzeń unieważnia indeks', () => {
    const moved = { ...hass, devices: { dev1: { id: 'dev1', area_id: 'salon' } } } as unknown as HomeAssistant;
    expect(getEntitiesInArea(moved, 'kuchnia').map((e) => e.entity_id)).toEqual(['light.a']);
    expect(getEntitiesInArea(moved, 'salon').map((e) => e.entity_id).sort()).toEqual(['light.b', 'light.c']);
    const added = {
      ...hass,
      entities: { ...entities, 'light.nowe': { entity_id: 'light.nowe', area_id: 'kuchnia' } },
    } as unknown as HomeAssistant;
    expect(getEntitiesInArea(added, 'kuchnia').map((e) => e.entity_id)).toEqual(['light.a', 'light.b', 'light.nowe']);
    // Stary hass dalej dostaje swój (stary) wynik.
    expect(getEntitiesInArea(hass, 'kuchnia').map((e) => e.entity_id)).toEqual(['light.a', 'light.b']);
  });
});

describe('statesReadyLatch', () => {
  it('po pierwszym niepustym wyniku nie przegląda już kluczy', () => {
    let enumerations = 0;
    const big = new Proxy(
      { 'light.a': {} },
      {
        ownKeys(target) {
          enumerations += 1;
          return Reflect.ownKeys(target);
        },
      },
    );
    const ready = statesReadyLatch();
    expect(ready({} as never)).toBe(false);
    expect(ready(undefined)).toBe(false);
    expect(ready(big as never)).toBe(true);
    const after = enumerations;
    for (let i = 0; i < 1000; i++) expect(ready(big as never)).toBe(true);
    expect(enumerations).toBe(after);
  });
});
