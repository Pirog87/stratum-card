import { describe, expect, it } from 'vitest';
import {
  addGroupMembers,
  collectEntityIds,
  languageChanged,
  themeChanged,
  popupRelevantFilter,
  sceneBarHassChanged,
  statesEmpty,
  statesReadyLatch,
  structureChanged,
  touchesWatched,
  watchedStateChanged,
} from '../src/hass-watch.js';
import { SECTION_LABEL } from '../src/section-defaults.js';
import { rawEntitiesForSection } from '../src/room-sections.js';
import type { HassEntityRegistryEntry, RoomSectionType } from '../src/types.js';
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

describe('languageChanged', () => {
  it('przepuszcza przełączenie języka profilu przy tych samych stanach', () => {
    const states = { 'light.a': st('light.a') };
    const locale = { language: 'pl' };
    const prev = hassOf(states, { language: 'pl', locale });
    expect(languageChanged(prev, hassOf(states, { language: 'pl', locale }))).toBe(false);
    expect(
      languageChanged(prev, hassOf(states, { language: 'en', locale: { language: 'en' } })),
    ).toBe(true);
    // Sam nowy obiekt locale (np. zmiana formatu liczb) też zmienia teksty.
    expect(languageChanged(prev, hassOf(states, { language: 'pl', locale: { language: 'pl' } }))).toBe(true);
  });
});

describe('themeChanged', () => {
  it('reaguje na nowy obiekt motywów (jasny/ciemny) i wybrany motyw', () => {
    const themes = { darkMode: false };
    const prev = hassOf({}, { themes, selectedTheme: null });
    expect(themeChanged(prev, hassOf({}, { themes, selectedTheme: null }))).toBe(false);
    expect(themeChanged(prev, hassOf({}, { themes: { darkMode: true }, selectedTheme: null }))).toBe(true);
    expect(themeChanged(prev, hassOf({}, { themes, selectedTheme: { theme: 'x' } }))).toBe(true);
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
    // Kształt rejestru WYŚWIETLANIA HA: `hidden: true`, nie `hidden_by`.
    // Wyłączonych encji HA tu w ogóle nie wysyła, więc ich nie modelujemy.
    'light.ukryte': { entity_id: 'light.ukryte', area_id: 'kuchnia', hidden: true },
    // Config/diagnostic zostają w indeksie — filtrują je konsumenci
    // (bateria diagnostyczna musi dalej zapalać chip „niska bateria").
    'sensor.bateria': { entity_id: 'sensor.bateria', area_id: 'strych', entity_category: 'diagnostic' },
    'sensor.bez_area': { entity_id: 'sensor.bez_area' },
  };
  const devices = { dev1: { id: 'dev1', area_id: 'kuchnia' } };
  const areas = {
    kuchnia: { area_id: 'kuchnia', name: 'Kuchnia', floor_id: 'parter' },
    salon: { area_id: 'salon', name: 'Salon', floor_id: 'parter' },
    strych: { area_id: 'strych', name: 'Strych', floor_id: 'pietro' },
  };
  const hass = { states: {}, entities, devices, areas, floors: {} } as unknown as HomeAssistant;

  it('area encji wygrywa z area urządzenia; ukryte odpadają, diagnostyczne zostają', () => {
    expect(getEntitiesInArea(hass, 'kuchnia').map((e) => e.entity_id)).toEqual(['light.a', 'light.b']);
    expect(getEntitiesInArea(hass, 'salon').map((e) => e.entity_id)).toEqual(['light.c']);
    expect(getEntitiesInArea(hass, 'strych').map((e) => e.entity_id)).toEqual(['sensor.bateria']);
    expect(getEntitiesInArea(hass, 'nie_ma')).toEqual([]);
  });

  it('piętro zbiera swoje strefy bez duplikatów', () => {
    expect(getEntitiesInFloor(hass, 'parter').map((e) => e.entity_id).sort()).toEqual(['light.a', 'light.b', 'light.c']);
    expect(getEntitiesInFloor(hass, 'pietro').map((e) => e.entity_id)).toEqual(['sensor.bateria']);
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

describe('touchesWatched', () => {
  it('przepuszcza tylko powiadomienia o obserwowanych encjach', () => {
    const watched = new Set(['light.taras_1', 'light.taras_2']);
    expect(touchesWatched(watched, new Set(['light.taras_2']))).toBe(true);
    expect(touchesWatched(watched, new Set(['light.kuchnia_1', 'light.kuchnia_2']))).toBe(false);
    expect(touchesWatched(watched, new Set())).toBe(false);
  });

  it('bez policzonego zbioru — przerysuj (bezpieczny domyślny)', () => {
    expect(touchesWatched(undefined, new Set(['light.x']))).toBe(true);
  });

  it('działa także, gdy zmienionych jest więcej niż obserwowanych', () => {
    const changed = new Set(Array.from({ length: 50 }, (_, i) => `light.l${i}`));
    expect(touchesWatched(new Set(['light.l42']), changed)).toBe(true);
    expect(touchesWatched(new Set(['light.inna']), changed)).toBe(false);
  });
});

describe('popupRelevantFilter — co obserwuje otwarty popup pokoju', () => {
  const states = {
    'light.l': st('light.l'),
    'binary_sensor.okno': st('binary_sensor.okno', 'off', { device_class: 'window' }),
    'binary_sensor.drzwi': st('binary_sensor.drzwi', 'off', { device_class: 'door' }),
    'binary_sensor.dym': st('binary_sensor.dym', 'off', { device_class: 'smoke' }),
    'cover.r': st('cover.r', 'closed'),
    'climate.k': st('climate.k', 'heat'),
    'media_player.tv': st('media_player.tv', 'off'),
    'fan.w': st('fan.w', 'off'),
    'switch.s': st('switch.s', 'off'),
    'scene.s': st('scene.s', '2026-01-01T00:00:00Z'),
    'sensor.temp': st('sensor.temp', '21.5', { device_class: 'temperature' }),
    'sensor.hum': st('sensor.hum', '50', { device_class: 'humidity' }),
    'sensor.moc': st('sensor.moc', '12', { device_class: 'power' }),
    'sensor.energia': st('sensor.energia', '3', { device_class: 'energy' }),
    'sensor.linkquality': st('sensor.linkquality', '120'),
    'sensor.bateria': st('sensor.bateria', '80', { device_class: 'battery' }),
    'number.czulosc': st('number.czulosc', '3'),
    'select.tryb': st('select.tryb', 'auto'),
    'update.fw': st('update.fw', 'off'),
    'vacuum.v': st('vacuum.v', 'docked'),
    'lock.z': st('lock.z', 'locked'),
  };
  const hass = hassOf(states);

  it('odrzuca szum Z2M (moc, energia, linkquality) i encje bez sekcji', () => {
    const rel = popupRelevantFilter(hass, {});
    for (const id of ['sensor.moc', 'sensor.energia', 'sensor.linkquality', 'number.czulosc', 'select.tryb', 'update.fw']) {
      expect(rel(id), id).toBe(false);
    }
  });

  it('obserwuje sekcje, chipy i alarmy oraz temperaturę i wilgotność', () => {
    const rel = popupRelevantFilter(hass, {});
    for (const id of ['light.l', 'binary_sensor.okno', 'binary_sensor.dym', 'cover.r', 'climate.k', 'media_player.tv', 'fan.w', 'switch.s', 'scene.s', 'sensor.temp', 'sensor.hum']) {
      expect(rel(id), id).toBe(true);
    }
  });

  it('każdy typ sekcji: encje, które sekcja pokazuje, są obserwowane', () => {
    const entries: HassEntityRegistryEntry[] = Object.keys(states).map((entity_id) => ({ entity_id }));
    const rel = popupRelevantFilter(hass, {});
    for (const type of Object.keys(SECTION_LABEL) as RoomSectionType[]) {
      for (const e of rawEntitiesForSection(hass, entries, type)) {
        expect(rel(e.entity_id), `${type}: ${e.entity_id}`).toBe(true);
      }
    }
  });

  it('bateria tylko wtedy, gdy podsumowanie pokazuje „niska bateria"', () => {
    expect(popupRelevantFilter(hass, {})('sensor.bateria')).toBe(false);
    expect(popupRelevantFilter(hass, { sections: ['summary'] })('sensor.bateria')).toBe(false);
    expect(
      popupRelevantFilter(hass, { sections: [{ type: 'summary', fields: ['battery_low'] }] })('sensor.bateria'),
    ).toBe(true);
  });

  it('chip filtrujący dokłada swoją domenę, a bez domeny — obserwuje wszystko', () => {
    const withLock = popupRelevantFilter(hass, { chips: [{ type: 'filter', domain: 'lock', state: 'unlocked' }] });
    expect(withLock('lock.z')).toBe(true);
    expect(withLock('vacuum.v')).toBe(false);
    const all = popupRelevantFilter(hass, { chips: [{ type: 'filter', device_class: 'window' }] });
    expect(all('sensor.moc')).toBe(true);
  });

  it('czujnik bez stanu (klasa jeszcze nieznana) jest obserwowany', () => {
    expect(popupRelevantFilter(hass, {})('sensor.nowy')).toBe(true);
  });
});

describe('sceneBarHassChanged', () => {
  const items = [
    { entity: 'scene.wieczor' },
    { separator: true, label: 'Inne' },
    { entity: 'script.film' },
  ];
  const base = () => {
    const states: Record<string, unknown> = {
      'scene.wieczor': st('scene.wieczor', '2026-01-01', { entity_id: ['light.a', 'light.b'] }),
      'script.film': st('script.film', 'off'),
      'light.a': st('light.a', 'on', { rgb_color: [255, 0, 0] }),
      'light.b': st('light.b', 'off'),
      'light.c': st('light.c', 'on'),
      'sensor.kuchnia_power': st('sensor.kuchnia_power', '12'),
    };
    return hassOf(states, { user: { id: 'u', is_admin: true } });
  };

  it('pierwsze podanie hass zawsze renderuje', () => {
    expect(sceneBarHassChanged(undefined, base(), items)).toBe(true);
    expect(sceneBarHassChanged(undefined, undefined, items)).toBe(false);
  });

  it('ten sam obiekt states — bez renderu', () => {
    const a = base();
    expect(sceneBarHassChanged(a, { ...a } as HomeAssistant, items)).toBe(false);
  });

  it('raport mocy, temperatury albo obcej lampy nie budzi paska', () => {
    const a = base();
    for (const id of ['sensor.kuchnia_power', 'light.c']) {
      const b = { ...a, states: { ...a.states, [id]: st(id, '99') } } as HomeAssistant;
      expect(sceneBarHassChanged(a, b, items)).toBe(false);
    }
  });

  it('zmiana sceny, skryptu albo lampy-członka — render', () => {
    const a = base();
    for (const id of ['scene.wieczor', 'script.film', 'light.a', 'light.b']) {
      const b = { ...a, states: { ...a.states, [id]: st(id, 'x') } } as HomeAssistant;
      expect(sceneBarHassChanged(a, b, items)).toBe(true);
    }
  });

  it('lampa usunięta ze sceny nadal jest obserwowana w tej zmianie', () => {
    const a = base();
    const b = {
      ...a,
      states: {
        ...a.states,
        'scene.wieczor': st('scene.wieczor', '2026-01-01', { entity_id: ['light.a'] }),
        'light.b': st('light.b', 'on'),
      },
    } as HomeAssistant;
    expect(sceneBarHassChanged(a, b, items)).toBe(true);
  });

  it('zmiana użytkownika (bramka admina) — render', () => {
    const a = base();
    const b = { ...a, user: { id: 'u', is_admin: false } } as unknown as HomeAssistant;
    expect(sceneBarHassChanged(a, b, items)).toBe(true);
  });

  it('brak items — tylko pierwsze podanie i user', () => {
    const a = base();
    const b = { ...a, states: { ...a.states, 'light.a': st('light.a', 'off') } } as HomeAssistant;
    expect(sceneBarHassChanged(a, b, undefined)).toBe(false);
  });
});
