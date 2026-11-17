// Stałe labels/icons/layout dla sekcji room-card.
// Wydzielone aby uniknąć cyklu sections-editor ↔ room-card.

import type { RoomSectionType } from './types.js';
import { pl } from './localize/pl.js';
import { messages, type LangSource } from './localize/localize.js';

/**
 * Domyślne tytuły sekcji po polsku — słownik bazowy. Klucze tej mapy to
 * zarazem lista znanych typów sekcji (room-sections.ts, testy); tytuł
 * pokazywany użytkownikowi bierz z `sectionLabel`, który zna język.
 */
export const SECTION_LABEL: Readonly<Record<RoomSectionType, string>> = pl.sections;

/** Domyślny tytuł sekcji w języku UI. */
export function sectionLabel(type: RoomSectionType, lang: LangSource): string {
  return messages(lang).sections[type] ?? type;
}

export const SECTION_ICON: Record<RoomSectionType, string> = {
  summary: 'mdi:information-outline',
  lights: 'mdi:lightbulb-group',
  covers: 'mdi:blinds',
  windows: 'mdi:window-open',
  doors: 'mdi:door',
  climate: 'mdi:thermostat',
  media: 'mdi:speaker',
  fans: 'mdi:fan',
  switches: 'mdi:toggle-switch',
  scenes: 'mdi:palette',
  custom: 'mdi:card-bulleted-outline',
};

export const SECTION_LAYOUT: Record<RoomSectionType, string> = {
  summary: 'grid-1',
  scenes: 'grid-3',
  lights: 'grid-2',
  switches: 'grid-2',
  fans: 'grid-2',
  windows: 'grid-2',
  doors: 'grid-2',
  covers: 'grid-1',
  climate: 'grid-1',
  media: 'grid-1',
  custom: 'grid-1',
};
