// Shared types for stratum-card.
//
// Rozszerzamy stopniowo — v0.1 ma minimum potrzebne do renderu.

/**
 * Konfiguracja karty przekazana z Lovelace YAML.
 * Od v0.3 rozszerzamy o `chips`, od v0.5 o `rooms` config, od v0.8 o customowe sloty.
 */
export interface StratumCardConfig {
  /** Obowiązkowe pole dyskryminujące dla HA — zawsze `"custom:stratum-card"`. */
  type: string;

  /** ID area z rejestru HA (np. `"parter"`, `"pietro"`, `"ogrod"`). */
  area_id?: string;

  /** Override nazwy wyświetlanej. Jeśli brak, bierze `area.name` z HA. */
  name?: string;

  /** Override ikony. Fallback: `area.icon` z HA, potem `mdi:home`. */
  icon?: string;

  /** Czy karta startuje rozwinięta (pamiętana tylko w sesji). */
  expanded?: boolean;

  /** Włącza `console.log` listy encji area przy każdym renderze. Tylko dev. */
  debug?: boolean;

  /**
   * [v0.3] Lista chipów do wyświetlenia w headerze.
   * Typowane w przyszłości jako `ChipConfig[]`.
   */
  chips?: unknown[];

  /**
   * [v0.5] Lista pomieszczeń w body expandera.
   * Jeśli brak, karta spróbuje auto-inferencji z `hass.entities` po area_id.
   */
  rooms?: RoomRefConfig[];
}

export interface RoomRefConfig {
  /** Nazwa widoczna w UI. */
  name: string;
  /** Ikona MDI. */
  icon?: string;
  /** Akcja po tapnięciu — do rozwinięcia w v0.6. */
  tap_action?: unknown;
  /** Lista encji pomieszczenia (światła, czujki). Na razie surowe stringi. */
  entities?: string[];
}

/**
 * Minimalny stub obiektu `hass` wstrzykiwanego przez Home Assistant do kart.
 * W rzeczywistości ma ~50 pól; deklarujemy tylko te których używamy,
 * żeby TypeScript nas chronił.
 */
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  areas: Record<string, HassArea>;
  entities: Record<string, HassEntityRegistryEntry>;
  devices: Record<string, HassDevice>;
  language: string;
  themes: { darkMode: boolean };
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ) => Promise<void>;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HassArea {
  area_id: string;
  name: string;
  icon?: string | null;
  picture?: string | null;
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  name?: string | null;
  labels?: string[];
  hidden_by?: string | null;
  disabled_by?: string | null;
}

export interface HassDevice {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}
