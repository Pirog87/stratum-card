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
   * Liczba sekund bez interakcji po których rozwinięta karta sama się zwija.
   * Default: 60. Ustaw `0` żeby wyłączyć auto-collapse.
   */
  auto_collapse?: number;

  /**
   * Globalny default formy pozycji pomieszczeń: `row` (domyślny) albo `tile`.
   * Per-pokój `display` w `RoomConfig` nadpisuje.
   */
  rooms_display?: 'row' | 'tile';

  /**
   * Minimalna szerokość kafla (px) w layoucie tile. Wpływa na auto-fill
   * grid-template-columns. Default 160.
   */
  rooms_tile_min_width?: number;

  /**
   * Akcja wyzwalana kliknięciem w wiersz pomieszczenia. Wspiera placeholdery
   * `{area_id}` i `{area_name}` w `navigation_path`.
   * Przy braku: wiersz nie reaguje na klik.
   */
  room_tap_action?: TapActionConfig;

  /**
   * Jawna lista pomieszczeń do wyświetlenia. Jeśli podana — pokazujemy tylko
   * te area, w tej kolejności, z per-room override'ami. Jeśli pusta lub brak —
   * auto-discover wszystkich area z floor-a.
   */
  rooms?: RoomConfig[];

  /**
   * Lista chipów do wyświetlenia w headerze. Jeśli nie podane — domyślny set:
   * lights, motion, windows, doors. Każdy chip pokazuje liczbę encji w stanie on.
   */
  chips?: ChipConfig[];

  /**
   * Pasek scen w body karty. Renderuje się powyżej lub poniżej listy pokoi
   * zgodnie z `scenes.position`. Nie renderuje się gdy `items` puste/brak.
   */
  scenes?: SceneBarConfig;
}

/**
 * Konfiguracja karty stratum-room-card — widok pojedynczego pomieszczenia
 * z auto-generowanymi sekcjami (Światła, Rolety, Okna, Klimat…).
 */
export interface StratumRoomCardConfig {
  /** Zawsze `"custom:stratum-room-card"`. */
  type: string;
  /** ID primary area. Wymagane. */
  area_id: string;
  /** Dodatkowe area których encje doliczamy do sekcji (garderoba, łazienka). */
  merge_with?: string[];
  /** Override nazwy (default: `area.name`). */
  name?: string;
  /** Override ikony (default: `area.icon`). */
  icon?: string;
  /** Chipy w headerze. Default: `motion`, entity(temp), entity(humidity). */
  chips?: ChipConfig[];
  /**
   * Lista sekcji do wyświetlenia. Akceptuje string albo pełny `RoomSectionConfig`.
   * Default: auto-discover po typach encji. Kolejność w tablicy = kolejność UI.
   */
  sections?: RoomSectionSpec[];
  /** Pasek scen — zastępuje auto-sekcję scen, pełna kontrola layoutu. */
  scenes?: SceneBarConfig;
  /** Debug log do konsoli. */
  debug?: boolean;
}

/** Pojedyncza scena w pasku `SceneBarConfig`. */
export interface SceneConfig {
  /** Encja typu `scene.*` albo `script.*` — cel wywołania. */
  entity: string;
  /** Override nazwy (default: friendly_name encji). */
  name?: string;
  /** Ikona gdy brak `image` (default: mdi:palette). */
  icon?: string;
  /** URL obrazka tła — `/local/...` albo zewnętrzny. Wypełnia cały tile. */
  image?: string;
  /** Kolor akcentu (tile gdy brak image, podświetlenie). */
  color?: string;
  /** Nadpisanie akcji — domyślnie `scene.turn_on` (albo odpowiednik script). */
  tap_action?: TapActionConfig;
}

/** Pasek scen w karcie: pozycja + layout + lista elementów. */
export interface SceneBarConfig {
  /** Sceny do wyświetlenia. Kolejność zachowana. */
  items: SceneConfig[];
  /** Pozycja paska w body karty. Default: `top`. */
  position?: 'top' | 'bottom';
  /** Rozmiar tile. Default: `md` (80px min). */
  size?: 'sm' | 'md' | 'lg';
  /** Liczba kolumn. Default: 3. */
  columns?: number;
  /** Aspect-ratio tile (CSS: `1/1`, `16/9`, `270/150`). Default: `1/1`. */
  aspect?: string;
}

/** Typy sekcji w room card. Każda mapuje na domain + ew. device_class. */
export type RoomSectionType =
  | 'summary'
  | 'lights'
  | 'covers'
  | 'windows'
  | 'doors'
  | 'climate'
  | 'media'
  | 'fans'
  | 'switches'
  | 'scenes'
  | 'custom';

/** Pola pokazywane w sekcji `summary`. */
export type SummaryField =
  | 'motion'
  | 'occupancy'
  | 'temperature'
  | 'humidity'
  | 'lights_on'
  | 'windows_open'
  | 'doors_open'
  | 'battery_low'
  | 'leak';

/**
 * Konfiguracja pojedynczej sekcji w room card — identyfikator typu + overrides
 * i ograniczenia (które encje, tryb wyświetlania, ukrywanie).
 *
 * W formie skróconej można przekazać sam string (`'lights'`) — automatycznie
 * znormalizujemy do `{ type: 'lights' }`.
 */
export interface RoomSectionConfig {
  /** Typ sekcji. */
  type: RoomSectionType;
  /** Override nazwy sekcji (nagłówek). */
  title?: string;
  /** Override ikony w nagłówku. */
  icon?: string;
  /** Filter: tylko te `entity_id` — reszta z area jest pominięta. */
  entities?: string[];
  /**
   * Tryb wyświetlania sekcji:
   * - `tile` (domyślny) — pełny kafel z nazwą, stanem i kontrolkami
   * - `slider` — kafel z suwakiem brightness (lights) / position (covers)
   * - `chips` — kompaktowy pasek poziomy: ikona + nazwa
   * - `bubble` — duża ikona w kole, nazwa pod spodem (mushroom-style)
   * - `icon` — sama ikona, bez tekstu
   * - `cards` / `inline` / `icons` — tylko dla `summary`
   */
  mode?:
    | 'tile'
    | 'slider'
    | 'chips'
    | 'bubble'
    | 'icon'
    | 'ambient'
    | 'cards'
    | 'inline'
    | 'icons';
  /**
   * Layout grid: `1` | `2` | `3` kolumn albo `'auto'`. Default: zgodny z typem
   * (covers/climate/media → 1, scenes → 3, reszta → 2).
   */
  columns?: 1 | 2 | 3 | 'auto';
  /** Tylko dla `summary` — które pola renderować. */
  fields?: SummaryField[];
  /**
   * Tylko dla `type: 'custom'` — pełny config dowolnej karty HA/HACS:
   * `{ type: 'media-control', entity: 'media_player.salon' }`,
   * `{ type: 'custom:mushroom-light-card', ... }` itd.
   * Jeśli karta custom nie jest jeszcze załadowana, HA zrobi to sam.
   */
  card?: Record<string, unknown>;
  /** Wyłącz sekcję bez usuwania configu. */
  hidden?: boolean;
}

/** Typ dopuszczalny w `sections` — string (typ skrócony) lub pełny config. */
export type RoomSectionSpec = RoomSectionType | RoomSectionConfig;

/** Wbudowane typy chipów agregujących encje area/floor. */
export type BuiltInChipType = 'lights' | 'motion' | 'occupancy' | 'windows' | 'doors';

/** Wspólne pola dla wszystkich typów chipów. */
interface BaseChipConfig {
  /** Override ikony MDI. */
  icon?: string;
  /** Override koloru — nazwa semantyczna (`amber`, `green`, `blue`) albo hex. */
  color?: string;
  /** Czy chip pokazuje swoją wartość nawet gdy jest "pusty"/zero. */
  show_when_zero?: boolean;
  /** Akcja po kliknięciu chipu. */
  tap_action?: TapActionConfig;
}

export interface BuiltInChipConfig extends BaseChipConfig {
  type: BuiltInChipType;
}

/** Chip pokazujący stan jednej encji albo wartość atrybutu. */
export interface EntityChipConfig extends BaseChipConfig {
  type: 'entity';
  entity: string;
  /** `state` (default) — stan encji; `attribute` — wartość atrybutu. */
  format?: 'state' | 'attribute';
  attribute?: string;
  /** Tekst dodawany po wartości (np. `°C`). */
  suffix?: string;
  /** Wartości traktowane jako "aktywny stan" (podświetla chip). Default: ['on']. */
  active_states?: string[];
}

/** Chip zliczający encje area/floor pasujące do filtra. */
export interface FilterChipConfig extends BaseChipConfig {
  type: 'filter';
  /** Domena (np. `light`, `switch`). */
  domain?: string;
  /** `device_class` dla binary_sensor (np. `motion`, `window`). */
  device_class?: string;
  /** Stan uznawany za aktywny (domyślnie `on`). */
  state?: string;
}

/** Chip z dowolnym Jinja2 template renderowanym live przez HA. */
export interface TemplateChipConfig extends BaseChipConfig {
  type: 'template';
  /** Jinja2 template (np. `{{ states('sensor.x') }}°C`). */
  value: string;
  /** Template zwracający prawdę/fałsz do wyróżnienia chipa. */
  active_template?: string;
}

export type ChipConfig =
  | BuiltInChipConfig
  | EntityChipConfig
  | FilterChipConfig
  | TemplateChipConfig;

/**
 * Jedna pozycja na liście pomieszczeń. `area_id` to primary; `merge_with`
 * lista secondary area_ids — ich encje dolicza się do wiersza i są pomijane
 * jako osobne pozycje.
 */
export interface RoomConfig {
  /** ID area z HA (primary). Wymagane. */
  area_id: string;
  /** Override nazwy. Jeśli brak — `area.name` z HA. */
  name?: string;
  /** Override ikony. Jeśli brak — `area.icon` z HA, potem `mdi:floor-plan`. */
  icon?: string;
  /** Per-room tap_action. Nadpisuje globalny `room_tap_action` karty. */
  tap_action?: TapActionConfig;
  /** Ukryj ten wiersz (użyteczne w edytorze jako „wyłącz bez usuwania"). */
  hidden?: boolean;
  /**
   * Dodatkowe area_id których encje zliczamy w tym wierszu (np. spiżarnia
   * dopisana do kuchni). Te area znikają z listy głównej jako osobne wiersze.
   */
  merge_with?: string[];
  /**
   * Jak agregować liczniki z primary + merge_with:
   * - `sum` (default) — suma świateł on, motion z dowolnej area, temperatura
   *   z pierwszego sensora w primary → merge_with
   * - `primary_only` — liczymy tylko z primary, merge_with jest tylko do
   *   hierarchii (np. detail view w v1.0+)
   */
  aggregate?: 'sum' | 'primary_only';

  /**
   * Forma wyświetlania pozycji w głównej karcie:
   * - `row` (domyślny) — poziomy wiersz w pełnej szerokości
   * - `tile` — kafel Stratum (konfigurowalny przez `tile_config`)
   * - `custom:<card-type>` — dowolna karta HACS jako kafel pokoju
   *   (auto-config z `area_id`/`entity` lub `tile_card_config` jako jawny YAML)
   * Bez ustawienia — używa `rooms_display` ze `StratumCardConfig`.
   */
  display?: string;

  /**
   * Konfiguracja wyglądu wbudowanego kafla Stratum (tylko dla `display: tile`).
   * Aspect, jakie pola pokazać, kolor akcentu, opcjonalne tło.
   */
  tile_config?: TileConfig;

  /**
   * Pełny config karty custom (tylko dla `display: 'custom:<card>'`).
   * Pominięte = próba auto-config: `{type, area_id}` (gdy karta tego oczekuje)
   * lub `{type, entity}`.
   */
  tile_card_config?: Record<string, unknown>;

  /**
   * Sekcje widoczne w popup pokoju (otwiera się po kliknięciu wiersza).
   * Gdy puste — popup używa auto-discovery zgodnej z encjami area.
   */
  sections?: RoomSectionSpec[];

  /** Pasek scen w popup pokoju. */
  scenes?: SceneBarConfig;

  /** Chipy w headerze popup pokoju. Puste = default per room-card. */
  chips?: ChipConfig[];
}

/** Zachowane dla kompatybilności — alias do nowego typu. */
export type RoomRefConfig = RoomConfig;

/** Pola które wbudowany tile może pokazać w sekcji info. */
export type TileField =
  | 'temperature'
  | 'humidity'
  | 'lights'
  | 'motion'
  | 'windows'
  | 'doors';

/** Konfiguracja wyglądu wbudowanego kafla pomieszczenia (`display: tile`). */
export interface TileConfig {
  /** CSS aspect-ratio kafla. Default `1/1`. Przykłady: `4/3`, `16/9`, `3/2`. */
  aspect?: string;
  /** Lista pól w sekcji info (kolejność znaczy). Default `[temperature, lights, motion]`. */
  fields?: TileField[];
  /** Kolor akcentu gdy aktywny (lights on / motion). Default amber. */
  accent_color?: string;
  /** URL/preset obrazka tła (jak scene `image`, np. `stratum:noc`). */
  background_image?: string;
  /** Czy pokazywać ikonę area w lewym górnym rogu. Default true. */
  show_icon?: boolean;
  /** Czy pokazywać nazwę area. Default true. */
  show_name?: boolean;
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
  /** WebSocket connection — używamy do subskrypcji render_template. */
  connection?: {
    subscribeMessage: <T>(
      callback: (msg: T) => void,
      subscribeMessage: Record<string, unknown>,
    ) => Promise<() => void>;
  };
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
