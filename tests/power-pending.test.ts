import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_TTL_MS,
  anyLightOn,
  effectiveState,
  pendingWant,
  resetPowerPending,
  subscribePower,
  tapPower,
  toggleRoomLights,
} from '../src/power-pending.js';
import { resetLightSwipeState } from '../src/light-swipe.js';
import type { HassEntity, HomeAssistant } from '../src/types.js';
import { entity } from './helpers.js';

interface Call { service: string; ids: string[] }


/**
 * Rejestr wyświetlania dla fałszywego HA: sterowniki główne WLED (stan z
 * `group_entities`, nazwa „wled") dostają platform: 'wled' — tylko takie
 * encje karta uznaje za bramkę zasilania segmentów.
 */
function registryFor(initial: HassEntity[]): Record<string, { entity_id: string; platform?: string }> {
  return Object.fromEntries(
    initial.map((s) => [
      s.entity_id,
      { entity_id: s.entity_id, platform: s.entity_id.includes('wled') ? 'wled' : 'mqtt' },
    ]),
  );
}

function ha(initial: HassEntity[]) {
  const states: Record<string, HassEntity> = {};
  for (const s of initial) states[s.entity_id] = s;
  const calls: Call[] = [];
  const hass = {
    states,
    entities: registryFor(initial),
    callService: (_d: string, service: string, _data: unknown, target?: { entity_id?: string | string[] }) => {
      calls.push({ service, ids: ([] as string[]).concat(target?.entity_id ?? []) });
      return Promise.resolve();
    },
  } as unknown as HomeAssistant;
  return { hass, states, calls };
}

const on = (id: string) => entity(id, 'on', { brightness: 200, supported_color_modes: ['brightness'] });
const off = (id: string) => entity(id, 'off', { supported_color_modes: ['brightness'] });

beforeEach(() => {
  vi.useFakeTimers();
  resetPowerPending();
  resetLightSwipeState();
});
afterEach(() => vi.useRealTimers());

describe('stan w toku po tapnięciu', () => {
  it('przełącznik pokazuje nowy stan od razu, aż HA potwierdzi', () => {
    const { hass, states } = ha([on('light.a')]);
    expect(tapPower(hass, 'light.a')).toBe(true);
    expect(effectiveState(hass, 'light.a')).toBe('off');
    // HA potwierdza → wpis znika, dalej widać off (już z HA).
    states['light.a'] = off('light.a');
    expect(pendingWant(hass, 'light.a')).toBeUndefined();
    expect(effectiveState(hass, 'light.a')).toBe('off');
  });

  it('drugi tap w trakcie nie odwraca akcji — wysyła to, co widać', () => {
    const { hass, calls } = ha([on('light.a')]);
    tapPower(hass, 'light.a');
    tapPower(hass, 'light.a');
    // Pierwszy: zgaś. Drugi (widać „wyłączone"): zapal — świadoma decyzja
    // użytkownika, a nie przypadkowe odwrócenie przez `toggle`.
    expect(calls.map((c) => c.service)).toEqual(['turn_off', 'turn_on']);
  });

  it('bez potwierdzenia po 5 s wraca prawda z HA i przychodzi powiadomienie', () => {
    const { hass } = ha([on('light.a')]);
    const seen: string[][] = [];
    const unsub = subscribePower((ids) => seen.push([...ids]));
    tapPower(hass, 'light.a');
    expect(effectiveState(hass, 'light.a')).toBe('off');
    vi.advanceTimersByTime(PENDING_TTL_MS + 100);
    expect(effectiveState(hass, 'light.a')).toBe('on');
    expect(seen.length).toBe(2);
    unsub();
  });

  it('domeny bez włącz/wyłącz zostają wołającemu', () => {
    const { hass, calls } = ha([entity('cover.roleta', 'open')]);
    expect(tapPower(hass, 'cover.roleta')).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('włącznik świateł pokoju', () => {
  it('gasi tylko świecące, a licznik spada od razu', () => {
    const { hass, calls } = ha([on('light.a'), off('light.b'), on('light.c'), off('light.d')]);
    const ids = ['light.a', 'light.b', 'light.c', 'light.d'];
    expect(anyLightOn(hass, ids)).toBe(true);
    toggleRoomLights(hass, ids, 'kuchnia');
    expect(calls).toEqual([{ service: 'turn_off', ids: ['light.a', 'light.c'] }]);
    expect(anyLightOn(hass, ids)).toBe(false);
  });

  it('drugi tap w trakcie gaszenia zapala (bo widać ciemno), nie gasi ponownie', () => {
    const { hass, calls } = ha([on('light.a'), off('light.b')]);
    const ids = ['light.a', 'light.b'];
    toggleRoomLights(hass, ids);
    toggleRoomLights(hass, ids);
    expect(calls.map((c) => c.service)).toEqual(['turn_off', 'turn_on']);
  });

  it('nic nie świeci → zapala wszystkie dostępne', () => {
    const { hass, calls } = ha([off('light.a'), off('light.b'), entity('light.x', 'unavailable')]);
    toggleRoomLights(hass, ['light.a', 'light.b', 'light.x']);
    expect(calls).toEqual([{ service: 'turn_on', ids: ['light.a', 'light.b'] }]);
  });

  it('grupa świateł: gasimy świecących członków, nie całą grupę', () => {
    const { hass, calls } = ha([
      entity('light.grupa', 'on', { entity_id: ['light.a', 'light.b'] }),
      on('light.a'),
      off('light.b'),
    ]);
    toggleRoomLights(hass, ['light.grupa']);
    expect(calls).toEqual([{ service: 'turn_off', ids: ['light.a'] }]);
    expect(effectiveState(hass, 'light.grupa')).toBe('off');
  });
});

describe('poprawki z przeglądu', () => {
  it('pokój z jedną lampą „unknown" i resztą zgaszonych: tap zapala, nie gasi', () => {
    const { hass, calls } = ha([off('light.a'), off('light.b'), entity('light.c', 'unknown')]);
    const ids = ['light.a', 'light.b', 'light.c'];
    expect(anyLightOn(hass, ids)).toBe(false);
    toggleRoomLights(hass, ids, 'k');
    expect(calls).toEqual([{ service: 'turn_on', ids: ['light.a', 'light.b', 'light.c'] }]);
  });

  it('gasząc, bierze też lampy „unknown"', () => {
    const { hass, calls } = ha([on('light.a'), entity('light.c', 'unknown')]);
    toggleRoomLights(hass, ['light.a', 'light.c']);
    expect(calls).toEqual([{ service: 'turn_off', ids: ['light.a', 'light.c'] }]);
  });

  it('niedostępna lampa nie dostaje stanu w toku i wygląda na martwą', () => {
    const { hass } = ha([off('light.a'), entity('light.x', 'unavailable')]);
    toggleRoomLights(hass, ['light.a', 'light.x']);
    expect(effectiveState(hass, 'light.x')).toBe('unavailable');
    expect(effectiveState(hass, 'light.a')).toBe('on');
  });

  it('drugi tap w trakcie potwierdzania: spóźnione echo pierwszego nie przestawia przełącznika', () => {
    const { hass, states } = ha([on('light.a')]);
    tapPower(hass, 'light.a'); // zgaś
    tapPower(hass, 'light.a'); // zapal — HA wciąż pokazuje „on" sprzed tapu 1
    expect(effectiveState(hass, 'light.a')).toBe('on');
    // Spóźnione echo „off" z tapu 1:
    states['light.a'] = off('light.a');
    expect(effectiveState(hass, 'light.a')).toBe('on');
    // Echo „on" z tapu 2 — potwierdzenie:
    states['light.a'] = on('light.a');
    expect(pendingWant(hass, 'light.a')).toBeUndefined();
    expect(effectiveState(hass, 'light.a')).toBe('on');
  });

  it('grupa świateł po głównym włączniku pokoju od razu pokazuje „off"', () => {
    const { hass } = ha([
      entity('light.grupa', 'on', { entity_id: ['light.a', 'light.b'] }),
      on('light.a'),
      on('light.b'),
    ]);
    toggleRoomLights(hass, ['light.a', 'light.b']);
    expect(effectiveState(hass, 'light.grupa')).toBe('off');
  });

  it('nieudana komenda na grupie czyści też członków', async () => {
    const states: Record<string, HassEntity> = {
      'light.grupa': entity('light.grupa', 'on', { entity_id: ['light.a', 'light.b'] }),
      'light.a': on('light.a'),
      'light.b': on('light.b'),
    };
    const hass = { states, callService: () => Promise.reject(new Error('x')) } as unknown as HomeAssistant;
    tapPower(hass, 'light.grupa');
    expect(effectiveState(hass, 'light.a')).toBe('off');
    await Promise.resolve();
    await Promise.resolve();
    expect(effectiveState(hass, 'light.a')).toBe('on');
    expect(effectiveState(hass, 'light.grupa')).toBe('on');
  });
});

describe('sterownik WLED (group_entities) jako bramka zasilania segmentów', () => {
  const main = (state: string) =>
    entity('light.wled_main', state, {
      supported_color_modes: ['brightness'],
      group_entities: ['light.seg1', 'light.seg2'],
    });
  const SEGS = ['light.seg1', 'light.seg2'];

  it('sterownik zgaszony, segmenty „on" w HA: pokój ciemny, tap zapala sterownik i segmenty', () => {
    const { hass, calls } = ha([main('off'), on('light.seg1'), on('light.seg2')]);
    expect(anyLightOn(hass, SEGS)).toBe(false);
    expect(effectiveState(hass, 'light.seg1')).toBe('off');
    toggleRoomLights(hass, SEGS, 'k');
    // Sterownik osobnym wywołaniem (bez jasności — toggle i tak jej nie
    // wysyła), potem segmenty. Bez gaszenia „świecących" segmentów.
    expect(calls).toEqual([
      { service: 'turn_on', ids: ['light.wled_main'] },
      { service: 'turn_on', ids: SEGS },
    ]);
    // Stan w toku: od razu widać „świeci".
    expect(anyLightOn(hass, SEGS)).toBe(true);
    expect(pendingWant(hass, 'light.wled_main')).toBe('on');
  });

  it('sterownik włączony: zachowanie bez zmian (tap gasi segmenty, sterownika nie dotyka)', () => {
    const { hass, calls } = ha([main('on'), on('light.seg1'), off('light.seg2')]);
    expect(anyLightOn(hass, SEGS)).toBe(true);
    toggleRoomLights(hass, SEGS);
    expect(calls).toEqual([{ service: 'turn_off', ids: ['light.seg1'] }]);
  });

  it('sterownik niedostępny (WLED z jednym segmentem): nigdy nie jest celem, segment czyta się sam', () => {
    const { hass, calls } = ha([
      entity('light.wled_main', 'unavailable', { group_entities: ['light.seg1'] }),
      off('light.seg1'),
    ]);
    toggleRoomLights(hass, ['light.seg1']);
    expect(calls).toEqual([{ service: 'turn_on', ids: ['light.seg1'] }]);
    const lit = ha([
      entity('light.wled_main', 'unavailable', { group_entities: ['light.seg1'] }),
      on('light.seg1'),
    ]);
    expect(anyLightOn(lit.hass, ['light.seg1'])).toBe(true);
  });

  it('pomocnik „Grupa świateł" (entity_id) zostaje przezroczysty — nie jest sterownikiem', () => {
    const { hass, calls } = ha([
      entity('light.grupa', 'off', { entity_id: ['light.a'] }),
      on('light.a'),
    ]);
    expect(anyLightOn(hass, ['light.a'])).toBe(true);
    toggleRoomLights(hass, ['light.a']);
    expect(calls).toEqual([{ service: 'turn_off', ids: ['light.a'] }]);
  });

  it('tap kafla segmentu przy zgaszonym sterowniku zapala też sterownik', () => {
    const { hass, calls } = ha([main('off'), on('light.seg1'), off('light.seg2')]);
    expect(tapPower(hass, 'light.seg1')).toBe(true);
    expect(calls).toEqual([
      { service: 'turn_on', ids: ['light.wled_main'] },
      { service: 'turn_on', ids: ['light.seg1'] },
    ]);
  });
});

describe('bramka zasilania tylko dla WLED (przegląd v1.109.0)', () => {
  it('grupa pokoju z innej integracji (group_entities) nie jest bramką', () => {
    const states: Record<string, HassEntity> = {
      'light.salon_room': entity('light.salon_room', 'off', { group_entities: ['light.b1', 'light.b2'] }),
      'light.b1': entity('light.b1', 'off', { supported_color_modes: ['brightness'] }),
      'light.b2': entity('light.b2', 'off', { supported_color_modes: ['brightness'] }),
    };
    const calls: Call[] = [];
    const hass = {
      states,
      entities: {
        'light.salon_room': { entity_id: 'light.salon_room', platform: 'hue' },
        'light.b1': { entity_id: 'light.b1', platform: 'hue' },
        'light.b2': { entity_id: 'light.b2', platform: 'hue' },
      },
      callService: (_d: string, service: string, _x: unknown, target?: { entity_id?: string | string[] }) => {
        calls.push({ service, ids: ([] as string[]).concat(target?.entity_id ?? []) });
        return Promise.resolve();
      },
    } as unknown as HomeAssistant;
    tapPower(hass, 'light.b1');
    expect(calls).toEqual([{ service: 'turn_on', ids: ['light.b1'] }]);
  });
});
