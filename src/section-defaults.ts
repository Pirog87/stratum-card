// Stałe labels/icons/layout dla sekcji room-card.
// Wydzielone aby uniknąć cyklu sections-editor ↔ room-card.

import type { RoomSectionType } from './types.js';

export const SECTION_LABEL: Record<RoomSectionType, string> = {
  summary: 'Podsumowanie',
  lights: 'Światła',
  covers: 'Rolety',
  windows: 'Okna',
  doors: 'Drzwi',
  climate: 'Klimat',
  media: 'Media',
  fans: 'Wentylacja',
  switches: 'Przełączniki',
  scenes: 'Sceny',
};

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
};
