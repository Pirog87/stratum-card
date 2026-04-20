// Globalny cache pełnego entity registry (przez WebSocket).
//
// `hass.entities` na froncie HA to tylko `EntityRegistryDisplayEntry` —
// NIE zawiera `device_class` override ustawionego w Entity Options.
// Żeby wykryć okna/drzwi z overrideem (np. SATEL), trzeba pobrać pełny
// registry przez `callWS({type: 'config/entity_registry/list'})`.
//
// Cache jest moduł-level, współdzielony przez wszystkie instancje karty.
// Fetch tylko raz na stronę; HA emituje `entity_registry_updated` event,
// na który też subskrybujemy.

import type { HomeAssistant } from './types.js';

interface RegistryEntry {
  device_class?: string | null;
  original_device_class?: string | null;
}

const cache = new Map<string, RegistryEntry>();
let fetched = false;
let fetching = false;
const listeners = new Set<() => void>();

/** Subskrybuje callback wywoływany gdy registry zostanie zaktualizowany. */
export function subscribeRegistry(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  for (const cb of listeners) cb();
}

/** Zwraca effective device_class z registry (override > original). */
export function registryDeviceClass(entityId: string): string | null {
  const entry = cache.get(entityId);
  if (!entry) return null;
  return entry.device_class ?? entry.original_device_class ?? null;
}

/** Pobiera pełny entity registry (idempotent — tylko pierwsze wywołanie faktycznie fetchuje). */
export async function ensureRegistry(hass: HomeAssistant): Promise<void> {
  if (fetched || fetching) return;
  if (!hass.callWS) return;
  fetching = true;
  try {
    const entries = await hass.callWS<
      Array<{
        entity_id: string;
        device_class?: string | null;
        original_device_class?: string | null;
      }>
    >({ type: 'config/entity_registry/list' });
    cache.clear();
    for (const e of entries) {
      cache.set(e.entity_id, {
        device_class: e.device_class,
        original_device_class: e.original_device_class,
      });
    }
    fetched = true;
    notify();
    // Subskrypcja na zmiany w registry (user zmieni device_class w UI).
    if (hass.connection) {
      void hass.connection.subscribeMessage(
        () => {
          // Reset + refetch przy każdej aktualizacji.
          fetched = false;
          void ensureRegistry(hass);
        },
        { type: 'subscribe_events', event_type: 'entity_registry_updated' },
      );
    }
  } catch {
    // Fallback cichy — karta zachowa się tak jak przedtem (bez overridu).
  } finally {
    fetching = false;
  }
}
