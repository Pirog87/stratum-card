// Wspólne fixtures do testów — minimalny stub `hass` i wpisów registry.

import type {
  HassEntity,
  HassEntityRegistryEntry,
  HomeAssistant,
} from '../src/types.js';

export function entity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes,
    last_changed: '2026-08-24T10:00:00+00:00',
    last_updated: '2026-08-24T10:00:00+00:00',
  };
}

export function entry(
  entityId: string,
  extra: Partial<HassEntityRegistryEntry> = {},
): HassEntityRegistryEntry {
  return { entity_id: entityId, ...extra };
}

/** Stub hass — tylko pola czytane przez czyste helpery. */
export function makeHass(states: Record<string, HassEntity>): HomeAssistant {
  return { states } as unknown as HomeAssistant;
}
