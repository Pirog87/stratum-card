import { describe, expect, it } from 'vitest';
import {
  SCENE_MAX_MS,
  SCENE_NO_ECHO_MS,
  SCENE_QUIET_MS,
  sceneSettled,
  startScenePending,
} from '../src/scene-pending.js';
import type { HassEntity, HomeAssistant } from '../src/types.js';
import { entity } from './helpers.js';

function world() {
  const states: Record<string, HassEntity> = {
    'scene.wieczor': entity('scene.wieczor', '2026-01-01T00:00:00Z', { entity_id: ['light.a', 'light.b', 'light.c'] }),
    'light.a': entity('light.a', 'off'),
    'light.b': entity('light.b', 'off'),
    'light.c': entity('light.c', 'off'),
  };
  const hass = { states } as unknown as HomeAssistant;
  const report = (id: string) => {
    states[id] = { ...states[id]!, state: 'on' };
  };
  return { hass, report };
}

describe('scena w toku', () => {
  it('trwa, dopóki lampy raportują; kończy się po ciszy', () => {
    const { hass, report } = world();
    const p = startScenePending(hass, 'scene.wieczor', 0);
    expect(sceneSettled(p, hass, 300)).toBe(false);
    report('light.a');
    expect(sceneSettled(p, hass, 600)).toBe(false);
    report('light.b');
    expect(sceneSettled(p, hass, 1200)).toBe(false);
    // c już było w stanie sceny i nie zaraportuje — cisza kończy.
    expect(sceneSettled(p, hass, 1200 + SCENE_QUIET_MS)).toBe(true);
  });

  it('kończy się od razu, gdy zaraportowali wszyscy', () => {
    const { hass, report } = world();
    const p = startScenePending(hass, 'scene.wieczor', 0);
    report('light.a');
    report('light.b');
    report('light.c');
    expect(sceneSettled(p, hass, 400)).toBe(true);
  });

  it('bez żadnego raportu puszcza po krótkim czasie', () => {
    const { hass } = world();
    const p = startScenePending(hass, 'scene.wieczor', 0);
    expect(sceneSettled(p, hass, SCENE_NO_ECHO_MS - 1)).toBe(false);
    expect(sceneSettled(p, hass, SCENE_NO_ECHO_MS)).toBe(true);
  });

  it('bezpiecznik: najdłużej SCENE_MAX_MS, nawet gdy lampy wciąż raportują', () => {
    const { hass } = world();
    const p = startScenePending(hass, 'scene.wieczor', 0);
    let t = 0;
    for (const id of ['light.a', 'light.b']) {
      t += 300;
      hass.states[id] = { ...hass.states[id]!, state: 'on' };
      expect(sceneSettled(p, hass, t)).toBe(false);
    }
    expect(sceneSettled(p, hass, SCENE_MAX_MS)).toBe(true);
  });

  it('scena bez listy członków: zachowuje się jak brak raportów', () => {
    const hass = { states: { 'scene.x': entity('scene.x', 'x') } } as unknown as HomeAssistant;
    const p = startScenePending(hass, 'scene.x', 0);
    expect(sceneSettled(p, hass, 500)).toBe(false);
    expect(sceneSettled(p, hass, SCENE_NO_ECHO_MS)).toBe(true);
  });
});
