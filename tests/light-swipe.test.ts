import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LightSwipe,
  rememberBeforeOff,
  resetLightSwipeState,
} from '../src/light-swipe.js';
import type { HassEntity, HomeAssistant } from '../src/types.js';
import { entity } from './helpers.js';

interface Call {
  service: string;
  data: Record<string, unknown>;
  ids: string[];
}

/** Fałszywy HA: zapisuje wywołania; `echo()` nanosi je na stany jak prawdziwy. */
function fakeHa(initial: HassEntity[]) {
  const states: Record<string, HassEntity> = {};
  for (const s of initial) states[s.entity_id] = s;
  const calls: Call[] = [];
  let hold: Array<() => void> | undefined;
  const hass = {
    states,
    callService: (
      _domain: string,
      service: string,
      data: Record<string, unknown> = {},
      target?: { entity_id?: string | string[] },
    ) => {
      const ids = ([] as string[]).concat(target?.entity_id ?? []);
      calls.push({ service, data, ids });
      if (hold) return new Promise<void>((resolve) => hold!.push(resolve));
      return Promise.resolve();
    },
  } as unknown as HomeAssistant;
  return {
    hass,
    calls,
    states,
    /** Od teraz wywołania wiszą, aż zwolni je `release()`. */
    stall: () => {
      hold = [];
    },
    release: () => {
      const pending = hold ?? [];
      hold = undefined;
      pending.forEach((r) => r());
    },
    /** HA odsyła nowe stany dla wszystkich dotychczasowych komend. */
    echo: () => {
      for (const c of calls) {
        for (const id of c.ids) {
          const s = states[id];
          if (!s) continue;
          states[id] =
            c.service === 'turn_off'
              ? { ...s, state: 'off', attributes: { ...s.attributes, brightness: null } }
              : {
                  ...s,
                  state: 'on',
                  attributes: {
                    ...s.attributes,
                    ...(typeof c.data.brightness === 'number' ? { brightness: c.data.brightness } : {}),
                  },
                };
        }
      }
    },
    set: (id: string, patch: Partial<HassEntity>) => {
      states[id] = { ...states[id]!, ...patch };
    },
  };
}

const dim = (id: string, brightness: number) =>
  entity(id, 'on', { brightness, supported_color_modes: ['brightness'] });
const dark = (id: string) =>
  entity(id, 'off', { supported_color_modes: ['brightness'] });
const relay = (id: string, state = 'on') =>
  entity(id, state, { supported_color_modes: ['onoff'] });

const ROOM = ['light.a', 'light.b', 'light.c', 'light.d', 'light.e'];
const room = () =>
  fakeHa([dim('light.a', 255), dim('light.b', 51), dark('light.c'), dark('light.d'), dark('light.e')]);

const allIds = (calls: Call[]) => calls.flatMap((c) => c.ids);

beforeEach(() => {
  vi.useFakeTimers();
  resetLightSwipeState();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LightSwipe — tylko włączone, proporcjonalnie', () => {
  it('zgłoszony błąd: przeciągnięcie nie zapala zgaszonych i nie spłaszcza poziomów', () => {
    const ha = room();
    const sw = new LightSwipe('kuchnia', { hass: () => ha.hass });
    const { level, active } = sw.start(ROOM);
    expect(active).toBe(true);
    expect(level).toBeCloseTo(60, 5);

    sw.move(45);
    sw.move(33);
    const res = sw.end(33);

    expect(res).toEqual({ outcome: 'set', level: 33 });
    expect(ha.calls.every((c) => c.service === 'turn_on')).toBe(true);
    // Każda z dwóch świecących dostaje WŁASNĄ wartość (proporcja 5:1).
    const final = new Map(ha.calls.flatMap((c) => c.ids.map((id) => [id, c.data.brightness] as const)));
    expect(final.get('light.a')).toBe(140);
    expect(final.get('light.b')).toBe(28);
    // Zgaszone nie pojawiają się w ŻADNYM wywołaniu.
    for (const id of ['light.c', 'light.d', 'light.e']) expect(allIds(ha.calls)).not.toContain(id);
  });

  it('komendy idą przez target + brightness (nie brightness_pct w danych)', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.end(30);
    expect(ha.calls.length).toBe(2);
    for (const c of ha.calls) {
      expect(c.data).not.toHaveProperty('entity_id');
      expect(c.data).not.toHaveProperty('brightness_pct');
      expect(typeof c.data.brightness).toBe('number');
      expect(c.data.transition).toBe(0.4);
    }
  });

  it('powrót do punktu wyjścia bez fali po drodze = zero komend', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    const { level } = sw.start(ROOM);
    sw.move(100);
    sw.move(10);
    const res = sw.end(level);
    expect(res.outcome).toBe('noop');
    expect(ha.calls).toEqual([]);
  });

  it('pełne w prawo = wszystkie świecące na 100%, zgaszone dalej zgaszone', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.end(100);
    // a już jest na 255 — komenda tylko dla b.
    expect(ha.calls).toEqual([
      { service: 'turn_on', data: { brightness: 255, transition: 0.4 }, ids: ['light.b'] },
    ]);
  });
});

describe('LightSwipe — wysyłanie w trakcie ruchu', () => {
  it('pierwsza fala najwcześniej po jednym odstępie; szybkie machnięcie = jedna komenda', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.move(50);
    vi.advanceTimersByTime(150);
    sw.move(40);
    expect(ha.calls).toEqual([]);
    sw.end(40);
    expect(ha.calls.length).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(ha.calls.length).toBe(2);
  });

  it('fala na żywo bierze najnowszą pozycję, z przejściem równym odstępowi', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.move(55);
    sw.move(50);
    sw.move(42);
    await vi.advanceTimersByTimeAsync(300);
    expect(ha.calls.length).toBe(2);
    expect(ha.calls[0]!.data.transition).toBe(0.3);
    const a = ha.calls.find((c) => c.ids.includes('light.a'))!;
    // 255 · 42/60
    expect(a.data.brightness).toBe(179);
  });

  it('jedna fala w locie — kolejne pozycje nie tworzą kolejki', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    ha.stall();
    sw.move(40);
    await vi.advanceTimersByTimeAsync(300);
    const afterFirst = ha.calls.length;
    expect(afterFirst).toBe(2);
    // HA milczy; palec jedzie dalej przez sekundę.
    for (let i = 0; i < 20; i++) {
      sw.move(38 - i);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(ha.calls.length).toBe(afterFirst);
    // Odpowiedź przyszła → jedna następna fala z NAJNOWSZĄ pozycją.
    ha.release();
    await vi.advanceTimersByTimeAsync(400);
    expect(ha.calls.length).toBe(afterFirst + 2);
    const last = ha.calls[ha.calls.length - 2]!;
    expect(last.data.brightness).toBe(Math.round((255 * 19) / 60));
  });

  it('poniżej progu wyłączenia nic nie leci w trakcie — przejazd przez zero jest darmowy', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    const { level } = sw.start(ROOM);
    sw.move(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ha.calls).toEqual([]);
    expect(sw.end(level).outcome).toBe('noop');
    expect(ha.calls).toEqual([]);
  });

  it('duży pokój: w trakcie ruchu cisza, po puszczeniu jedna fala (3 wywołania na 23 światła)', async () => {
    const lights = [
      ...Array.from({ length: 18 }, (_, i) => dim(`light.k${i}`, 153)),
      ...Array.from({ length: 3 }, (_, i) => dim(`light.f${i}`, 255)),
      ...Array.from({ length: 2 }, (_, i) => dim(`light.d${i}`, 64)),
      ...Array.from({ length: 30 }, (_, i) => dark(`light.off${i}`)),
    ];
    const ha = fakeHa(lights);
    const sw = new LightSwipe('kuchnia', { hass: () => ha.hass });
    sw.start(lights.map((l) => l.entity_id));
    for (let t = 60; t >= 30; t -= 2) {
      sw.move(t);
      await vi.advanceTimersByTimeAsync(60);
    }
    expect(ha.calls).toEqual([]);
    sw.end(30);
    expect(ha.calls.map((c) => c.ids.length)).toEqual([3, 18, 2]);
    expect(allIds(ha.calls).some((id) => id.startsWith('light.off'))).toBe(false);
  });

  it('żarówka zgaszona przez kogoś w trakcie gestu nie jest zapalana z powrotem', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    ha.set('light.b', { state: 'off' });
    sw.move(40);
    await vi.advanceTimersByTimeAsync(300);
    sw.end(30);
    expect(allIds(ha.calls)).not.toContain('light.b');
    expect(allIds(ha.calls)).toContain('light.a');
  });
});

describe('LightSwipe — zgaszenie i przywracanie', () => {
  it('puszczenie na ≤2% gasi tylko to, co świeciło — jednym wywołaniem', () => {
    const ha = fakeHa([dim('light.a', 255), dim('light.b', 51), relay('light.r'), dark('light.c')]);
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(['light.a', 'light.b', 'light.r', 'light.c']);
    const res = sw.end(1);
    expect(res).toEqual({ outcome: 'off', level: 0 });
    expect(ha.calls).toEqual([
      { service: 'turn_off', data: {}, ids: ['light.a', 'light.b', 'light.r'] },
    ]);
  });

  it('następne przeciągnięcie z ciemności przywraca TEN SAM zestaw w tych samych proporcjach', () => {
    const ha = fakeHa([dim('light.a', 255), dim('light.b', 51), relay('light.r'), dark('light.c')]);
    const ids = ['light.a', 'light.b', 'light.r', 'light.c'];
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ids);
    sw.end(0);
    ha.echo();
    ha.calls.length = 0;

    const again = sw.start(ids);
    expect(again).toEqual({ level: 0, active: true });
    sw.move(60);
    const res = sw.end(60);
    expect(res.outcome).toBe('set');
    const byId = new Map(ha.calls.flatMap((c) => c.ids.map((id) => [id, c] as const)));
    expect(byId.get('light.a')!.data.brightness).toBe(255);
    expect(byId.get('light.b')!.data.brightness).toBe(51);
    expect(byId.get('light.r')!.data).toEqual({});
    expect(byId.has('light.c')).toBe(false);
  });

  it('pamięć nie działa, gdy ktoś w międzyczasie coś zapalił', () => {
    const ha = fakeHa([dim('light.a', 255), dark('light.c')]);
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(['light.a', 'light.c']);
    sw.end(0);
    ha.echo();
    ha.set('light.c', { state: 'on', attributes: { brightness: 100, supported_color_modes: ['brightness'] } });
    ha.calls.length = 0;
    // Świeci c → zwykły gest skalujący c; a zostaje zgaszone.
    const { level } = sw.start(['light.a', 'light.c']);
    expect(level).toBeCloseTo(39.2, 1);
    sw.end(20);
    expect(allIds(ha.calls)).toEqual(['light.c']);
  });

  it('mini-włącznik: rememberBeforeOff pozwala przywrócić zestaw suwakiem', () => {
    const ha = fakeHa([dim('light.a', 200), dim('light.b', 100), dark('light.c')]);
    const ids = ['light.a', 'light.b', 'light.c'];
    rememberBeforeOff('k', ha.hass, ids);
    ha.set('light.a', { state: 'off' });
    ha.set('light.b', { state: 'off' });
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    expect(sw.start(ids).active).toBe(true);
    sw.move(30);
    sw.end(30);
    expect(allIds(ha.calls).sort()).toEqual(['light.a', 'light.b']);
  });

  it('świecą same przekaźniki: środek suwaka nic nie robi, zero je gasi', () => {
    const ha = fakeHa([relay('light.r1'), relay('light.r2'), dark('light.c')]);
    const ids = ['light.r1', 'light.r2', 'light.c'];
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    expect(sw.start(ids)).toEqual({ level: 100, active: true });
    expect(sw.end(50)).toEqual({ outcome: 'noop', level: 100 });
    expect(ha.calls).toEqual([]);
    sw.start(ids);
    expect(sw.end(0).outcome).toBe('off');
    expect(ha.calls).toEqual([{ service: 'turn_off', data: {}, ids: ['light.r1', 'light.r2'] }]);
  });
});

describe('LightSwipe — gest z ciemnego pokoju', () => {
  const darkRoom = () => fakeHa([dark('light.a'), dark('light.b'), relay('light.r', 'off'), entity('light.x', 'unavailable', {})]);
  const ids = ['light.a', 'light.b', 'light.r', 'light.x'];

  it('drgnięcie palca (poniżej 8%) nie zapala niczego', () => {
    const ha = darkRoom();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    expect(sw.start(ids)).toEqual({ level: 0, active: true });
    sw.move(5);
    expect(sw.end(5)).toEqual({ outcome: 'noop', level: 0 });
    expect(ha.calls).toEqual([]);
  });

  it('domyślnie zapala wszystkie dostępne na jednym poziomie — dopiero po puszczeniu', async () => {
    const ha = darkRoom();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ids);
    sw.move(20);
    sw.move(40);
    await vi.advanceTimersByTimeAsync(1500);
    expect(ha.calls).toEqual([]);
    const res = sw.end(40);
    expect(res.outcome).toBe('set');
    expect(res.level).toBeCloseTo(40, 0);
    expect(ha.calls).toEqual([
      { service: 'turn_on', data: { brightness: 102, transition: 0.4 }, ids: ['light.a', 'light.b'] },
      { service: 'turn_on', data: {}, ids: ['light.r'] },
    ]);
  });

  it('uzbrojony gest cofnięty do zera nie zapala niczego', () => {
    const ha = darkRoom();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ids);
    sw.move(50);
    expect(sw.end(1).outcome).toBe('noop');
    expect(ha.calls).toEqual([]);
  });

  it("tryb 'none': ciemny pokój jest dla suwaka nieaktywny", () => {
    const ha = darkRoom();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    expect(sw.start(ids, 'none')).toEqual({ level: 0, active: false });
    sw.move(60);
    expect(sw.end(60).outcome).toBe('noop');
    expect(ha.calls).toEqual([]);
  });
});

describe('LightSwipe — przerwanie i szybkie powtórki', () => {
  it('przerwany gest bez wysłanej fali nie wysyła nic', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.move(20);
    sw.cancel();
    vi.advanceTimersByTime(2000);
    expect(ha.calls).toEqual([]);
  });

  it('przerwany gest po fali na żywo cofa do wartości startowych', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.move(30);
    await vi.advanceTimersByTimeAsync(300);
    ha.calls.length = 0;
    sw.cancel();
    await vi.advanceTimersByTimeAsync(10);
    const byId = new Map(ha.calls.flatMap((c) => c.ids.map((id) => [id, c.data.brightness] as const)));
    expect(byId.get('light.a')).toBe(255);
    expect(byId.get('light.b')).toBe(51);
  });

  it('drugi gest, zanim HA odeśle stany, startuje od wysłanych wartości', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.end(30);
    // hass dalej pokazuje 255 / 51 — echo jeszcze nie wróciło.
    const second = sw.start(ROOM);
    expect(second.level).toBeCloseTo(30, 0);
    ha.calls.length = 0;
    sw.end(15);
    const byId = new Map(ha.calls.flatMap((c) => c.ids.map((id) => [id, c.data.brightness] as const)));
    // 128 → 64, 26 → 13: proporcja z PIERWSZEGO gestu zachowana.
    expect(byId.get('light.a')).toBe(64);
    expect(byId.get('light.b')).toBe(13);
  });

  it('nowy stan z HA natychmiast wygrywa z naszą pamięcią komend', () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.end(30);
    // Ktoś przy ścianie zgasił a — HA raportuje nowy stan.
    ha.set('light.a', { state: 'off' });
    ha.calls.length = 0;
    sw.start(ROOM);
    sw.end(15);
    expect(allIds(ha.calls)).not.toContain('light.a');
  });

  it('dispose: żadnych komend po zniknięciu karty', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    sw.move(30);
    sw.dispose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(ha.calls).toEqual([]);
  });

  it('fala końcowa czeka na falę w locie, ale nie w nieskończoność', async () => {
    const ha = room();
    const sw = new LightSwipe('k', { hass: () => ha.hass });
    sw.start(ROOM);
    ha.stall();
    sw.move(40);
    await vi.advanceTimersByTimeAsync(300);
    const live = ha.calls.length;
    expect(sw.end(20).outcome).toBe('set');
    // Fala pośrednia wisi — finał jeszcze nie poszedł…
    expect(ha.calls.length).toBe(live);
    // …ale po 600 ms idzie mimo to.
    await vi.advanceTimersByTimeAsync(600);
    expect(ha.calls.length).toBe(live + 2);
    const a = ha.calls.filter((c) => c.ids.includes('light.a')).pop()!;
    expect(a.data.brightness).toBe(85);
  });
});
