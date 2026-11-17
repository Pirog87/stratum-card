import { describe, expect, it } from 'vitest';
import {
  applyRoomPatch,
  compactRooms,
  deselectAllRooms,
  materializeRooms,
  moveRoomInList,
  roomHasConfig,
  roomPosition,
  selectAllRooms,
  toggleRoomInList,
  updateRoomInList,
} from '../src/room-list-config.js';
import type { RoomConfig } from '../src/types.js';

// Piętro w kolejności HA — tak renderuje auto-discover (pusta lista rooms).
const FLOOR = ['salon', 'kuchnia', 'lazienka', 'sypialnia'];

/** Config popupu bez name/icon — dokładnie przypadek, który ginął (ED-2). */
const SALON_POPUP: RoomConfig = {
  area_id: 'salon',
  lights: { items: [{ entity: 'light.salon_sufit', name: 'Sufit' }] },
  sections: [{ type: 'covers', master: true }],
  chips: [{ type: 'lights' }],
  popup_order: [
    { section: 'covers' },
    { section: 'scenes' },
    { section: 'light_groups' },
    { section: 'light_entities' },
    { section: 'media' },
    { section: 'extra' },
  ],
};

describe('roomHasConfig', () => {
  it('sam area_id i hidden to nie config', () => {
    expect(roomHasConfig({ area_id: 'salon' })).toBe(false);
    expect(roomHasConfig({ area_id: 'salon', hidden: true })).toBe(false);
  });

  it('config popupu (lights/sections/chips) liczy się jak name/icon', () => {
    expect(roomHasConfig({ area_id: 'salon', chips: [{ type: 'lights' }] })).toBe(true);
    expect(roomHasConfig({ area_id: 'salon', sections: [{ type: 'covers' }] })).toBe(true);
    expect(roomHasConfig({ area_id: 'salon', style_override: 'color: red' })).toBe(true);
  });

  it('klucz z wartością undefined nie jest configiem', () => {
    expect(roomHasConfig({ area_id: 'salon', name: undefined })).toBe(false);
  });
});

describe('materializeRooms / compactRooms', () => {
  it('auto-discover materializuje się w kolejności piętra', () => {
    expect(materializeRooms([], FLOOR).map((r) => r.area_id)).toEqual(FLOOR);
  });

  it('jawna lista zostaje bez zmian', () => {
    const rooms = [{ area_id: 'kuchnia' }];
    expect(materializeRooms(rooms, FLOOR)).toEqual(rooms);
  });

  it('lista równoważna auto-discover wraca do []', () => {
    expect(compactRooms(FLOOR.map((id) => ({ area_id: id })), FLOOR)).toEqual([]);
  });

  it('inna kolejność, ukryty pokój albo config — zostaje jawna', () => {
    const reversed = [...FLOOR].reverse().map((id) => ({ area_id: id }));
    expect(compactRooms(reversed, FLOOR)).toBe(reversed);
    const withHidden = FLOOR.map((id) => ({ area_id: id, hidden: id === 'salon' }));
    expect(compactRooms(withHidden, FLOOR)).toBe(withHidden);
    const withName = FLOOR.map((id) => (id === 'salon' ? { area_id: id, name: 'X' } : { area_id: id }));
    expect(compactRooms(withName, FLOOR)).toBe(withName);
  });
});

describe('applyRoomPatch', () => {
  it('tap_action „none" zostaje zapisane (karta honoruje jawne Nic)', () => {
    const out = applyRoomPatch({ area_id: 'salon' }, { tap_action: { action: 'none' } });
    expect(out.tap_action).toEqual({ action: 'none' });
  });

  it('tap_action „default" i brak akcji są kasowane', () => {
    const def = applyRoomPatch(
      { area_id: 'salon', tap_action: { action: 'navigate', navigation_path: '/x' } },
      { tap_action: { action: 'default' } as unknown as RoomConfig['tap_action'] },
    );
    expect('tap_action' in def).toBe(false);
    const cleared = applyRoomPatch({ area_id: 'salon' }, { tap_action: undefined });
    expect('tap_action' in cleared).toBe(false);
  });

  it('icon_tap_action: none zostaje, default znika', () => {
    expect(
      applyRoomPatch({ area_id: 'salon' }, { icon_tap_action: { action: 'none' } }).icon_tap_action,
    ).toEqual({ action: 'none' });
    const out = applyRoomPatch(
      { area_id: 'salon' },
      { icon_tap_action: { action: 'default' } as unknown as RoomConfig['icon_tap_action'] },
    );
    expect('icon_tap_action' in out).toBe(false);
  });

  it('sprząta puste pola i domyślny popup_order', () => {
    const out = applyRoomPatch(
      { area_id: 'salon', name: 'Salon' },
      {
        name: '',
        chips: [],
        style_override: '  ',
        aggregate: 'sum',
        hidden: false,
        popup_order: [
          { section: 'scenes' },
          { section: 'light_groups' },
          { section: 'light_entities' },
          { section: 'covers' },
          { section: 'media' },
          { section: 'extra' },
        ],
      },
    );
    expect(out).toEqual({ area_id: 'salon' });
  });

  it('popup_order z ukrytym blokiem zostaje', () => {
    const order = [{ section: 'covers' as const, hidden: true }];
    expect(applyRoomPatch({ area_id: 'salon' }, { popup_order: order }).popup_order).toEqual(order);
  });

  it('patch nie podmienia area_id', () => {
    expect(applyRoomPatch({ area_id: 'salon' }, { area_id: 'x' }).area_id).toBe('salon');
  });
});

describe('updateRoomInList (ED-1)', () => {
  it('auto-discover: zmiana nazwy jednego pokoju NIE kasuje reszty piętra', () => {
    const out = updateRoomInList([], FLOOR, 'kuchnia', { name: 'Kuchnia + jadalnia' });
    expect(out.map((r) => r.area_id)).toEqual(FLOOR);
    expect(out.find((r) => r.area_id === 'kuchnia')?.name).toBe('Kuchnia + jadalnia');
    expect(out.filter((r) => r.hidden)).toEqual([]);
  });

  it('auto-discover: „Nic" jako akcja pokoju jest zapisane', () => {
    const out = updateRoomInList([], FLOOR, 'salon', { tap_action: { action: 'none' } });
    expect(out.find((r) => r.area_id === 'salon')?.tap_action).toEqual({ action: 'none' });
    expect(out).toHaveLength(FLOOR.length);
  });

  it('wyczyszczenie jedynego override wraca do auto-discover', () => {
    const named = updateRoomInList([], FLOOR, 'salon', { name: 'Duży pokój' });
    expect(updateRoomInList(named, FLOOR, 'salon', { name: '' })).toEqual([]);
  });

  it('jawna lista: patch trafia w swój wpis, reszta nietknięta', () => {
    const rooms: RoomConfig[] = [SALON_POPUP, { area_id: 'kuchnia', hidden: true }];
    const out = updateRoomInList(rooms, FLOOR, 'salon', { icon: 'mdi:sofa' });
    expect(out[0]).toEqual({ ...SALON_POPUP, icon: 'mdi:sofa' });
    expect(out[1]).toEqual({ area_id: 'kuchnia', hidden: true });
  });

  it('pokój spoza jawnej listy jest doklejany', () => {
    const out = updateRoomInList([{ area_id: 'salon' }], FLOOR, 'kuchnia', { name: 'K' });
    expect(out).toEqual([{ area_id: 'salon' }, { area_id: 'kuchnia', name: 'K' }]);
  });
});

describe('toggleRoomInList (ED-2)', () => {
  it('odznaczenie pokoju z samym configiem popupu zachowuje config i miejsce', () => {
    const rooms: RoomConfig[] = [{ area_id: 'kuchnia' }, SALON_POPUP, { area_id: 'lazienka' }];
    const off = toggleRoomInList(rooms, FLOOR, 'salon', false);
    expect(off[1]).toEqual({ ...SALON_POPUP, hidden: true });
    const on = toggleRoomInList(off, FLOOR, 'salon', true);
    expect(on).toEqual(rooms);
  });

  it('auto-discover: odznaczenie materializuje i ukrywa jeden pokój', () => {
    const out = toggleRoomInList([], FLOOR, 'lazienka', false);
    expect(out.map((r) => r.area_id)).toEqual(FLOOR);
    expect(out.filter((r) => r.hidden).map((r) => r.area_id)).toEqual(['lazienka']);
  });

  it('odznacz → zaznacz bez configu wraca do auto-discover', () => {
    const off = toggleRoomInList([], FLOOR, 'lazienka', false);
    expect(toggleRoomInList(off, FLOOR, 'lazienka', true)).toEqual([]);
  });

  it('zaznaczenie area spoza listy dokleja ją na końcu', () => {
    const out = toggleRoomInList([{ area_id: 'salon' }], FLOOR, 'sypialnia', true);
    expect(out).toEqual([{ area_id: 'salon' }, { area_id: 'sypialnia' }]);
  });
});

describe('selectAllRooms / deselectAllRooms (ED-2)', () => {
  const custom: RoomConfig[] = [
    { area_id: 'sypialnia' },
    { ...SALON_POPUP, hidden: true },
    { area_id: 'kuchnia' },
  ];

  it('„Zaznacz wszystkie" zachowuje config popupu i własną kolejność', () => {
    const out = selectAllRooms(custom, FLOOR);
    expect(out.map((r) => r.area_id)).toEqual(['sypialnia', 'salon', 'kuchnia', 'lazienka']);
    expect(out[1]).toEqual(SALON_POPUP);
    expect(out.some((r) => r.hidden)).toBe(false);
  });

  it('„Zaznacz wszystkie" zostawia wpisy spoza bieżącego piętra', () => {
    const out = selectAllRooms([{ area_id: 'garaz', name: 'Garaż' }], FLOOR);
    expect(out[0]).toEqual({ area_id: 'garaz', name: 'Garaż' });
    expect(out.slice(1).map((r) => r.area_id)).toEqual(FLOOR);
  });

  it('„Zaznacz wszystkie" bez configu i w kolejności piętra → auto-discover', () => {
    const allHidden = FLOOR.map((id) => ({ area_id: id, hidden: true }));
    expect(selectAllRooms(allHidden, FLOOR)).toEqual([]);
  });

  it('„Odznacz wszystkie" → „Zaznacz wszystkie" jest odwracalne', () => {
    const rooms: RoomConfig[] = [
      { area_id: 'sypialnia' },
      SALON_POPUP,
      { area_id: 'kuchnia' },
      { area_id: 'lazienka' },
    ];
    const off = deselectAllRooms(rooms, FLOOR);
    expect(off.every((r) => r.hidden)).toBe(true);
    expect(off.map((r) => r.area_id)).toEqual(['sypialnia', 'salon', 'kuchnia', 'lazienka']);
    expect(selectAllRooms(off, FLOOR)).toEqual(rooms);
  });

  it('„Odznacz wszystkie" z auto-discover daje jawną listę ukrytych', () => {
    expect(deselectAllRooms([], FLOOR)).toEqual(FLOOR.map((id) => ({ area_id: id, hidden: true })));
  });
});

describe('moveRoomInList / roomPosition (ED-1: strzałki w auto-discover)', () => {
  it('auto-discover: pozycja liczona z piętra, nie -1', () => {
    expect(roomPosition([], FLOOR, 'kuchnia')).toEqual({ index: 1, total: 4 });
  });

  it('auto-discover: przesunięcie materializuje listę w nowej kolejności', () => {
    const out = moveRoomInList([], FLOOR, 'kuchnia', -1);
    expect(out?.map((r) => r.area_id)).toEqual(['kuchnia', 'salon', 'lazienka', 'sypialnia']);
  });

  it('przesunięcie tam i z powrotem wraca do auto-discover', () => {
    const moved = moveRoomInList([], FLOOR, 'kuchnia', -1)!;
    expect(moveRoomInList(moved, FLOOR, 'kuchnia', 1)).toEqual([]);
  });

  it('poza zakresem — brak zmiany', () => {
    expect(moveRoomInList([], FLOOR, 'salon', -1)).toBeUndefined();
    expect(moveRoomInList([], FLOOR, 'sypialnia', 1)).toBeUndefined();
    expect(moveRoomInList([], FLOOR, 'nieznany', 1)).toBeUndefined();
  });

  it('config przenoszonego pokoju jedzie razem z nim', () => {
    const rooms: RoomConfig[] = [{ area_id: 'kuchnia' }, SALON_POPUP];
    expect(moveRoomInList(rooms, FLOOR, 'salon', -1)).toEqual([SALON_POPUP, { area_id: 'kuchnia' }]);
  });
});
