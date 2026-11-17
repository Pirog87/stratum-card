import { describe, expect, it } from 'vitest';
import { activationFailed, sceneTapPlan } from '../src/scene-activation.js';
import { entity, makeHass } from './helpers.js';

describe('sceneTapPlan', () => {
  const hass = makeHass({
    'scene.ok': entity('scene.ok', '2026-01-01T00:00:00'),
    'scene.dead': entity('scene.dead', 'unavailable'),
  });

  it('dostępna scena → stan „w toku"', () => {
    expect(sceneTapPlan(hass, 'scene.ok')).toBe('pending');
  });

  it('scena nieznana albo niedostępna → czekamy na wynik wywołania', () => {
    expect(sceneTapPlan(hass, 'scene.dead')).toBe('await');
    expect(sceneTapPlan(hass, 'scene.renamed')).toBe('await');
    expect(sceneTapPlan(undefined, 'scene.ok')).toBe('await');
  });

  it('skrypt / automatyzacja → krótki błysk jak dotąd', () => {
    expect(sceneTapPlan(hass, 'script.x')).toBe('ack');
    expect(sceneTapPlan(hass, 'automation.y')).toBe('ack');
  });
});

describe('activationFailed', () => {
  it('przyjęte polecenie → false', async () => {
    expect(await activationFailed(() => Promise.resolve({}))).toBe(false);
  });

  it('odrzucone polecenie → true, bez nieobsłużonego odrzucenia', async () => {
    expect(await activationFailed(() => Promise.reject(new Error('not found')))).toBe(true);
  });

  it('wyjątek synchroniczny → true', async () => {
    expect(
      await activationFailed(() => {
        throw new Error('boom');
      }),
    ).toBe(true);
  });
});
