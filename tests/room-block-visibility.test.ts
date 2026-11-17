import { describe, expect, it } from 'vitest';
import {
  coreSectionVisibility,
  isBlockHidden,
  resolvePopupOrder,
  setBlocksHidden,
  toggleCoreSectionHidden,
} from '../src/room-block-visibility.js';
import { applyRoomPatch } from '../src/room-list-config.js';
import { DEFAULT_POPUP_ORDER } from '../src/types.js';
import type { RoomConfig, RoomPopupSectionKey } from '../src/types.js';

/** Odwzorowanie reguły karty (stratum-room-card `_renderOrderedBlocks`). */
function cardHides(room: RoomConfig, key: RoomPopupSectionKey): boolean {
  const order = resolvePopupOrder(room);
  if (order.find((i) => i.section === key)?.hidden) return true;
  const type =
    key === 'light_groups' || key === 'light_entities'
      ? 'lights'
      : key === 'extra'
      ? undefined
      : key;
  if (!type) return false;
  const secs = (room.sections ?? []).map((s) => (typeof s === 'string' ? { type: s } : s));
  return Boolean(secs.find((s) => s.type === type)?.hidden);
}

/** Zastosuj patch tak, jak robi to edytor (z tym samym sprzątaniem). */
function apply(room: RoomConfig, patch: Partial<RoomConfig>): RoomConfig {
  return applyRoomPatch(room, patch);
}

describe('resolvePopupOrder', () => {
  it('bez configu = domyślna kolejność', () => {
    expect(resolvePopupOrder(undefined).map((i) => i.section)).toEqual(DEFAULT_POPUP_ORDER);
  });

  it('config na początku, brakujące doklejone, nieznane pominięte', () => {
    const room = {
      area_id: 'salon',
      popup_order: [{ section: 'media' }, { section: 'bogus' }],
    } as unknown as RoomConfig;
    expect(resolvePopupOrder(room).map((i) => i.section)).toEqual([
      'media',
      'scenes',
      'light_groups',
      'light_entities',
      'covers',
      'extra',
    ]);
  });
});

describe('isBlockHidden — ten sam stan co karta', () => {
  it('hidden na sekcji lights chowa oba bloki świateł', () => {
    const room: RoomConfig = { area_id: 'salon', sections: [{ type: 'lights', hidden: true }] };
    expect(isBlockHidden(room, 'light_groups')).toBe(true);
    expect(isBlockHidden(room, 'light_entities')).toBe(true);
    expect(isBlockHidden(room, 'covers')).toBe(false);
  });

  it('hidden w popup_order chowa tylko swój blok', () => {
    const room: RoomConfig = {
      area_id: 'salon',
      popup_order: [{ section: 'light_groups', hidden: true }],
    };
    expect(isBlockHidden(room, 'light_groups')).toBe(true);
    expect(isBlockHidden(room, 'light_entities')).toBe(false);
  });

  it('hidden sekcji okien nie dotyczy bloku extra (to robi pętla extra)', () => {
    const room: RoomConfig = { area_id: 'salon', sections: [{ type: 'windows', hidden: true }] };
    expect(isBlockHidden(room, 'extra')).toBe(false);
  });
});

describe('coreSectionVisibility', () => {
  it('częściowo ukryte światła = partial', () => {
    const room: RoomConfig = {
      area_id: 'salon',
      popup_order: [{ section: 'light_entities', hidden: true }],
    };
    expect(coreSectionVisibility(room)).toEqual({
      scenes: 'visible',
      lights: 'partial',
      covers: 'visible',
      media: 'visible',
    });
  });

  it('rolety ukryte nagłówkiem bloku widać jako ukryte w sekcjach', () => {
    const room: RoomConfig = { area_id: 'salon', popup_order: [{ section: 'covers', hidden: true }] };
    expect(coreSectionVisibility(room).covers).toBe('hidden');
  });
});

describe('setBlocksHidden — jedno źródło prawdy (RV-4)', () => {
  it('ukrycie bloku zapisuje popup_order, sekcji nie rusza', () => {
    const room: RoomConfig = { area_id: 'salon', sections: [{ type: 'covers', title: 'Żaluzje' }] };
    const patch = setBlocksHidden(room, ['covers'], true);
    expect(patch.sections).toBeUndefined();
    const next = apply(room, patch);
    expect(cardHides(next, 'covers')).toBe(true);
    expect(next.sections).toEqual([{ type: 'covers', title: 'Żaluzje' }]);
  });

  it('„Pokaż" na nagłówku odkrywa blok schowany okiem sekcji', () => {
    const room: RoomConfig = {
      area_id: 'salon',
      sections: [{ type: 'covers', title: 'Żaluzje', hidden: true }],
    };
    expect(isBlockHidden(room, 'covers')).toBe(true);
    const next = apply(room, setBlocksHidden(room, ['covers'], false));
    expect(cardHides(next, 'covers')).toBe(false);
    // Tytuł zostaje, `hidden` zdjęte z sekcji; popup_order wrócił do defaultu.
    expect(next.sections).toEqual([{ type: 'covers', title: 'Żaluzje' }]);
    expect(next.popup_order).toBeUndefined();
  });

  it('pokazanie grup świateł nie odkrywa encji schowanych sekcją lights', () => {
    const room: RoomConfig = { area_id: 'salon', sections: [{ type: 'lights', hidden: true }] };
    const next = apply(room, setBlocksHidden(room, ['light_groups'], false));
    expect(cardHides(next, 'light_groups')).toBe(false);
    expect(cardHides(next, 'light_entities')).toBe(true);
    expect(next.sections).toEqual([{ type: 'lights' }]);
  });

  it('migracja nie zmienia renderu pozostałych bloków', () => {
    const room: RoomConfig = {
      area_id: 'salon',
      sections: [
        { type: 'media', hidden: true },
        { type: 'windows', hidden: true },
        'covers',
      ],
      popup_order: [{ section: 'scenes', hidden: true }],
    };
    const next = apply(room, setBlocksHidden(room, ['covers'], true));
    for (const key of DEFAULT_POPUP_ORDER) {
      const expected = key === 'covers' ? true : cardHides(room, key);
      expect(cardHides(next, key), key).toBe(expected);
    }
    // Sekcja spoza rdzenia (windows) zachowuje swoje `hidden` — chowa ją pętla extra.
    expect(next.sections).toEqual([{ type: 'media' }, { type: 'windows', hidden: true }, 'covers']);
  });

  it('kolejność bloków przeżywa przełączanie widoczności', () => {
    const room: RoomConfig = {
      area_id: 'salon',
      popup_order: [{ section: 'media' }, { section: 'covers' }],
    };
    const next = apply(room, setBlocksHidden(room, ['covers'], true));
    expect(next.popup_order?.slice(0, 2)).toEqual([
      { section: 'media' },
      { section: 'covers', hidden: true },
    ]);
  });
});

describe('toggleCoreSectionHidden — oko w „Dodatkowych sekcjach"', () => {
  it('chowa oba bloki świateł i pokazuje je z powrotem', () => {
    const room: RoomConfig = { area_id: 'salon' };
    const hidden = apply(room, toggleCoreSectionHidden(room, 'lights'));
    expect(cardHides(hidden, 'light_groups')).toBe(true);
    expect(cardHides(hidden, 'light_entities')).toBe(true);
    expect(coreSectionVisibility(hidden).lights).toBe('hidden');
    const shown = apply(hidden, toggleCoreSectionHidden(hidden, 'lights'));
    expect(coreSectionVisibility(shown).lights).toBe('visible');
    expect(shown).toEqual({ area_id: 'salon' });
  });

  it('partial → ukrywa oba bloki', () => {
    const room: RoomConfig = {
      area_id: 'salon',
      popup_order: [{ section: 'light_groups', hidden: true }],
    };
    const next = apply(room, toggleCoreSectionHidden(room, 'lights'));
    expect(coreSectionVisibility(next).lights).toBe('hidden');
  });

  it('stary YAML z section.hidden: oko pokazuje „ukryta" i jedno kliknięcie odkrywa', () => {
    const room: RoomConfig = { area_id: 'salon', sections: [{ type: 'media', hidden: true }] };
    expect(coreSectionVisibility(room).media).toBe('hidden');
    const next = apply(room, toggleCoreSectionHidden(room, 'media'));
    expect(cardHides(next, 'media')).toBe(false);
    expect(next.sections).toEqual([{ type: 'media' }]);
  });
});
