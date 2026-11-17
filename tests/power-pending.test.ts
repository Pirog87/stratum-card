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

function ha(initial: HassEntity[]) {
  const states: Record<string, HassEntity> = {};
  for (const s of initial) states[s.entity_id] = s;
  const calls: Call[] = [];
  const hass = {
    states,
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
