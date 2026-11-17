// Widoczność bloków popupu pokoju — jedno źródło prawdy dla edytora.
//
// Karta (stratum-room-card.ts `_renderOrderedBlocks`) chowa blok, gdy
// `popup_order[].hidden` jest ustawione ALBO gdy sekcja jego typu ma
// `hidden` (lights → oba bloki świateł). W edytorze były to dwa niezależne
// oka: na nagłówku bloku (popup_order) i w „Dodatkowych sekcjach"
// (section.hidden). Jedno mogło pokazywać „widoczny", gdy drugie już blok
// schowało, a „Pokaż" na jednym nie odkrywało bloku schowanego drugim.
//
// Rozwiązanie: oba oka czytają STAN EFEKTYWNY (to, co sprawdza karta),
// a zapis zawsze idzie do `popup_order`. Przy każdym przełączeniu
// `hidden` z sekcji rdzeniowych jest przenoszone do popup_order (wynik
// renderu identyczny — karta honoruje oba), więc po pierwszym kliknięciu
// zostaje jeden przełącznik zamiast dwóch.

import type {
  CoreSectionType,
  RoomConfig,
  RoomPopupOrderItem,
  RoomPopupSectionKey,
  RoomSectionConfig,
  RoomSectionType,
  SectionVisibility,
} from './types.js';
import { DEFAULT_POPUP_ORDER } from './types.js';

/** Sekcje rdzeniowe → bloki popupu, które karta nimi steruje. */
export const CORE_SECTION_BLOCKS: Readonly<Record<CoreSectionType, readonly RoomPopupSectionKey[]>> = {
  scenes: ['scenes'],
  lights: ['light_groups', 'light_entities'],
  covers: ['covers'],
  media: ['media'],
};

export function isCoreSectionType(t: RoomSectionType): t is CoreSectionType {
  return Object.prototype.hasOwnProperty.call(CORE_SECTION_BLOCKS, t);
}

/** Typ sekcji, której `hidden` karta sprawdza dla bloku (`extra` — żadna). */
function sectionTypeOfBlock(key: RoomPopupSectionKey): CoreSectionType | undefined {
  for (const [type, blocks] of Object.entries(CORE_SECTION_BLOCKS)) {
    if (blocks.includes(key)) return type as CoreSectionType;
  }
  return undefined;
}

/** Sekcje pokoju jako obiekty (stringi z YAML → `{type}`), śmieci pominięte. */
function sectionObjects(room: RoomConfig | undefined): RoomSectionConfig[] {
  return (room?.sections ?? [])
    .map((s) => (typeof s === 'string' ? { type: s } : s))
    .filter((s): s is RoomSectionConfig => Boolean(s && typeof s === 'object' && s.type));
}

/**
 * Kolejność bloków: config + brakujące klucze wg defaultu. Ta sama reguła
 * co `_resolvedPopupOrder` karty — nieznane klucze z YAML są pomijane.
 */
export function resolvePopupOrder(room: RoomConfig | undefined): RoomPopupOrderItem[] {
  const cfg = room?.popup_order ?? [];
  const seen = new Set(cfg.map((i) => i.section));
  return [
    ...cfg.filter((i) => DEFAULT_POPUP_ORDER.includes(i.section)),
    ...DEFAULT_POPUP_ORDER.filter((k) => !seen.has(k)).map((k) => ({ section: k })),
  ];
}

/** Czy sekcja danego typu ma `hidden` (pierwszy wpis wygrywa — jak w karcie). */
function sectionHidden(room: RoomConfig | undefined, type: RoomSectionType): boolean {
  return Boolean(sectionObjects(room).find((s) => s.type === type)?.hidden);
}

/** Stan efektywny bloku — dokładnie to, co sprawdza karta przy renderze. */
export function isBlockHidden(room: RoomConfig | undefined, key: RoomPopupSectionKey): boolean {
  if (resolvePopupOrder(room).find((i) => i.section === key)?.hidden) return true;
  const type = sectionTypeOfBlock(key);
  return type ? sectionHidden(room, type) : false;
}

/** Widoczność sekcji rdzeniowej z bloków, którymi steruje. */
export function sectionVisibility(
  room: RoomConfig | undefined,
  type: CoreSectionType,
): SectionVisibility {
  const blocks = CORE_SECTION_BLOCKS[type];
  const hiddenCount = blocks.filter((k) => isBlockHidden(room, k)).length;
  if (hiddenCount === 0) return 'visible';
  return hiddenCount === blocks.length ? 'hidden' : 'partial';
}

/** Mapa widoczności wszystkich sekcji rdzeniowych — wejście dla sections-editora. */
export function coreSectionVisibility(
  room: RoomConfig | undefined,
): Record<CoreSectionType, SectionVisibility> {
  return {
    scenes: sectionVisibility(room, 'scenes'),
    lights: sectionVisibility(room, 'lights'),
    covers: sectionVisibility(room, 'covers'),
    media: sectionVisibility(room, 'media'),
  };
}

/**
 * Ustawia widoczność bloków i zwraca patch pokoju (`popup_order`, plus
 * `sections`, gdy trzeba było z nich zdjąć `hidden`). Najpierw migruje
 * `hidden` z sekcji rdzeniowych do popup_order — bez tego „Pokaż" na
 * nagłówku bloku nie odkryłby bloku schowanego okiem sekcji, a przy
 * świetlach zdjęcie `hidden` z sekcji odkryłoby też drugi blok.
 */
export function setBlocksHidden(
  room: RoomConfig | undefined,
  keys: readonly RoomPopupSectionKey[],
  hidden: boolean,
): Pick<RoomConfig, 'popup_order'> & Partial<Pick<RoomConfig, 'sections'>> {
  const effective = new Set(
    DEFAULT_POPUP_ORDER.filter((k) => isBlockHidden(room, k)),
  );
  for (const k of keys) {
    if (hidden) effective.add(k);
    else effective.delete(k);
  }
  const popup_order = resolvePopupOrder(room).map((i) =>
    effective.has(i.section) ? { section: i.section, hidden: true } : { section: i.section },
  );

  const raw = room?.sections ?? [];
  const needsMigration = raw.some(
    (s) => typeof s === 'object' && s !== null && s.hidden && isCoreSectionType(s.type),
  );
  if (!needsMigration) return { popup_order };
  const sections = raw.map((s) => {
    if (typeof s !== 'object' || s === null || !s.hidden || !isCoreSectionType(s.type)) {
      return s;
    }
    const copy = { ...s };
    delete copy.hidden;
    return copy;
  });
  return { popup_order, sections };
}

/** Przełącza całą sekcję rdzeniową: ukryta → pokaż wszystko, inaczej → schowaj. */
export function toggleCoreSectionHidden(
  room: RoomConfig | undefined,
  type: CoreSectionType,
): ReturnType<typeof setBlocksHidden> {
  const show = sectionVisibility(room, type) === 'hidden';
  return setBlocksHidden(room, CORE_SECTION_BLOCKS[type], !show);
}
