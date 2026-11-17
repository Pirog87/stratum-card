import { describe, expect, it } from 'vitest';
import { TileDataPass } from '../src/tile-data-pass.js';
import type { TileData } from '../src/tile-data.js';
import type { HassEntityRegistryEntry, HomeAssistant, TileFieldEntities } from '../src/types.js';
import { entity, entry, makeHass } from './helpers.js';

function counting() {
  let calls = 0;
  const pass = new TileDataPass(() => {
    calls += 1;
    return { lightsOn: calls } as unknown as TileData;
  });
  return { pass, calls: () => calls };
}

describe('TileDataPass — dane wiersza raz na render', () => {
  const hass = makeHass({});
  const kuchnia: HassEntityRegistryEntry[] = [entry('light.k1')];
  const salon: HassEntityRegistryEntry[] = [entry('light.s1')];

  it('belka i lista w jednym renderze liczą każdy pokój raz', () => {
    const { pass, calls } = counting();
    pass.begin(hass);
    const stripe = pass.get(hass, kuchnia);
    pass.get(hass, salon);
    const row = pass.get(hass, kuchnia);
    expect(row).toBe(stripe);
    expect(calls()).toBe(2);
  });

  it('inne field_entities tego samego pokoju to osobny wynik', () => {
    const { pass, calls } = counting();
    const fields: TileFieldEntities = { lights: ['light.k1'] };
    pass.begin(hass);
    pass.get(hass, kuchnia);
    pass.get(hass, kuchnia, fields);
    pass.get(hass, kuchnia, fields);
    expect(calls()).toBe(2);
  });

  it('nowy render liczy od nowa, nawet przy tym samym hass (stan „w toku")', () => {
    const { pass, calls } = counting();
    pass.begin(hass);
    const a = pass.get(hass, kuchnia);
    pass.begin(hass);
    const b = pass.get(hass, kuchnia);
    expect(b).not.toBe(a);
    expect(calls()).toBe(2);
  });

  it('inny hass niż na początku renderu — bez starego wyniku', () => {
    const { pass, calls } = counting();
    const other = makeHass({}) as HomeAssistant;
    pass.begin(hass);
    pass.get(hass, kuchnia);
    pass.get(other, kuchnia);
    expect(calls()).toBe(2);
  });

  it('domyślnie liczy prawdziwym computeTileData', () => {
    const real = makeHass({ 'light.k1': entity('light.k1', 'on', { brightness: 255 }) });
    const pass = new TileDataPass();
    pass.begin(real);
    expect(pass.get(real, kuchnia).lightsOn).toBe(1);
  });
});
