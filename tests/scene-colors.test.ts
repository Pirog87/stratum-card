import { describe, expect, it } from 'vitest';
import {
  SCENE_STORAGE_KEY,
  SceneConfigColors,
  liveSceneColors,
  sceneColorsFromConfig,
  type SceneStorage,
} from '../src/scene-colors.js';
import type { HomeAssistant } from '../src/types.js';
import { entity, makeHass } from './helpers.js';

/** Odpowiedź fetchWithAuth sterowana z testu (status + treść, ręczne rozwiązanie). */
interface Pending {
  path: string;
  resolve: (status: number, body?: unknown) => void;
  reject: () => void;
}

function sceneHass(opts: { admin?: boolean; scenes?: number } = {}): {
  hass: HomeAssistant;
  calls: Pending[];
  ids: string[];
} {
  const calls: Pending[] = [];
  const states: Record<string, ReturnType<typeof entity>> = {
    'light.a': entity('light.a', 'on', { rgb_color: [10, 200, 30], brightness: 128 }),
  };
  const ids: string[] = [];
  for (let i = 0; i < (opts.scenes ?? 3); i++) {
    const id = `scene.s${i}`;
    ids.push(id);
    states[id] = entity(id, 'scening', { id: `cfg${i}`, entity_id: ['light.a'] });
  }
  const hass = makeHass(states);
  hass.user = { is_admin: opts.admin ?? true };
  hass.fetchWithAuth = (path: string) =>
    new Promise<Response>((res, rej) => {
      calls.push({
        path,
        resolve: (status, body) =>
          res({
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
          } as Response),
        reject: () => rej(new Error('net')),
      });
    });
  return { hass, calls, ids };
}

function memStorage(): SceneStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

const RED_SCENE = { entities: { 'light.x': { state: 'on', rgb_color: [255, 0, 0], brightness: 51 } } };

describe('sceneColorsFromConfig', () => {
  it('bierze kolory zapalonych świateł i średnią jasność', () => {
    const out = sceneColorsFromConfig({
      entities: {
        'light.x': { state: 'on', rgb_color: [255, 0, 0], brightness: 255 },
        'light.y': { state: 'off', rgb_color: [0, 0, 255] },
        'switch.z': { state: 'on' },
      },
    });
    expect(out).toEqual({ colors: ['rgb(255, 0, 0)'], bri: 1 });
  });

  it('bez kolorów świateł → null (rysuje fallback na żywo)', () => {
    expect(sceneColorsFromConfig({ entities: { 'light.x': 'off' } })).toBeNull();
    expect(sceneColorsFromConfig(null)).toBeNull();
    expect(sceneColorsFromConfig('x')).toBeNull();
  });
});

describe('liveSceneColors', () => {
  it('ścieżka 2: bieżące kolory członków sceny', () => {
    const { hass } = sceneHass();
    expect(liveSceneColors(hass, 'scene.s0')).toEqual({
      colors: ['rgb(10, 200, 30)'],
      bri: 128 / 255,
    });
  });

  it('ścieżka 3: deterministyczny duet, gdy nic nie świeci', () => {
    const hass = makeHass({ 'scene.q': entity('scene.q', 'scening', {}) });
    const a = liveSceneColors(hass, 'scene.q');
    expect(a.colors).toHaveLength(2);
    expect(liveSceneColors(hass, 'scene.q')).toEqual(a);
    expect(liveSceneColors(undefined, 'scene.q')).toEqual(a);
  });
});

describe('SceneConfigColors', () => {
  it('nie-admin nie wysyła ani jednego zapytania', () => {
    const { hass, calls, ids } = sceneHass({ admin: false });
    const store = new SceneConfigColors();
    store.request(hass, ids);
    expect(calls).toHaveLength(0);
    expect(store.canFetch(hass)).toBe(false);
  });

  it('kolejka: najwyżej `concurrency` zapytań naraz, jedno powiadomienie na falę', async () => {
    const { hass, calls, ids } = sceneHass({ scenes: 5 });
    const store = new SceneConfigColors({ concurrency: 2 });
    let notified = 0;
    store.subscribe(() => notified++);
    store.request(hass, ids);
    expect(calls).toHaveLength(2);
    // Kolejny render z tymi samymi scenami nie dokłada niczego.
    store.request(hass, ids);
    expect(calls).toHaveLength(2);
    for (let i = 0; i < 5; i++) {
      calls[i]!.resolve(200, RED_SCENE);
      await flush();
    }
    expect(calls).toHaveLength(5);
    expect(store.inflight).toBe(0);
    expect(notified).toBe(1);
    expect(store.get(hass, 'scene.s3')).toEqual({ colors: ['rgb(255, 0, 0)'], bri: 0.2 });
    expect(calls[0]!.path).toBe('/api/config/scene/config/cfg0');
  });

  it('401/403 wyłącza ścieżkę 1 dla wszystkich scen i zapisuje odmowę', async () => {
    const storage = memStorage();
    const { hass, calls, ids } = sceneHass({ scenes: 4 });
    const store = new SceneConfigColors({ concurrency: 1, storage: () => storage });
    store.request(hass, ids);
    expect(calls).toHaveLength(1);
    calls[0]!.resolve(403);
    await flush();
    // Reszta kolejki porzucona — żadnej serii 403.
    expect(calls).toHaveLength(1);
    expect(store.canFetch(hass)).toBe(false);
    expect(JSON.parse(storage.data.get(SCENE_STORAGE_KEY)!).denied).toBeTypeOf('number');

    // Nowe załadowanie strony (nowa instancja) z tym samym sessionStorage.
    const { hass: hass2, calls: calls2, ids: ids2 } = sceneHass({ scenes: 4 });
    const again = new SceneConfigColors({ storage: () => storage });
    again.request(hass2, ids2);
    expect(calls2).toHaveLength(0);
  });

  it('wynik z sessionStorage rysuje pierwszy kadr bez zapytania', async () => {
    const storage = memStorage();
    const { hass, calls, ids } = sceneHass({ scenes: 1 });
    const first = new SceneConfigColors({ storage: () => storage });
    first.request(hass, ids);
    calls[0]!.resolve(200, RED_SCENE);
    await flush();

    const { hass: hass2, calls: calls2, ids: ids2 } = sceneHass({ scenes: 1 });
    const second = new SceneConfigColors({ storage: () => storage });
    expect(second.get(hass2, 'scene.s0')).toEqual({ colors: ['rgb(255, 0, 0)'], bri: 0.2 });
    second.request(hass2, ids2);
    expect(calls2).toHaveLength(0);
  });

  it('stary wpis rysuje kadr, ale jest raz odświeżany', async () => {
    const storage = memStorage();
    let now = 1_000_000;
    const { hass, calls, ids } = sceneHass({ scenes: 1 });
    const first = new SceneConfigColors({ storage: () => storage, now: () => now, ttlMs: 1000 });
    first.request(hass, ids);
    calls[0]!.resolve(200, RED_SCENE);
    await flush();
    now += 5000;
    const { hass: hass2, calls: calls2, ids: ids2 } = sceneHass({ scenes: 1 });
    const second = new SceneConfigColors({ storage: () => storage, now: () => now, ttlMs: 1000 });
    expect(second.get(hass2, 'scene.s0')).toBeDefined();
    second.request(hass2, ids2);
    second.request(hass2, ids2);
    expect(calls2).toHaveLength(1);
  });

  it('błąd sieci: bez ponawiania w tym załadowaniu i bez zapisu', async () => {
    const storage = memStorage();
    const { hass, calls, ids } = sceneHass({ scenes: 1 });
    const store = new SceneConfigColors({ storage: () => storage });
    store.request(hass, ids);
    calls[0]!.reject();
    await flush();
    store.request(hass, ids);
    expect(calls).toHaveLength(1);
    expect(store.get(hass, 'scene.s0')).toBeUndefined();
    expect(store.canFetch(hass)).toBe(true);
    expect(storage.data.has(SCENE_STORAGE_KEY)).toBe(false);
  });

  it('niedostępny / rzucający sessionStorage nie psuje cache w pamięci', async () => {
    const { hass, calls, ids } = sceneHass({ scenes: 1 });
    const store = new SceneConfigColors({
      storage: () => {
        throw new Error('SecurityError');
      },
    });
    store.request(hass, ids);
    calls[0]!.resolve(200, RED_SCENE);
    await flush();
    expect(store.get(hass, 'scene.s0')?.colors).toEqual(['rgb(255, 0, 0)']);
  });

  it('scena bez `attributes.id` (YAML) nie jest odpytywana', () => {
    const { hass, calls } = sceneHass({ scenes: 0 });
    hass.states['scene.yaml'] = entity('scene.yaml', 'scening', { entity_id: ['light.a'] });
    const store = new SceneConfigColors();
    store.request(hass, ['scene.yaml']);
    expect(calls).toHaveLength(0);
  });
});
