import { describe, expect, it } from 'vitest';
import {
  builtinModesForType,
  entityDomainsForType,
  retypeSection,
} from '../src/section-type-change.js';
import type { RoomSectionConfig } from '../src/types.js';

describe('retypeSection — zmiana typu sekcji w edytorze', () => {
  it('Światła (rail, 2 lampy) → Rolety: bez trybu rail i bez lamp', () => {
    const prev: RoomSectionConfig = {
      type: 'lights',
      mode: 'rail',
      entities: ['light.salon_0', 'light.salon_1'],
      columns: 2,
    };
    expect(retypeSection(prev, 'covers')).toEqual({ type: 'covers', columns: 2 });
  });

  it('zachowuje tytuł, ikonę, ukrycie i tryb wspólny dla obu typów', () => {
    const prev: RoomSectionConfig = {
      type: 'lights',
      mode: 'tile',
      title: 'Góra',
      icon: 'mdi:star',
      hidden: true,
    };
    expect(retypeSection(prev, 'switches')).toEqual({
      type: 'switches',
      mode: 'tile',
      title: 'Góra',
      icon: 'mdi:star',
      hidden: true,
    });
  });

  it('nie przenosi hidden: false', () => {
    expect(retypeSection({ type: 'lights', hidden: false }, 'fans')).toEqual({ type: 'fans' });
  });

  it('zostawia tylko encje z domen nowego typu', () => {
    const prev: RoomSectionConfig = {
      type: 'windows',
      entities: ['binary_sensor.okno', 'light.lampa'],
    };
    expect(retypeSection(prev, 'doors')).toEqual({
      type: 'doors',
      entities: ['binary_sensor.okno'],
    });
  });

  it('odrzuca tryby custom:* razem z card_template (szablony są per typ)', () => {
    const prev: RoomSectionConfig = {
      type: 'lights',
      mode: 'custom:bubble-card',
      card_template: { card_type: 'button', button_type: 'slider' },
    };
    expect(retypeSection(prev, 'covers')).toEqual({ type: 'covers' });
  });

  it('pola „tylko dla typu" nie przechodzą na inny typ', () => {
    const covers: RoomSectionConfig = {
      type: 'covers',
      master: true,
      positions: [30],
      entities: ['cover.roleta'],
    };
    expect(retypeSection(covers, 'media')).toEqual({ type: 'media' });

    const media: RoomSectionConfig = {
      type: 'media',
      mode: 'player',
      entity: 'media_player.tv',
      hide_when_off: true,
      volume_step: 5,
    };
    expect(retypeSection(media, 'lights')).toEqual({ type: 'lights' });
  });

  it('summary: bez columns i bez encji, ale z trybem chips', () => {
    const prev: RoomSectionConfig = {
      type: 'lights',
      mode: 'chips',
      columns: 3,
      entities: ['light.a'],
    };
    expect(retypeSection(prev, 'summary')).toEqual({ type: 'summary', mode: 'chips' });
  });

  it('custom: zostaje tylko typ i tytuł', () => {
    const prev: RoomSectionConfig = { type: 'summary', fields: ['motion'], mode: 'cards', title: 'X' };
    expect(retypeSection(prev, 'custom')).toEqual({ type: 'custom', title: 'X' });
  });

  it('ten sam typ — bez zmian (kopia)', () => {
    const prev: RoomSectionConfig = { type: 'covers', master: true, mode: 'slider' };
    const out = retypeSection(prev, 'covers');
    expect(out).toEqual(prev);
    expect(out).not.toBe(prev);
  });
});

describe('builtinModesForType / entityDomainsForType', () => {
  it('climate ma tryb tile z presetu, mimo braku listy trybów', () => {
    expect(builtinModesForType('climate').has('tile')).toBe(true);
  });

  it('rail jest trybem świateł, nie rolet', () => {
    expect(builtinModesForType('lights').has('rail')).toBe(true);
    expect(builtinModesForType('covers').has('rail')).toBe(false);
  });

  it('nigdy nie zwraca trybów custom:*', () => {
    for (const m of builtinModesForType('lights')) expect(m.startsWith('custom:')).toBe(false);
  });

  it('sceny przyjmują sceny i skrypty', () => {
    expect(entityDomainsForType('scenes')).toEqual(['scene', 'script']);
  });
});
