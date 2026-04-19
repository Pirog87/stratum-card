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

  /**
   * Piętro z rejestru HA (HA 2024.3+). Karta agreguje wszystkie areas należące
   * do tego floor-a oraz ich encje. Główny tryb działania Stratum.
   */
  floor_id?: string;

  /**
   * Pojedyncza strefa — alternatywa do `floor_id` gdy user chce kartę na
   * jeden pokój (np. dom parterowy bez floor-ów w HA). Jedno z dwóch wymagane.
   */
  area_id?: string;

  /** Override nazwy wyświetlanej. Jeśli brak, bierze nazwę floor-a / area. */
  name?: string;

  /** Override ikony. Fallback: ikona floor-a / area; potem `mdi:home`. */
  icon?: string;

  /** Czy karta startuje rozwinięta (pamiętana tylko w sesji). */
  expanded?: boolean;

  /** Włącza `console.log` listy encji area przy każdym renderze. Tylko dev. */
  debug?: boolean;

  /**
   * Akcja wyzwalana kliknięciem w wiersz pomieszczenia. Wspiera placeholdery
   * `{area_id}` i `{area_name}` w `navigation_path`.
   * Przy braku: wiersz nie reaguje na klik.
   */
  room_tap_action?: TapActionConfig;

  /**
   * Lista chipów do wyświetlenia w headerze. Jeśli nie podane — domyślny set:
   * lights, motion, windows, doors. Każdy chip pokazuje liczbę encji w stanie on.
   */
  chips?: ChipConfig[];

  /**
   * [v0.5] Lista pomieszczeń w body expandera.
   * Jeśli brak, karta spróbuje auto-inferencji z `hass.entities` po area_id.
   */
  rooms?: RoomRefConfig[];
}

/** Wbudowane typy chipów agregujących encje area/floor. */
export type BuiltInChipType = 'lights' | 'motion' | 'occupancy' | 'windows' | 'doors';

export interface ChipConfig {
  /** Wbudowany typ (wtedy ikonę/kolor/counting mamy out-of-the-box). */
  type: BuiltInChipType;
  /** Override ikony MDI (np. `mdi:ceiling-light`). */
  icon?: string;
  /** Override koloru chipu — nazwa HA lub hex (np. `amber`, `#ff9b42`). */
  color?: string;
  /** Czy pokazać chip nawet gdy licznik = 0 (domyślnie: ukryj). */
  show_when_zero?: boolean;
}

export interface RoomRefConfig {
  /** Nazwa widoczna w UI. */
  name: string;
  /** Ikona MDI. */
  icon?: string;
  /** Akcja po tapnięciu wiersza. */
  tap_action?: TapActionConfig;
  /** Lista encji pomieszczenia (światła, czujki). Na razie surowe stringi. */
  entities?: string[];
}

/**
 * Prosty kontrakt tap_action kompatybilny z konwencją HA/Mushroom/Bubble.
 * Placeholdery `{area_id}` i `{area_name}` w `navigation_path` zostaną
 * podmienione na odpowiednie wartości klikniętego pomieszczenia.
 */
export type TapActionConfig =
  | { action: 'none' }
  | { action: 'navigate'; navigation_path: string }
  | { action: 'more-info'; entity?: string }
  | { action: 'url'; url_path: string; new_tab?: boolean }
  | {
      action: 'call-service';
      service: string;
      service_data?: Record<string, unknown>;
      target?: Record<string, unknown>;
    };

/**
 * Minimalny stub obiektu `hass` wstrzykiwanego przez Home Assistant do kart.
 * W rzeczywistości ma ~50 pól; deklarujemy tylko te których używamy,
 * żeby TypeScript nas chronił.
 */
export interface HomeAssistant {
  states: Record<string, HassEntity>;
  areas: Record<string, HassArea>;
  /** HA 2024.3+ registry of floors. Starsze wersje: obiekt pusty lub undefined. */
  floors?: Record<string, HassFloor>;
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
  /** HA 2024.3+: piętro do którego area należy. */
  floor_id?: string | null;
}

export interface HassFloor {
  floor_id: string;
  name: string;
  icon?: string | null;
  /** Kolejność pięter: 0 = parter, 1 = pierwsze piętro, -1 = piwnica itd. */
  level?: number | null;
  aliases?: string[];
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
