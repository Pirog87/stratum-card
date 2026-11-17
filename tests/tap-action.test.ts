import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENTITY_UI_ACTIONS,
  ROW_UI_ACTIONS,
  resolveTapAction,
  runTapAction,
  tapMayChangeState,
} from '../src/tap-action.js';
import { registerGuardSource } from '../src/back-guard.js';
import { mergeCustomTileConfig } from '../src/custom-cards.js';
import type { HassEntity, HomeAssistant, TapActionConfig } from '../src/types.js';
import { entity } from './helpers.js';

type Call = [string, string, Record<string, unknown> | undefined, unknown];

function fakeHass(
  states: Record<string, HassEntity> = {},
  fail = false,
): { hass: HomeAssistant; calls: Call[] } {
  const calls: Call[] = [];
  const hass = {
    states,
    callService: (d: string, s: string, data?: Record<string, unknown>, target?: unknown) => {
      calls.push([d, s, data, target]);
      return fail ? Promise.reject(new Error('boom')) : Promise.resolve();
    },
  } as unknown as HomeAssistant;
  return { hass, calls };
}

function fakeSource(): { source: HTMLElement; events: CustomEvent[] } {
  const events: CustomEvent[] = [];
  const source = {
    dispatchEvent: (ev: Event) => {
      events.push(ev as CustomEvent);
      return true;
    },
  } as unknown as HTMLElement;
  return { source, events };
}

const act = (a: unknown): TapActionConfig => a as TapActionConfig;

describe('resolveTapAction', () => {
  it('perform-action: usługa + data + target osobno', () => {
    const { hass } = fakeHass();
    expect(
      resolveTapAction(
        hass,
        act({
          action: 'perform-action',
          perform_action: 'script.wieczor',
          data: { speed: 2 },
          target: { area_id: 'salon' },
        }),
        {},
      ),
    ).toEqual({
      kind: 'service',
      domain: 'script',
      service: 'wieczor',
      data: { speed: 2 },
      target: { area_id: 'salon' },
    });
  });

  it('call-service: `data` z edytora HA ma pierwszeństwo, `service_data` jako fallback', () => {
    const { hass } = fakeHass();
    const withData = resolveTapAction(
      hass,
      act({ action: 'call-service', service: 'light.turn_on', data: { brightness: 50 } }),
      {},
    );
    expect(withData).toMatchObject({ data: { brightness: 50 } });
    const legacy = resolveTapAction(
      hass,
      act({ action: 'call-service', service: 'light.turn_on', service_data: { brightness: 10 } }),
      {},
    );
    expect(legacy).toMatchObject({ domain: 'light', service: 'turn_on', data: { brightness: 10 } });
    expect(legacy).not.toHaveProperty('target');
  });

  it('usługa bez hass albo z niepełną nazwą = nieobsłużona', () => {
    expect(
      resolveTapAction(undefined, act({ action: 'perform-action', perform_action: 'a.b' }), {}),
    ).toBeNull();
    const { hass } = fakeHass();
    expect(resolveTapAction(hass, act({ action: 'perform-action', perform_action: 'zly' }), {})).toBeNull();
    expect(resolveTapAction(hass, act({ action: 'perform-action' }), {})).toBeNull();
  });

  it('more-info: encja z akcji, inaczej encja kontekstu, inaczej nic', () => {
    expect(resolveTapAction(undefined, act({ action: 'more-info', entity: 'light.a' }), { entity_id: 'light.b' }))
      .toEqual({ kind: 'more-info', entityId: 'light.a' });
    expect(resolveTapAction(undefined, act({ action: 'more-info' }), { entity_id: 'light.b' }))
      .toEqual({ kind: 'more-info', entityId: 'light.b' });
    expect(resolveTapAction(undefined, act({ action: 'more-info' }), {})).toBeNull();
  });

  it('toggle: homeassistant.toggle na encji kontekstu; scena/przycisk/zamek po swojemu', () => {
    const { hass } = fakeHass({ 'lock.drzwi': entity('lock.drzwi', 'locked') });
    expect(resolveTapAction(hass, act({ action: 'toggle' }), { entity_id: 'light.a' })).toEqual({
      kind: 'service',
      domain: 'homeassistant',
      service: 'toggle',
      data: { entity_id: 'light.a' },
    });
    expect(resolveTapAction(hass, act({ action: 'toggle' }), { entity_id: 'scene.kino' }))
      .toMatchObject({ domain: 'scene', service: 'turn_on' });
    expect(resolveTapAction(hass, act({ action: 'toggle' }), { entity_id: 'button.dzwonek' }))
      .toMatchObject({ domain: 'button', service: 'press' });
    expect(resolveTapAction(hass, act({ action: 'toggle' }), { entity_id: 'lock.drzwi' }))
      .toMatchObject({ domain: 'lock', service: 'unlock' });
    expect(resolveTapAction(hass, act({ action: 'toggle' }), {})).toBeNull();
  });

  it('navigate/url bez ścieżki = nieobsłużone (dawniej wyjątek)', () => {
    expect(resolveTapAction(undefined, act({ action: 'navigate' }), {})).toBeNull();
    expect(resolveTapAction(undefined, act({ action: 'url' }), {})).toBeNull();
  });

  it('navigate/url: podstawienie {area_id} i {area_name}', () => {
    expect(
      resolveTapAction(undefined, act({ action: 'navigate', navigation_path: '/dom/{area_id}' }), {
        area_id: 'salon',
      }),
    ).toEqual({ kind: 'navigate', path: '/dom/salon' });
    expect(
      resolveTapAction(undefined, act({ action: 'url', url_path: 'https://x/?q={area_name}' }), {
        area_name: 'Pokój dzienny',
      }),
    ).toEqual({ kind: 'url', url: 'https://x/?q=Pok%C3%B3j%20dzienny', newTab: true });
  });

  it('none, popup, toggle-lights, assist, default i brak akcji = nieobsłużone', () => {
    const { hass } = fakeHass();
    for (const a of ['none', 'popup', 'toggle-lights', 'assist', 'default']) {
      expect(resolveTapAction(hass, act({ action: a }), { entity_id: 'light.a' })).toBeNull();
    }
    expect(resolveTapAction(hass, undefined, {})).toBeNull();
  });
});

describe('runTapAction', () => {
  beforeEach(() => {
    vi.stubGlobal('history', { pushState: vi.fn() });
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      open: vi.fn(),
      location: { href: '' },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('perform-action woła callService z target jako 4. argumentem i zwraca true', () => {
    const { hass, calls } = fakeHass();
    const { source } = fakeSource();
    const ok = runTapAction(
      hass,
      act({ action: 'perform-action', perform_action: 'script.x', data: { a: 1 }, target: { entity_id: 'light.a' } }),
      { source },
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([['script', 'x', { a: 1 }, { entity_id: 'light.a' }]]);
  });

  it('more-info emituje hass-more-info ze źródła z encją kontekstu', () => {
    const { source, events } = fakeSource();
    expect(runTapAction(undefined, act({ action: 'more-info' }), { source, entity_id: 'light.a' })).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('hass-more-info');
    expect(events[0]!.detail).toEqual({ entityId: 'light.a' });
    expect(events[0]!.bubbles).toBe(true);
    expect(events[0]!.composed).toBe(true);
  });

  it('navigate: pushState + location-changed', () => {
    const { source } = fakeSource();
    expect(runTapAction(undefined, act({ action: 'navigate', navigation_path: '/a' }), { source })).toBe(true);
    expect(history.pushState).toHaveBeenCalledWith(null, '', '/a');
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('navigate na inny widok z otwartego popupu (strażnik na szczycie): replaceState', () => {
    vi.stubGlobal('history', { state: { stratum: true }, pushState: vi.fn(), replaceState: vi.fn() });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), location: { href: 'http://ha.local/dom/parter' } });
    const unregister = registerGuardSource(() => [{ kind: 'room', index: null }]);
    try {
      const { source } = fakeSource();
      expect(runTapAction(undefined, act({ action: 'navigate', navigation_path: '/b' }), { source })).toBe(true);
    } finally {
      unregister();
    }
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/b');
    expect(history.pushState).not.toHaveBeenCalled();
    const ev = vi.mocked(window.dispatchEvent).mock.calls[0]![0] as CustomEvent;
    expect(ev.type).toBe('location-changed');
    expect(ev.detail).toEqual({ replace: true });
  });

  it('navigate na hash z popupu (pop-up Bubble Card): pushState — kolejna warstwa', () => {
    vi.stubGlobal('history', { state: { stratum: true }, pushState: vi.fn(), replaceState: vi.fn() });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), location: { href: 'http://ha.local/dom/parter' } });
    const unregister = registerGuardSource(() => [{ kind: 'room', index: null }]);
    try {
      const { source } = fakeSource();
      runTapAction(undefined, act({ action: 'navigate', navigation_path: '#salon' }), { source });
    } finally {
      unregister();
    }
    expect(history.pushState).toHaveBeenCalledWith(null, '', '#salon');
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('stan strażnika bez żywej karty (popup już zamknięty): pushState', () => {
    vi.stubGlobal('history', { state: { stratum: true }, pushState: vi.fn(), replaceState: vi.fn() });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), location: { href: 'http://ha.local/dom/parter' } });
    const { source } = fakeSource();
    runTapAction(undefined, act({ action: 'navigate', navigation_path: '/b' }), { source });
    expect(history.pushState).toHaveBeenCalledWith(null, '', '/b');
  });

  it('url: nowa karta domyślnie, ta sama przy new_tab: false', () => {
    const { source } = fakeSource();
    runTapAction(undefined, act({ action: 'url', url_path: 'https://a' }), { source });
    expect(window.open).toHaveBeenCalledWith('https://a', '_blank', 'noopener');
    runTapAction(undefined, act({ action: 'url', url_path: 'https://b', new_tab: false }), { source });
    expect(window.location.href).toBe('https://b');
  });

  it('nieobsłużona akcja zwraca false i niczego nie wysyła', () => {
    const { hass, calls } = fakeHass();
    const { source, events } = fakeSource();
    expect(runTapAction(hass, act({ action: 'toggle' }), { source })).toBe(false);
    expect(runTapAction(hass, act({ action: 'assist' }), { source })).toBe(false);
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('odrzucona usługa nie wylatuje jako nieobsłużony wyjątek', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { hass } = fakeHass({}, true);
    const { source } = fakeSource();
    expect(runTapAction(hass, act({ action: 'toggle' }), { source, entity_id: 'light.a' })).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('tapMayChangeState', () => {
  // Kafel grupy świateł porzuca trzymaną jasność tylko przed akcją, która
  // może przełączyć światło — inaczej pasek kłamie do 6 s nad zgaszonym.
  it('toggle i usługi zmieniają stan', () => {
    expect(tapMayChangeState({ action: 'toggle' })).toBe(true);
    expect(tapMayChangeState({ action: 'toggle', entity: 'light.x' })).toBe(true);
    expect(
      tapMayChangeState({ action: 'perform-action', perform_action: 'light.turn_off' }),
    ).toBe(true);
    expect(
      tapMayChangeState({ action: 'call-service', service: 'light.toggle' } as TapActionConfig),
    ).toBe(true);
  });

  it('akcje tylko patrzące i none zostawiają trzymaną wartość', () => {
    expect(tapMayChangeState(undefined)).toBe(false);
    expect(tapMayChangeState({ action: 'none' })).toBe(false);
    expect(tapMayChangeState({ action: 'more-info' })).toBe(false);
    expect(tapMayChangeState({ action: 'navigate', navigation_path: '/x' })).toBe(false);
    expect(tapMayChangeState({ action: 'url', url_path: 'https://x' })).toBe(false);
  });

  it('nieznany typ liczony jako zmiana', () => {
    expect(tapMayChangeState({ action: 'assist' } as unknown as TapActionConfig)).toBe(true);
  });
});

describe('listy akcji edytora', () => {
  it('bez assist; wiersz bez more-info/toggle', () => {
    expect(ROW_UI_ACTIONS).not.toContain('assist');
    expect(ENTITY_UI_ACTIONS).not.toContain('assist');
    expect(ROW_UI_ACTIONS).not.toContain('more-info');
    expect(ROW_UI_ACTIONS).not.toContain('toggle');
    expect(ENTITY_UI_ACTIONS).toEqual(expect.arrayContaining(['more-info', 'toggle', 'perform-action']));
  });
});

describe('mergeCustomTileConfig', () => {
  const base = { type: 'custom:bubble-card', entity: 'light.a', tap_action: { action: 'more-info' }, show_icon: true };

  it('override pozycji wygrywa z template i auto-configiem, type/entity nietykalne', () => {
    const cfg = mergeCustomTileConfig(
      { name: 'Z template', icon: 'mdi:x', type: 'custom:inna', entity: 'light.zla', fill: true },
      { name: 'Lampa', icon: 'mdi:star', tap_action: { action: 'toggle' } },
      base,
    );
    expect(cfg).toEqual({
      type: 'custom:bubble-card',
      entity: 'light.a',
      name: 'Lampa',
      icon: 'mdi:star',
      tap_action: { action: 'toggle' },
      show_icon: true,
      fill: true,
    });
  });

  it('bez override: template pod auto-configiem jak dawniej', () => {
    const cfg = mergeCustomTileConfig({ show_icon: false, name: 'T' }, {}, base);
    expect(cfg).toEqual({ ...base, name: 'T' });
  });
});
