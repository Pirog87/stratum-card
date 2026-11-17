// stratum-card
//
// Customowa karta Home Assistant: podsumowanie warstwy (floor lub area)
// z rozwijanym body. Zobacz docs/roadmap.md dla kolejnych milestone'ów.

import {
  LitElement,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HassEntityRegistryEntry,
  HomeAssistant,
  StratumCardConfig,
} from './types.js';
import {
  getAreasInFloor,
  getEntitiesInArea,
  getEntitiesInFloor,
  filterByDomain,
  filterBinarySensorDeviceClass,
  unavailableEntityIds,
} from './area-entities.js';
import {
  computeTileData,
  evaluateConditions,
  resolveFieldEntityIds,
} from './tile-data.js';
import {
  DEFAULT_CHIPS,
  evaluateChip,
  resolveChipColor,
  resolveChipIcon,
} from './chip-defaults.js';
import { resolveTapAction, runTapAction } from './tap-action.js';
import {
  CHIP_LIST_COLORS,
  CHIP_LIST_LABELS,
  alarmEntityIds,
  chipEntityIds,
  chipSupportsList,
} from './chip-list-helpers.js';
import { TemplateRenderer } from './template-renderer.js';
import {
  addGroupMembers,
  collectEntityIds,
  statesReadyLatch,
  structureChanged,
  watchedStateChanged,
} from './hass-watch.js';
import { AgoTicker } from './ago-ticker.js';
import { LightSwipe } from './light-swipe.js';
import { subscribePower, toggleRoomLights } from './power-pending.js';
import type { RowBrightnessDetail } from './stratum-card-room-row.js';
import './stratum-card-chip.js';
import './stratum-card-editor.js';
import './stratum-card-room-row.js';
import './stratum-card-room-tile.js';
import './stratum-chip-list.js';
import './stratum-room-card.js';
import './stratum-scene-bar.js';

import { cardStyles } from './stratum-card-styles.js';
import {
  decidePopState,
  stateHasDialog,
  type GuardEntry,
  type GuardKind,
} from './back-guard.js';
import { pushEscapeLayer } from './escape-stack.js';
import { fieldColorStyle } from './field-colors.js';
import {
  buildHeaderStripes,
  stripeInk,
  type HeaderStripe,
  type StripeRoom,
} from './header-stripes.js';

const VERSION = '1.109.0';

@customElement('stratum-card')
export class StratumCard extends LitElement {
  /** Wstrzykiwane automatycznie przez Home Assistant przy każdej zmianie stanu. */
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumCardConfig;
  @state() private _expanded = false;

  /** Popup: aktualnie otwarte pomieszczenie z overrides z RoomConfig. */
  @state() private _popupRoom?: {
    area_id: string;
    merge_with?: string[];
    sections?: import('./types.js').RoomSectionSpec[];
    scenes?: import('./types.js').SceneBarConfig;
    lights?: import('./types.js').RoomLightsConfig;
    light_auto_entity?: string;
    light_split_areas?: boolean;
    light_auto_entities?: Record<string, string>;
    light_singles?: import('./types.js').RoomEntityListConfig;
    covers_list?: import('./types.js').RoomEntityListConfig;
    media_list?: import('./types.js').RoomEntityListConfig;
    popup_order?: import('./types.js').RoomPopupOrderItem[];
    popup_extra?: import('./types.js').RoomPopupExtraConfig;
    chips?: import('./types.js').ChipConfig[];
  };

  /** Popup listy encji po kliknięciu chipa nagłówka. */
  @state() private _popupChip?: {
    chip: import('./types.js').ChipConfig;
    entityIds: string[];
    label: string;
    icon: string;
    color: string;
    /** Tryb „Aktywne alarmy" — scope po areas zamiast typu chipa. */
    alarmAreaIds?: string[];
    /** Tryb listy urzadzen niedostepnych - scope po areas. */
    unavailableAreaIds?: string[];
  };

  /** Template renderer — subskrybuje Jinja2 przez WebSocket i wywołuje rerender. */
  private _templates = new TemplateRenderer(() => this.requestUpdate());

  /** Odświeża etykiety „5min temu" na chipach, gdy nic innego nie budzi karty. */
  protected readonly _agoTicker = new AgoTicker(this);

  /**
   * Encje, których stan karta faktycznie pokazuje — pamiętane razem z
   * tożsamościami, z których zbiór powstał. Przeliczamy go tylko po zmianie
   * rejestru albo configu, nie przy każdym `hass`.
   */
  private _watch?: {
    config: StratumCardConfig;
    entities: HomeAssistant['entities'];
    devices: HomeAssistant['devices'];
    areas: HomeAssistant['areas'];
    ids: Set<string>;
    /** Encje zakresu poza `ids` — obserwowane tylko pod kątem dostępności. */
    offlineOnly: string[];
  };

  /**
   * Które encje z zakresu karty w ogóle mogą zmienić to, co karta pokazuje.
   * Wiersze i chipy czytają światła, czujniki binarne (ruch, okna, drzwi,
   * alarmy, bateria) oraz czujniki temperatury i wilgotności. Reszta strefy
   * — moc, energia, napięcie, linkquality — to ok. 80% encji, które
   * raportują co kilka sekund i dotąd budziły całą kartę przy każdym
   * raporcie, choć niczego z nich nie widać.
   *
   * Encje wskazane w configu wchodzą zawsze (collectEntityIds). Czujnik bez
   * stanu w chwili budowania zbioru też wchodzi — nie znamy jeszcze jego
   * klasy, a gdyby był temperaturą, wiersz by go nie zauważył.
   */
  private _relevantEntityFilter(hass: HomeAssistant): (id: string) => boolean {
    const config = this._config!;
    // Licznik niedostępnych liczy WSZYSTKIE encje zakresu.
    if (config.unavailable_chip === true) return () => true;
    const chips = config.chips ?? DEFAULT_CHIPS;
    const extraDomains = new Set<string>();
    for (const chip of chips) {
      if (chip.type !== 'filter') continue;
      const domain = (chip as import('./types.js').FilterChipConfig).domain;
      // Chip filtrujący bez domeny patrzy na wszystko.
      if (!domain) return () => true;
      extraDomains.add(domain);
    }
    return (id: string): boolean => {
      const domain = id.slice(0, id.indexOf('.'));
      if (domain === 'light' || domain === 'binary_sensor') return true;
      if (extraDomains.has(domain)) return true;
      if (domain === 'sensor') {
        const st = hass.states?.[id];
        if (!st) return true;
        const dc = st.attributes?.device_class;
        return dc === 'temperature' || dc === 'humidity';
      }
      return false;
    };
  }

  private _watchedIds(hass: HomeAssistant): Set<string> {
    const config = this._config!;
    const w = this._watch;
    if (
      w &&
      w.config === config &&
      w.entities === hass.entities &&
      w.devices === hass.devices &&
      w.areas === hass.areas
    ) {
      return w.ids;
    }
    // Zakres karty (piętro albo strefa) + strefy wierszy z configu — te
    // drugie potrafią leżeć poza piętrem (`rooms[].area_id`, `merge_with`).
    const ids = collectEntityIds(config);
    const relevant = this._relevantEntityFilter(hass);
    // Pozostałe encje zakresu obserwujemy tańszą drogą — tylko przejście
    // do/z „unavailable". Wiersz jest „offline", gdy niedostępne są WSZYSTKIE
    // jego encje (padł hub), także rolety i gniazdka spoza `ids`.
    const rest = new Set<string>();
    const consider = (id: string): void => {
      if (relevant(id)) ids.add(id);
      else rest.add(id);
    };
    for (const e of this._getEntries()) consider(e.entity_id);
    for (const room of config.rooms ?? []) {
      for (const areaId of [room.area_id, ...(room.merge_with ?? [])]) {
        for (const e of getEntitiesInArea(hass, areaId)) consider(e.entity_id);
      }
    }
    addGroupMembers(hass, ids);
    for (const id of ids) rest.delete(id);
    this._watch = {
      config,
      entities: hass.entities,
      devices: hass.devices,
      areas: hass.areas,
      ids,
      offlineOnly: [...rest],
    };
    return ids;
  }

  /**
   * Bramka renderu. HA podmienia `hass` przy każdej zmianie stanu dowolnej
   * encji w całym domu; karta piętra ma renderować tylko wtedy, gdy zmieniła
   * się encja z JEJ pokoi (albo rejestr, motyw, config). Bez tego trzy
   * karty przeliczały wszystkie wiersze kilka–kilkanaście razy na sekundę,
   * także w trakcie gestu, i stąd brały się przycięcia.
   *
   * Poprzedni `hass` bierzemy z mapy zmian: Lit czyści ją także po
   * odrzuconym cyklu, więc zawsze porównujemy dwa kolejne obiekty — a skoro
   * tożsamość stanu jest przechodnia, żadna zmiana obserwowanej encji nie
   * przemknie między odrzuconymi cyklami.
   */
  /** „HA dosłał stany" — liczone raz, potem zapamiętane (hass-watch.ts). */
  private readonly _statesReady = statesReadyLatch();

  protected shouldUpdate(changed: PropertyValues): boolean {
    // Pusta mapa = gołe requestUpdate() (szablony, rejestr, zegar etykiet,
    // podgląd edytora); każdy inny klucz to realna zmiana stanu karty.
    if (changed.size !== 1 || !changed.has('hass')) return true;
    const prev = changed.get('hass') as HomeAssistant | undefined;
    const next = this.hass;
    if (!prev || !next || !this._config) return true;
    // Debug loguje każdy render z założenia.
    if (this._config.debug) return true;
    // Dopóki widać skeleton (HA nie dosłał stanów), czekamy na pierwszy stan.
    if (!this._statesReady(prev.states)) return true;
    if (structureChanged(prev, next)) return true;
    if (watchedStateChanged(prev, next, this._watchedIds(next))) return true;
    if (this._availabilityFlipped(prev, next)) return true;
    // Render odrzucony, ale otwarte popupy dostają nowy `hass` wprost.
    // Dawniej otwarty popup wyłączał tę bramkę całkiem: karta piętra,
    // schowana pod arkuszem, przeliczała wszystkie wiersze przy każdej
    // zmianie stanu w całym domu (ok. 2× koszt aktualizacji przy otwartym
    // popupie). Popup pokoju ma własną bramkę i sam decyduje, co go obchodzi;
    // lista chipa ma przypięte wiersze, a stany jej encji i tak leżą w
    // zakresie tej karty (zmiana = render powyżej).
    this._forwardHassToPopups(next);
    return false;
  }

  /**
   * Czy któraś encja spoza obserwowanego zbioru zmieniła dostępność. Raport
   * mocy czy energii (ta sama dostępność) nie budzi karty; padnięcie albo
   * powrót huba — tak, bo od tego zależy znacznik „offline" wiersza.
   */
  private _availabilityFlipped(prev: HomeAssistant, next: HomeAssistant): boolean {
    const a = prev.states;
    const b = next.states;
    if (a === b || !this._watch) return false;
    for (const id of this._watch.offlineOnly) {
      const pa = a?.[id];
      const nb = b?.[id];
      if (pa === nb) continue;
      if ((!pa || pa.state === 'unavailable') !== (!nb || nb.state === 'unavailable')) return true;
    }
    return false;
  }

  private _forwardHassToPopups(hass: HomeAssistant): void {
    if (!this._popupRoom && !this._popupChip) return;
    const root = this.renderRoot;
    const room = root.querySelector('stratum-room-card');
    if (room) room.hass = hass;
    const list = root.querySelector('stratum-chip-list');
    if (list) list.hass = hass;
  }

  /** Timer auto-collapse — wołany gdy karta rozwinięta i nic nie klikniemy. */
  private _autoCollapseTimer?: number;

  /** Flaga ustawiana gdy HA wywoła `preview = true` na elemencie. */
  private _previewFlag = false;

  /** HA wywoła ten setter gdy karta jest w preview pane edytora. */
  public set preview(value: boolean) {
    this._previewFlag = Boolean(value);
    if (this._previewFlag) {
      this._expanded = true;
      this._clearAutoCollapse();
      this.requestUpdate();
    }
  }

  /**
   * Wykrywa czy karta jest w preview pane edytora HA. Używa wielu sygnałów:
   * 1. flaga `preview` ustawiona przez HA
   * 2. `hui-dialog-edit-card` / `hui-card-element-editor` w DOM
   * 3. walk-up przez shadow DOM szukając `hui-card-preview`
   */
  private _isEditorPreview(): boolean {
    if (this._previewFlag) return true;
    if (
      document.querySelector(
        'hui-dialog-edit-card, hui-card-element-editor, hui-card-layout-editor',
      )
    ) {
      return true;
    }
    let el: Node | null = this;
    while (el) {
      if (el instanceof HTMLElement) {
        const tag = el.tagName?.toLowerCase();
        if (
          tag === 'hui-card-preview' ||
          tag === 'hui-dialog-edit-card' ||
          tag === 'hui-card-element-editor'
        ) {
          return true;
        }
      }
      const parent: Node | null = el.parentNode;
      if (parent) {
        el = parent;
        continue;
      }
      const root = el.getRootNode();
      if (root instanceof ShadowRoot) {
        el = root.host;
        continue;
      }
      el = null;
    }
    return false;
  }

  private _autoCollapseSeconds(): number {
    // Domyślnie 0 (wyłączone) — zwijaniem rządzi mechanizm sesyjny
    // (_resetExpanded): reset przy wyjściu z widoku / zejściu do tła.
    // Timer zostaje jako opcjonalny dodatek dla kiosków.
    const v = this._config?.auto_collapse;
    return typeof v === 'number' ? v : 0;
  }

  /**
   * Reset do stanu domyślnego — koniec „sesji" użytkownika w widoku.
   * Wołany gdy karta wypada z DOM (zmiana widoku/dashboardu — HA renderuje
   * ją od nowa przy powrocie) oraz gdy dokument schodzi do tła (wygaszony
   * ekran, inna aplikacja). Dopóki user siedzi w widoku, rozwinięcie
   * trzyma się bez limitu czasu.
   */
  private _resetExpanded(): void {
    if (this._isEditorPreview()) return;
    this._clearAutoCollapse();
    this._expanded = Boolean(this._config?.expanded);
  }

  private _onVisibilityChange = (): void => {
    if (document.hidden) this._resetExpanded();
  };

  private _scheduleAutoCollapse(): void {
    this._clearAutoCollapse();
    // W edit mode nie zwijamy — podgląd ma zawsze pokazywać pełną kartę.
    if (this._isEditorPreview()) return;
    const seconds = this._autoCollapseSeconds();
    if (seconds <= 0 || !this._expanded) return;
    this._autoCollapseTimer = window.setTimeout(() => {
      this._autoCollapseTimer = undefined;
      if (this._expanded) {
        this._expanded = false;
        this.dispatchEvent(
          new CustomEvent('stratum-card-toggle', {
            detail: { expanded: false, reason: 'auto-collapse' },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }, seconds * 1000);
  }

  private _clearAutoCollapse(): void {
    if (this._autoCollapseTimer !== undefined) {
      window.clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = undefined;
    }
  }

  private _onInteraction = (): void => {
    if (this._expanded) this._scheduleAutoCollapse();
  };

  /** HA wymaga żeby karta miała metodę `setConfig` — rzuci tu przy błędnej konfiguracji. */
  public setConfig(config: StratumCardConfig): void {
    if (!config) {
      throw new Error('Konfiguracja jest wymagana.');
    }
    if (!config.floor_id && !config.area_id && !config.name) {
      throw new Error('Podaj `floor_id`, `area_id` lub `name`.');
    }
    // W edytorze każda zmiana formularza woła setConfig ponownie — gdybyśmy
    // za każdym razem resetowali `_expanded` do `config.expanded`, podgląd
    // zwijałby się po każdym klawiszu. Inicjalizujemy tylko przy pierwszym
    // setConfig albo gdy sam flag `expanded` faktycznie się zmienił.
    const isFirst = !this._config;
    const expandedFlagChanged =
      this._config?.expanded !== config.expanded;
    this._config = config;

    const editorMode = this._isEditorPreview();
    if (editorMode) {
      // Podgląd w edytorze: zawsze rozwinięty, niezależnie od config.expanded
      // i niezależnie od liczby wywołań setConfig. HA potrafi wołać setConfig
      // przy każdym keystroke — bez force-true wygląd resetowałby się ciągle.
      this._expanded = true;
      this._clearAutoCollapse();
      return;
    }

    if (isFirst || expandedFlagChanged) {
      this._expanded = Boolean(config.expanded);
      if (this._expanded) this._scheduleAutoCollapse();
    }
  }

  /** Rozwiązuje effective row config (z migracją deprecated display_config). */
  private _resolveRowConfig(): import('./types.js').RowDisplayConfig | undefined {
    if (this._config?.row_config) return this._config.row_config;
    if (this._config?.display_config) {
      const { conditions: _c, ...rest } = this._config.display_config;
      void _c;
      return rest;
    }
    return undefined;
  }

  /** Rozwiązuje effective tile config (z migracją deprecated display_config). */
  private _resolveTileConfig(): import('./types.js').TileDisplayConfig | undefined {
    if (this._config?.tile_config) return this._config.tile_config;
    if (this._config?.display_config) {
      const { conditions: _c, ...rest } = this._config.display_config;
      void _c;
      return rest;
    }
    return undefined;
  }

  /** Rozwiązuje reguły warunkowego stylu (z migracją deprecated display_config). */
  private _resolveConditions():
    | import('./types.js').DisplayConditionConfig[]
    | undefined {
    if (this._config?.conditions) return this._config.conditions;
    return this._config?.display_config?.conditions;
  }

  /** HA używa tego do kalkulacji layoutu masonry. */
  public getCardSize(): number {
    return this._expanded ? 4 : 1;
  }

  /** Powiązuje wizualny editor z kartą — UI dashboardu HA wywoła to przy „Edit". */
  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('stratum-card-editor');
  }

  /** Sensowny default gdy user dodaje kartę przez wizard „Add card". */
  public static getStubConfig(
    hass: HomeAssistant,
    _entities: string[],
    _entitiesFallback: string[],
  ): Partial<StratumCardConfig> {
    const firstFloor = hass?.floors && Object.keys(hass.floors)[0];
    if (firstFloor) return { floor_id: firstFloor };
    const firstArea = hass?.areas && Object.keys(hass.areas)[0];
    return { area_id: firstArea ?? '' };
  }

  private _toggleExpand = (): void => {
    this._expanded = !this._expanded;
    this.dispatchEvent(
      new CustomEvent('stratum-card-toggle', {
        detail: { expanded: this._expanded, reason: 'user' },
        bubbles: true,
        composed: true,
      }),
    );
    if (this._expanded) this._scheduleAutoCollapse();
    else this._clearAutoCollapse();
  };

  private _resolveName(): string {
    if (this._config?.name) return this._config.name;
    if (this._config?.floor_id && this.hass?.floors) {
      const floor = this.hass.floors[this._config.floor_id];
      if (floor?.name) return floor.name;
    }
    if (this._config?.area_id && this.hass?.areas) {
      const area = this.hass.areas[this._config.area_id];
      if (area?.name) return area.name;
    }
    return this._config?.floor_id ?? this._config?.area_id ?? 'Stratum';
  }

  private _resolveIcon(): string {
    if (this._config?.icon) return this._config.icon;
    if (this._config?.floor_id && this.hass?.floors) {
      const floor = this.hass.floors[this._config.floor_id];
      if (floor?.icon) return floor.icon;
    }
    if (this._config?.area_id && this.hass?.areas) {
      const area = this.hass.areas[this._config.area_id];
      if (area?.icon) return area.icon;
    }
    return 'mdi:home';
  }

  private _getEntries() {
    if (!this.hass) return [];
    if (this._config?.floor_id) {
      return getEntitiesInFloor(this.hass, this._config.floor_id);
    }
    if (this._config?.area_id) {
      return getEntitiesInArea(this.hass, this._config.area_id);
    }
    return [];
  }

  private _renderChips(): TemplateResult[] {
    if (!this.hass) return [];
    this._templates.setHass(this.hass);
    const entries = this._getEntries();
    const chips = this._config?.chips ?? DEFAULT_CHIPS;
    const rendered: TemplateResult[] = [];
    for (const chip of chips) {
      const value = evaluateChip(this.hass!, entries, chip, this._templates);
      // Domyślnie chipy są zawsze widoczne (show_when_zero true). User może
      // explicit wyłączyć ten toggle — wtedy chip znika gdy wartość 0 /
      // nieaktywny (typowy use-case: alarm tylko gdy coś się dzieje).
      const showWhenZero = chip.show_when_zero !== false;
      if (!value.active && !showWhenZero) continue;
      const tapSet = this._isTapActionSet(chip);
      const listAvailable = this._chipSupportsList(chip);
      const clickable = tapSet || listAvailable;
      rendered.push(html`<stratum-card-chip
        .icon=${chip.icon ?? value.icon ?? resolveChipIcon(chip)}
        .label=${value.label}
        .active=${value.active}
        .color=${chip.color ?? value.color ?? resolveChipColor(chip)}
        .showWhenZero=${showWhenZero}
        .clickable=${clickable}
        .tinted=${this._config?.header?.style === 'stripes'}
        @chip-tap=${() => this._onChipTap(chip)}
      ></stratum-card-chip>`);
    }
    return rendered;
  }

  /**
   * Czy tap_action chipa faktycznie coś zrobi. Samo „ustawione" nie
   * wystarcza: akcja, której nie umiemy wykonać (np. `toggle` na chipie
   * licznika bez encji), robiła z chipa martwy przycisk i do tego
   * zabierała mu listę encji. Teraz taka akcja oddaje klik liście.
   */
  private _isTapActionSet(chip: import('./types.js').ChipConfig): boolean {
    return (
      resolveTapAction(this.hass, chip.tap_action, {
        entity_id: this._chipContextEntity(chip),
      }) !== null
    );
  }

  /** Encja kontekstu chipa — dla `more-info` / `toggle` bez jawnej encji. */
  private _chipContextEntity(
    chip: import('./types.js').ChipConfig,
  ): string | undefined {
    return (chip as { entity?: string }).entity || undefined;
  }

  private _chipSupportsList(chip: import('./types.js').ChipConfig): boolean {
    return chipSupportsList(chip);
  }

  private _onChipTap(chip: import('./types.js').ChipConfig): void {
    if (
      runTapAction(this.hass, chip.tap_action, {
        source: this,
        entity_id: this._chipContextEntity(chip),
      })
    ) {
      return;
    }
    if (this._chipSupportsList(chip)) {
      this._openChipList(chip);
    }
  }

  private _getChipEntityIds(
    chip: import('./types.js').ChipConfig,
  ): string[] {
    if (!this.hass) return [];
    return chipEntityIds(this.hass, this._getEntries(), chip);
  }

  private _openChipList(chip: import('./types.js').ChipConfig): void {
    const entityIds = this._getChipEntityIds(chip);
    this._showChipList({
      chip,
      entityIds,
      label: CHIP_LIST_LABELS[chip.type] ?? 'Lista',
      icon: resolveChipIcon(chip) ?? 'mdi:label-outline',
      color:
        resolveChipColor(chip) ??
        CHIP_LIST_COLORS[chip.type] ??
        'var(--primary-color)',
    });
  }

  /**
   * Wspólne wejście do listy chipa (chip, alarmy, niedostępne). Gdy lista
   * jest już otwarta, podmieniamy tylko treść — drugi strażnik historii
   * zostawiłby po zamknięciu wpis, na którym kolejne „wstecz" nic nie robi.
   */
  private _showChipList(data: NonNullable<StratumCard['_popupChip']>): void {
    const wasOpen = Boolean(this._popupChip);
    this._popupChip = data;
    if (!wasOpen) this._pushBackGuard('chip');
  }

  /**
   * Strażnicy historii otwartych popupów Stratum, od najstarszego. Android
   * „wstecz" zamyka najwyższy popup zamiast opuszczać widok — jak natywne
   * dialogi HA. Decyzja, które popupy zamyka dany popstate, siedzi
   * w back-guard.ts (tam też uzasadnienie, czemu po indeksie historii).
   */
  private _guards: GuardEntry[] = [];

  /** Dialogi HA otwarte nad popupem — tylko dla trybu bez Navigation API. */
  private _dialogsAbove = 0;

  /** Popstate wywołany naszym history.back() (×, Escape, tło, uchwyt). */
  private _selfBack = false;

  /** Indeks bieżącego wpisu historii albo null bez Navigation API. */
  private _historyIndex(): number | null {
    const nav = (
      window as unknown as {
        navigation?: { currentEntry?: { index: number } | null };
      }
    ).navigation;
    const idx = nav?.currentEntry?.index;
    return typeof idx === 'number' && idx >= 0 ? idx : null;
  }

  private _pushBackGuard(kind: GuardKind): void {
    window.history.pushState({ stratum: true }, '');
    if (this._guards.length === 0) {
      window.addEventListener('popstate', this._onPopState);
      // Zdarzenia z wnętrza popupów (wiersz listy, ikona kafla) przechodzą
      // przez host karty — tak wiemy, że HA otworzy dialog nad nami.
      this.addEventListener('hass-more-info', this._onDialogAbove);
      this.addEventListener('show-dialog', this._onDialogAbove);
    }
    // Indeks czytamy PO pushState — to pozycja naszego wpisu.
    this._guards.push({ kind, index: this._historyIndex() });
  }

  private _onDialogAbove = (ev: Event): void => {
    // hass-more-info bez encji zamyka more-info, a nie otwiera nowego.
    if (ev.type === 'hass-more-info') {
      const id = (ev as CustomEvent<{ entityId?: string | null }>).detail?.entityId;
      if (!id) return;
    }
    this._dialogsAbove++;
  };

  private _dropGuardListeners(): void {
    window.removeEventListener('popstate', this._onPopState);
    this.removeEventListener('hass-more-info', this._onDialogAbove);
    this.removeEventListener('show-dialog', this._onDialogAbove);
    this._dialogsAbove = 0;
    this._selfBack = false;
  }

  private _onPopState = (ev: PopStateEvent): void => {
    const decision = decidePopState(
      this._guards,
      this._historyIndex(),
      this._dialogsAbove,
      stateHasDialog(ev.state),
      this._selfBack,
    );
    this._selfBack = false;
    this._dialogsAbove = decision.dialogsAbove;
    // Historia jest już cofnięta przez system — zamykamy bez history.back().
    for (let i = 0; i < decision.pop; i++) {
      const guard = this._guards.pop();
      if (guard?.kind === 'chip') this._closeChipListNow();
      else if (guard?.kind === 'room') this._closeRoomPopupNow();
    }
    if (this._guards.length === 0) this._dropGuardListeners();
  };

  /**
   * Programowe zamknięcie (×/Escape/backdrop) — zdejmij też wpis historii.
   * history.back() robimy tylko, gdy zamykany popup ma strażnika na szczycie;
   * inaczej cofnięcie zamknęłoby inny popup. Strażnik spod spodu po prostu
   * wypada ze stosu (jego wpis zostaje w historii — mniejsze zło niż
   * zamknięcie nie tego popupu).
   */
  /**
   * Popupy w trakcie zamykania przez history.back() — do nadejścia popstate.
   * Bez tego podwójne × (albo dwa Escape pod rząd) wołało back() dwa razy:
   * pierwsze zamykało popup, drugie wyrzucało z dashboardu na poprzedni
   * widok. Bezpiecznik 500 ms domyka popup, gdyby popstate nie przyszło.
   */
  private _closing = new Set<GuardKind>();

  private _consumeBackGuard(kind: GuardKind): boolean {
    if (this._closing.has(kind)) return true;
    const top = this._guards[this._guards.length - 1];
    if (top?.kind === kind) {
      this._closing.add(kind);
      this._selfBack = true;
      window.history.back(); // popstate zamknie popup
      window.setTimeout(() => {
        if (!this._closing.delete(kind)) return;
        if (kind === 'room' && this._popupRoom) this._closeRoomPopupNow();
        if (kind === 'chip' && this._popupChip) this._closeChipListNow();
      }, 500);
      return true;
    }
    const i = this._guards.map((g) => g.kind).lastIndexOf(kind);
    if (i >= 0) {
      this._guards.splice(i, 1);
      if (this._guards.length === 0) this._dropGuardListeners();
    }
    return false;
  }

  private _closeChipListNow(): void {
    this._closing.delete('chip');
    this._popupChip = undefined;
  }

  private _closeChipList = (): void => {
    if (this._consumeBackGuard('chip')) return;
    this._closeChipListNow();
  };

  private _unsubPower?: () => void;

  /** Unsubscribe dla entity registry — wywołujemy w disconnect. */

  public connectedCallback(): void {
    super.connectedCallback();
    // Druga okazja do wykrycia edytora — po tym jak element jest już w drzewie.
    if (this._isEditorPreview()) {
      this._previewFlag = true;
      this._expanded = true;
      this._clearAutoCollapse();
    }
    // Tapnięty włącznik ma się przestawić od razu, a nie po raporcie z HA.
    this._unsubPower = subscribePower(() => this.requestUpdate());
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._resetExpanded();
    this._templates.destroy();
    this._clearAutoCollapse();
    // Popupy zamykamy razem ze strażnikami. Widok z pamięci HA (powrót po
    // akcji navigate z wnętrza popupu) pokazałby inaczej popup bez
    // strażnika historii i bez Escape.
    this._dropGuardListeners();
    this._guards = [];
    this._releaseRoomEscape?.();
    this._releaseRoomEscape = undefined;
    this._popupRoom = undefined;
    this._popupChip = undefined;
    this._prevFocus = undefined;
    this._unsubPower?.();
    this._unsubPower = undefined;
    // Żadnych spóźnionych komend jasności po zniknięciu karty z widoku.
    for (const swipe of this._swipes.values()) swipe.dispose();
    this._swipes.clear();
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._persistRowCount();
  }

  /**
   * Pamięć liczby wierszy — żeby skeleton nie zgadywał.
   *
   * `_renderSkeleton` rysował `config.rooms?.length ?? 3`. Przy jawnej
   * liście pokoi zgadza się idealnie, ale przy auto-wykrywaniu z `floor_id`
   * (konfiguracja domyślna) `rooms` jest puste i skeleton pokazywał zawsze
   * trzy wiersze — więc piętro z sześcioma pokojami podskakiwało przy
   * każdym wejściu na dashboard. Klucz jest per piętro/strefa, bo Parter
   * i Ogród mają różną liczbę pokoi; jedna wspólna wartość zamieniłaby
   * jeden przeskok na dwa.
   */
  private _lastRowCount = 0;

  private _rowsKey(): string | undefined {
    const id = this._config?.floor_id ?? this._config?.area_id;
    return id ? `stratum-card:rows:${id}` : undefined;
  }

  /** Ostatnio zapisana para klucz→liczba — żeby nie pisać w kółko tego samego. */
  private _persistedRows?: string;

  private _persistRowCount(): void {
    const key = this._rowsKey();
    if (!key || this._lastRowCount <= 0) return;
    // `updated()` woła nas po każdym renderze; synchroniczny zapis do
    // localStorage kilka razy na sekundę to czysta strata — liczba wierszy
    // zmienia się tylko przy edycji listy pokoi.
    const stamp = `${key}=${this._lastRowCount}`;
    if (stamp === this._persistedRows) return;
    this._persistedRows = stamp;
    try {
      window.localStorage.setItem(key, String(this._lastRowCount));
    } catch {
      // Prywatne okno / zablokowane dane witryny — skeleton po prostu
      // wraca do zgadywania. Nic się nie psuje.
    }
  }

  private _recallRowCount(): number | undefined {
    const key = this._rowsKey();
    if (!key) return undefined;
    try {
      const v = Number(window.localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  }

  private _debugLog(): void {
    if (!this.hass) return;
    const entries = this._getEntries();
    const scope = this._config?.floor_id
      ? `floor=${this._config.floor_id}`
      : `area=${this._config?.area_id}`;
    const lights = filterByDomain(entries, 'light');
    const motion = filterBinarySensorDeviceClass(this.hass, entries, 'motion');
    const occupancy = filterBinarySensorDeviceClass(this.hass, entries, 'occupancy');
    const windows = filterBinarySensorDeviceClass(this.hass, entries, 'window');
    const doors = filterBinarySensorDeviceClass(this.hass, entries, 'door');
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[stratum-card] ${scope} (${entries.length} entities)`);
    // eslint-disable-next-line no-console
    console.table({
      lights: lights.length,
      motion: motion.length,
      occupancy: occupancy.length,
      windows: windows.length,
      doors: doors.length,
    });
    // eslint-disable-next-line no-console
    console.log('all entries:', entries.map((e) => e.entity_id));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  private _renderSkeleton(): TemplateResult {
    // Jawna lista pokoi > zapamiętana liczba z ostatniego renderu > 3.
    // `||` a nie `??`, bo pusta tablica `rooms` ma length 0 i ma
    // przepuścić dalej, do pamięci.
    const rows = Math.min(
      this._config?.rooms?.length || this._recallRowCount() || 3,
      8,
    );
    return html`<ha-card part="card">
      <div class="sk-header">
        <span class="sk-circle sk-anim"></span>
        <span class="sk-bar sk-anim" style="width: 34%"></span>
        <span class="sk-bar sk-anim" style="width: 52px; margin-left: auto"></span>
      </div>
      ${this._config?.expanded
        ? html`<div class="sk-body">
            ${Array.from(
              { length: rows },
              () => html`<div class="sk-row">
                <span class="sk-circle sk-anim"></span>
                <span class="sk-bar sk-anim" style="width: 42%"></span>
                <span
                  class="sk-bar sk-anim"
                  style="width: 44px; margin-left: auto"
                ></span>
              </div>`,
            )}
          </div>`
        : nothing}
    </ha-card>`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;

    // Skeleton: HA jeszcze nie doslal stanow (start aplikacji / wolny
    // WebSocket) - migoczace placeholdery zamiast pustki i przeskokow.
    if (
      this._config.skeleton !== false &&
      (!this.hass || !this._statesReady(this.hass.states))
    ) {
      return this._renderSkeleton();
    }

    const name = this._resolveName();
    const icon = this._resolveIcon();
    const header = this._config.header ?? {};

    if (this._config.debug) this._debugLog();

    const TITLE_SIZE_MAP: Record<string, string> = { sm: '14px', md: '17px', lg: '20px' };
    const titleSizeCss = TITLE_SIZE_MAP[header.title_size ?? 'md']!;
    const headerStyles = [
      `--stratum-card-title-size: ${titleSizeCss};`,
      header.title_weight
        ? `--stratum-card-title-weight: ${header.title_weight};`
        : '',
      header.title_color
        ? `--stratum-card-title-color: ${header.title_color};`
        : '',
      typeof header.icon_size === 'number'
        ? `--stratum-card-icon-size: ${header.icon_size}px;`
        : '',
      header.icon_color
        ? `--stratum-card-icon-color: ${header.icon_color};`
        : '',
      typeof header.padding === 'number'
        ? `--stratum-card-header-padding: ${header.padding}px;`
        : '',
      header.accent_bar_color
        ? `--stratum-card-accent-bar-color: ${header.accent_bar_color};`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (header.style === 'stripes') {
      return html`
        <ha-card
          class="stripes-card"
          part="card"
          @pointerdown=${this._onInteraction}
        >
          ${this._renderStripesHeader(name, icon, header, headerStyles)}
          <div
            class="body-wrap ${this._expanded ? 'open' : ''}"
            part="body"
            aria-hidden=${!this._expanded}
          >
            <div class="body">${this._renderBody()}</div>
          </div>
        </ha-card>
        ${this._renderPopup()}
        ${this._renderChipListPopup()}
      `;
    }

    return html`
      <ha-card part="card" @pointerdown=${this._onInteraction}>
        <button
          class="header ${header.accent_bar ? 'has-accent-bar' : ''}"
          part="header"
          style=${headerStyles}
          @click=${this._toggleExpand}
          aria-expanded=${this._expanded}
          aria-label="Rozwiń ${name}"
        >
          <ha-icon class="area-icon" part="area-icon" .icon=${icon}></ha-icon>
          <span class="title" part="title">${name}</span>
          <div class="chips" part="chips">
            ${this._renderHeaderAlarmBadge()}
            ${this._renderHeaderUnavailableChip()}
            ${this._renderChips()}
          </div>
          ${header.hide_expander
            ? nothing
            : html`<ha-icon
                class="expander ${this._expanded ? 'open' : ''}"
                part="expander"
                .icon=${'mdi:chevron-down'}
              ></ha-icon>`}
        </button>

        <div
          class="body-wrap ${this._expanded ? 'open' : ''}"
          part="body"
          aria-hidden=${!this._expanded}
        >
          <div class="body">${this._renderBody()}</div>
        </div>
      </ha-card>
      ${this._renderPopup()}
      ${this._renderChipListPopup()}
    `;
  }

  /** Nadpisania popupu z configu pokoju — jedno miejsce dla listy i pasków belki. */
  private _popupOverridesOf(room: import('./types.js').RoomConfig) {
    return {
      merge_with: room.merge_with,
      sections: room.sections,
      scenes: room.scenes,
      lights: room.lights,
      light_auto_entity: room.light_auto_entity,
      light_split_areas: room.light_split_areas,
      light_auto_entities: room.light_auto_entities,
      light_singles: room.light_singles,
      covers_list: room.covers_list,
      media_list: room.media_list,
      popup_order: room.popup_order,
      popup_extra: room.popup_extra,
      chips: room.chips,
    };
  }

  /**
   * Pokoje piętra z liczbą włączonych świateł i kolorem świecenia — dane
   * dla pasków belki `stripes`. Ta sama kolejność i te same reguły
   * widoczności co lista pomieszczeń (`_renderRooms`): ukryte i scalone
   * area nie dostają własnego paska, a `merge_with` dolicza się do pokoju
   * głównego, o ile nie wyłączono tego przez `aggregate: 'primary_only'`.
   */
  private _stripeRooms(): Array<StripeRoom & { room?: import('./types.js').RoomConfig }> {
    if (!this.hass || !this._config) return [];
    const hass = this.hass;
    const describe = (
      areaIds: string[],
      name: string,
      room?: import('./types.js').RoomConfig,
    ): StripeRoom & { room?: import('./types.js').RoomConfig } => {
      const entries = this._roomEntries(areaIds);
      const data = computeTileData(hass, entries, room?.field_entities);
      return {
        area_id: areaIds[0]!,
        name,
        lightsOn: data.lightsOn,
        color: data.lightsRgb,
        room,
      };
    };

    if (this._config.rooms && this._config.rooms.length > 0) {
      const mergedInto = new Set<string>();
      for (const r of this._config.rooms) {
        for (const child of r.merge_with ?? []) mergedInto.add(child);
      }
      return this._config.rooms
        .filter((r) => !r.hidden && !mergedInto.has(r.area_id))
        .map((r) => {
          const areaIds =
            (r.aggregate ?? 'sum') === 'sum' && r.merge_with?.length
              ? [r.area_id, ...r.merge_with]
              : [r.area_id];
          const name = r.name ?? hass.areas?.[r.area_id]?.name ?? r.area_id;
          return describe(areaIds, name, r);
        });
    }
    if (this._config.floor_id) {
      return getAreasInFloor(hass, this._config.floor_id).map((a) =>
        describe([a.area_id], a.name),
      );
    }
    if (this._config.area_id) {
      const id = this._config.area_id;
      return [describe([id], hass.areas?.[id]?.name ?? id)];
    }
    return [];
  }

  private _onStripeTap(
    ev: Event,
    stripe: HeaderStripe,
    rooms: Array<StripeRoom & { room?: import('./types.js').RoomConfig }>,
  ): void {
    // Pasek leży w belce, której klik rozwija kartę — bez tego dotknięcie
    // paska robiłoby dwie rzeczy naraz.
    ev.stopPropagation();
    if (stripe.kind === 'more' || !stripe.area_id) {
      // „+N" nie ma jednego pokoju do otwarcia — pokazujemy wszystkie,
      // czyli rozwijamy listę.
      if (!this._expanded) this._toggleExpand();
      return;
    }
    if (this._config?.header?.stripes_tap === 'none') return;
    const match = rooms.find((r) => r.area_id === stripe.area_id);
    this._openRoomPopup(
      stripe.area_id,
      match?.room ? this._popupOverridesOf(match.room) : undefined,
    );
  }

  /**
   * Belka w stylu `stripes`. Nie jest jednym `<button>` jak klasyczna —
   * mieści trzy rodzaje celów (rozwinięcie, chipy, paski pokoi), a przycisk
   * w przycisku jest niepoprawny i gubi fokus klawiatury. Rozwijanie niesie
   * przycisk z nazwą; klik w tło belki działa tak samo dla wygody dotyku.
   */
  private _renderStripesHeader(
    name: string,
    icon: string,
    header: import('./types.js').HeaderConfig,
    headerStyles: string,
  ): TemplateResult {
    const rooms = this._stripeRooms();
    const stripes = buildHeaderStripes(rooms, header.stripes_max);
    const lit = rooms.some((r) => r.lightsOn > 0);
    const useLightColor = header.stripes_color !== 'static';
    const tapOpensRoom = header.stripes_tap !== 'none';
    // Poświata ikony ma jeden, stały kolor („świeci się"), niezależny od
    // barw żarówek — kolor światła niosą paski. Wersja z uśrednianiem barw
    // dawała na żywo brudne odcienie i myliła z ikoną zgaszoną.
    const stripesHeaderStyles = header.glow_color
      ? `${headerStyles} --stratum-header-glow-color: ${header.glow_color};`
      : headerStyles;
    const classes = [
      'header',
      'stripes',
      lit ? 'lit' : '',
      header.icon_glow === false ? 'no-glow' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return html`
      <div
        class=${classes}
        part="header"
        style=${stripesHeaderStyles}
        @click=${this._toggleExpand}
      >
        <span class="hs-icon" part="area-icon-wrap" aria-hidden="true">
          <ha-icon class="area-icon" part="area-icon" .icon=${icon}></ha-icon>
        </span>
        <div class="hs-text">
          <button
            type="button"
            class="hs-title"
            part="title"
            aria-expanded=${this._expanded}
            @click=${(ev: Event) => {
              ev.stopPropagation();
              this._toggleExpand();
            }}
          >
            ${name}
          </button>
          <div
            class="chips"
            part="chips"
            @click=${(ev: Event) => ev.stopPropagation()}
          >
            ${this._renderHeaderAlarmBadge()}
            ${this._renderHeaderUnavailableChip()}
            ${this._renderChips()}
          </div>
        </div>
        ${stripes.length > 0
          ? html`<div class="hs-stripes" part="stripes">
              ${stripes.map((s) => {
                const color = useLightColor ? s.color : undefined;
                const interactive = s.kind === 'more' || tapOpensRoom;
                const cls = `hs-stripe ink-${stripeInk(color)} ${s.kind}`;
                const style = color
                  ? `--stratum-header-stripe-bg: ${color};`
                  : '';
                // Pasek, który nic nie robi (stripes_tap: none), nie udaje
                // przycisku — zwykły element bez fokusa i bez kursora.
                if (!interactive) {
                  return html`<span class=${cls} part="stripe" style=${style}>
                    <span class="hs-stripe-label">${s.label}</span>
                  </span>`;
                }
                return html`<button
                  type="button"
                  class=${cls}
                  part="stripe"
                  style=${style}
                  aria-label=${s.kind === 'more'
                    ? `${name}: ${s.label}`
                    : (s.name ?? s.label)}
                  title=${s.name ?? s.label}
                  @click=${(ev: Event) => this._onStripeTap(ev, s, rooms)}
                >
                  <span class="hs-stripe-label">${s.label}</span>
                </button>`;
              })}
            </div>`
          : nothing}
      </div>
    `;
  }

  /**
   * Config popupu budowany raz na otwarcie (i na zmianę configu karty), nie
   * przy każdym renderze. Nowy literał obiektu co render oznaczał dla
   * `stratum-room-card` „zmienił się config" przy każdej zmianie stanu —
   * popup przeliczał wtedy wszystko od zera i żadna jego bramka nie działała.
   */
  private _popupCfgMemo?: {
    room: NonNullable<StratumCard['_popupRoom']>;
    config: StratumCardConfig | undefined;
    value: import('./types.js').StratumRoomCardConfig;
  };

  private _popupConfig(): import('./types.js').StratumRoomCardConfig {
    const room = this._popupRoom!;
    const memo = this._popupCfgMemo;
    if (memo && memo.room === room && memo.config === this._config) {
      return memo.value;
    }
    const value = this._buildPopupConfig();
    this._popupCfgMemo = { room, config: this._config, value };
    return value;
  }

  private _buildPopupConfig(): import('./types.js').StratumRoomCardConfig {
    if (!this._popupRoom) return { type: 'custom:stratum-room-card', area_id: '' };
    return {
      type: 'custom:stratum-room-card',
      area_id: this._popupRoom.area_id,
      merge_with: this._popupRoom.merge_with,
      sections: this._popupRoom.sections,
      scenes: this._popupRoom.scenes,
      lights: this._popupRoom.lights,
      light_auto_entity: this._popupRoom.light_auto_entity,
      light_split_areas: this._popupRoom.light_split_areas,
      light_auto_entities: this._popupRoom.light_auto_entities,
      light_singles: this._popupRoom.light_singles,
      covers_list: this._popupRoom.covers_list,
      media_list: this._popupRoom.media_list,
      popup_order: this._popupRoom.popup_order,
      popup_extra: this._popupRoom.popup_extra,
      chips: this._popupRoom.chips,
      scene_size_default: this._config?.rooms_scene_size,
      scene_columns_default: this._config?.rooms_scene_columns,
      scene_gradient_default: this._config?.rooms_scene_gradient,
      popup_header: this._config?.popup_header,
    };
  }

  private _renderPopup(): TemplateResult {
    if (!this._popupRoom) return html``;
    const popupConfig = this._popupConfig();
    return html`
      <div
        class="stratum-popup-backdrop"
        part="popup"
        @click=${(ev: MouseEvent) => this._onBackdropClick(ev)}
      >
        <div
          class="stratum-popup-card"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          @click=${(ev: Event) => ev.stopPropagation()}
        >
          <span
            class="stratum-popup-sentinel"
            tabindex="0"
            aria-hidden="true"
            @focus=${this._onSentinelStart}
          ></span>
          <div
            class="stratum-popup-grab"
            role="button"
            tabindex="0"
            aria-label="Zamknij — przeciągnij w dół"
            @pointerdown=${this._onGrabDown}
            @pointermove=${this._onGrabMove}
            @pointerup=${this._onGrabUp}
            @pointercancel=${this._onGrabUp}
            @keydown=${this._onGrabKey}
          ></div>
          <button
            class="stratum-popup-close"
            title="Zamknij"
            @click=${this._closeRoomPopup}
          >
            <ha-icon .icon=${'mdi:close'}></ha-icon>
          </button>
          <stratum-room-card
            .hass=${this.hass}
            .config=${popupConfig}
          ></stratum-room-card>
          <span
            class="stratum-popup-sentinel"
            tabindex="0"
            aria-hidden="true"
            @focus=${this._onSentinelEnd}
          ></span>
        </div>
      </div>
    `;
  }

  /** Otwiera listę „Aktywne alarmy" dla pomieszczenia (badge ⚠ na wierszu). */
  private _openAlarmList(areaIds: string[]): void {
    this._showChipList({
      chip: { type: 'problem' } as import('./types.js').ChipConfig,
      entityIds: [],
      label: 'Aktywne alarmy',
      icon: 'mdi:alert',
      color: 'var(--stratum-chip-leak-color, #f44336)',
      alarmAreaIds: areaIds,
    });
  }

  /**
   * Badge ⚠ N na belce najwyższego poziomu (piętro/karta) — pokazuje się
   * gdy JAKIKOLWIEK alarm na piętrze jest aktywny; klik otwiera listę
   * sprawców z całego zakresu karty (bez rozwijania belki).
   */
  private _renderHeaderAlarmBadge(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const ids = alarmEntityIds(this.hass, this._getEntries());
    if (ids.length === 0) return nothing;
    // Scope po wszystkich areas karty (floor albo pojedyncza area).
    const areaIds = this._config?.floor_id
      ? getAreasInFloor(this.hass, this._config.floor_id).map((a) => a.area_id)
      : this._config?.area_id
      ? [this._config.area_id]
      : [];
    return html`<span
      class="header-alarm-badge"
      role="button"
      tabindex="0"
      title="Pokaż aktywne alarmy"
      @click=${(ev: Event) => {
        ev.stopPropagation();
        this._openAlarmList(areaIds);
      }}
      @keydown=${(ev: KeyboardEvent) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          this._openAlarmList(areaIds);
        }
      }}
    >
      <ha-icon .icon=${'mdi:alert'}></ha-icon>
      ${ids.length}
    </span>`;
  }

  private _alarmScopeIds(areaIds: string[]): string[] {
    if (!this.hass) return [];
    const seen = new Set<string>();
    const entries: HassEntityRegistryEntry[] = [];
    for (const id of areaIds) {
      for (const e of getEntitiesInArea(this.hass, id)) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        entries.push(e);
      }
    }
    return alarmEntityIds(this.hass, entries);
  }

  private _openUnavailableList(areaIds: string[]): void {
    this._showChipList({
      chip: { type: 'filter' } as import('./types.js').ChipConfig,
      entityIds: [],
      label: 'Urządzenia niedostępne',
      icon: 'mdi:lan-disconnect',
      color: 'var(--stratum-chip-unavailable-color, #9e9e9e)',
      unavailableAreaIds: areaIds,
    });
  }

  private _unavailableScopeIds(areaIds: string[]): string[] {
    if (!this.hass) return [];
    const seen = new Set<string>();
    const entries: HassEntityRegistryEntry[] = [];
    for (const id of areaIds) {
      for (const e of getEntitiesInArea(this.hass, id)) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        entries.push(e);
      }
    }
    return unavailableEntityIds(this.hass, entries);
  }

  /**
   * Szary chip liczby niedostepnych obok badge alarmu - klik otwiera liste.
   * Domyslnie WYLACZONY: to widok diagnostyczny, a nie informacja na co
   * dzien. Naglowek widac przez wiekszosc czasu i ma pokazywac stan domu,
   * nie stan integracji - zwlaszcza ze licznik bywa trwale wysoki i wtedy
   * niczego juz nie sygnalizuje. Wlacza sie go swiadomie w edytorze.
   */
  private _renderHeaderUnavailableChip(): TemplateResult | typeof nothing {
    if (!this.hass || this._config?.unavailable_chip !== true) return nothing;
    const ids = unavailableEntityIds(this.hass, this._getEntries());
    if (ids.length === 0) return nothing;
    const areaIds = this._config?.floor_id
      ? getAreasInFloor(this.hass, this._config.floor_id).map((a) => a.area_id)
      : this._config?.area_id
      ? [this._config.area_id]
      : [];
    return html`<span
      class="header-unav-badge"
      role="button"
      tabindex="0"
      title="Pokaż niedostępne urządzenia"
      @click=${(ev: Event) => {
        ev.stopPropagation();
        this._openUnavailableList(areaIds);
      }}
      @keydown=${(ev: KeyboardEvent) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          this._openUnavailableList(areaIds);
        }
      }}
    >
      <ha-icon .icon=${'mdi:lan-disconnect'}></ha-icon>
      ${ids.length}
    </span>`;
  }

  private _renderChipListPopup(): TemplateResult {
    if (!this._popupChip) return html``;
    // Re-resolve entity IDs na każdy render — lista się aktualizuje live
    // gdy hass emituje nowe stany podczas otwartego popupu.
    const freshIds = this._popupChip.alarmAreaIds
      ? this._alarmScopeIds(this._popupChip.alarmAreaIds)
      : this._popupChip.unavailableAreaIds
      ? this._unavailableScopeIds(this._popupChip.unavailableAreaIds)
      : this._getChipEntityIds(this._popupChip.chip);
    return html`<stratum-chip-list
      .hass=${this.hass}
      .chip=${this._popupChip.chip}
      .entityIds=${freshIds}
      .label=${this._popupChip.label}
      .icon=${this._popupChip.icon}
      .color=${this._popupChip.color}
      .showClassBadge=${Boolean(this._popupChip.alarmAreaIds)}
      @close=${this._closeChipList}
    ></stratum-chip-list>`;
  }

  /** Stabilny obiekt configu belki scen — ten sam, dopóki config karty ten sam. */
  private _sceneCfgMemo?: {
    config: StratumCardConfig | undefined;
    value: import('./types.js').SceneBarConfig;
  };

  private _sceneBarConfig(
    scenes: import('./types.js').SceneBarConfig,
  ): import('./types.js').SceneBarConfig {
    const memo = this._sceneCfgMemo;
    if (memo && memo.config === this._config) return memo.value;
    const value = {
      gradient: this._config?.rooms_scene_gradient,
      ...scenes,
    } as import('./types.js').SceneBarConfig;
    this._sceneCfgMemo = { config: this._config, value };
    return value;
  }

  private _renderBody(): TemplateResult[] {
    const parts: TemplateResult[] = [];
    const scenes = this._config?.scenes;
    const position = scenes?.position ?? 'top';
    const sceneBar =
      scenes && scenes.items && scenes.items.length > 0
        ? html`<stratum-scene-bar
            .hass=${this.hass}
            .config=${this._sceneBarConfig(scenes)}
          ></stratum-scene-bar>`
        : null;
    const roomsTemplate = this._renderRooms();
    const cols = this._config?.rooms_tile_columns;
    const tileMin = this._config?.rooms_tile_min_width ?? 140;
    // `auto` albo brak — auto-fill z sensowną minimalną szerokością.
    // Liczba — sztywna siatka N×1fr, karta sama oblicza szerokość każdego
    // kafla tak żeby się zmieściły bez nakładania.
    const gridStyle =
      !cols || cols === 'auto'
        ? `grid-template-columns: repeat(auto-fill, minmax(${tileMin}px, 1fr));`
        : `grid-template-columns: repeat(${cols}, minmax(0, 1fr));`;
    const roomsWrapped = roomsTemplate
      ? html`<div class="rooms-grid" style=${gridStyle}>
          ${roomsTemplate}
        </div>`
      : null;

    const divider = html`<div class="body-divider" part="body-divider"></div>`;
    if (position === 'top' && sceneBar) {
      parts.push(sceneBar);
      if (roomsWrapped) parts.push(divider);
    }
    if (roomsWrapped) parts.push(roomsWrapped as TemplateResult);
    if (position === 'bottom' && sceneBar) {
      if (roomsWrapped) parts.push(divider);
      parts.push(sceneBar);
    }
    return parts;
  }

  private _renderRooms(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    // Jawna konfiguracja rooms — użyj jej z override'ami per room.
    if (this._config.rooms && this._config.rooms.length > 0) {
      // Area które są scalone do innego wiersza — nie pokazuj ich jako osobne.
      const mergedInto = new Set<string>();
      for (const r of this._config.rooms) {
        for (const child of r.merge_with ?? []) mergedInto.add(child);
      }
      const visible = this._config.rooms.filter(
        (r) => !r.hidden && !mergedInto.has(r.area_id),
      );
      this._lastRowCount = visible.length;
      return html`${visible.map((room) => {
        const area = this.hass!.areas?.[room.area_id];
        const name = room.name ?? area?.name ?? room.area_id;
        const icon = room.icon ?? area?.icon ?? undefined;
        const aggregate = room.aggregate ?? 'sum';
        const areaIds =
          aggregate === 'sum' && room.merge_with?.length
            ? [room.area_id, ...room.merge_with]
            : [room.area_id];
        const display = room.display ?? this._config?.rooms_display ?? 'row';
        return this._renderRoomRow(
          areaIds,
          name,
          icon,
          room.tap_action,
          this._popupOverridesOf(room),
          display,
          room.field_entities,
          room.style_override,
          room.icon_tap_action,
        );
      })}`;
    }

    // Auto-discover: wszystkie area z floor-a w kolejności HA.
    if (this._config.floor_id) {
      const areas = getAreasInFloor(this.hass, this._config.floor_id);
      if (areas.length === 0) {
        return html`<div class="placeholder">
          Brak stref przypisanych do tego piętra.<br />
          Przypisz area do floor w Settings → Areas & Zones.
        </div>`;
      }
      const globalDisplay = this._config.rooms_display ?? 'row';
      this._lastRowCount = areas.length;
      return html`${areas.map((area) =>
        this._renderRoomRow(
          [area.area_id],
          area.name,
          area.icon ?? undefined,
          undefined,
          undefined,
          globalDisplay,
        ),
      )}`;
    }

    // Pojedyncza strefa — wiersz tej area.
    if (this._config.area_id) {
      const area = this.hass.areas?.[this._config.area_id];
      const name = area?.name ?? this._config.area_id;
      this._lastRowCount = 1;
      return this._renderRoomRow(
        [this._config.area_id],
        name,
        area?.icon ?? undefined,
        undefined,
        undefined,
        this._config.rooms_display ?? 'row',
      );
    }

    return nothing;
  }

  /**
   * Wpisy rejestru dla zestawu stref wiersza — ta sama tablica, dopóki nie
   * zmieni się indeks stref (rejestr). Stała tożsamość pozwala modułom
   * pomocniczym zapamiętywać wyniki zależne tylko od rejestru (np.
   * `filterPrimary`); dawniej każdy render budował nową tablicę.
   */
  private _roomEntriesMemo = new Map<
    string,
    { sources: readonly (readonly HassEntityRegistryEntry[])[]; entries: readonly HassEntityRegistryEntry[] }
  >();

  private _roomEntries(areaIds: readonly string[]): readonly HassEntityRegistryEntry[] {
    const sources = areaIds.map((id) => getEntitiesInArea(this.hass!, id));
    const key = areaIds.join('+');
    const hit = this._roomEntriesMemo.get(key);
    if (hit && hit.sources.length === sources.length && hit.sources.every((s, i) => s === sources[i])) {
      return hit.entries;
    }
    let entries: readonly HassEntityRegistryEntry[];
    if (sources.length === 1) {
      entries = sources[0]!;
    } else {
      const seen = new Set<string>();
      const out: HassEntityRegistryEntry[] = [];
      for (const list of sources) {
        for (const e of list) {
          if (seen.has(e.entity_id)) continue;
          seen.add(e.entity_id);
          out.push(e);
        }
      }
      entries = out;
    }
    this._roomEntriesMemo.set(key, { sources, entries });
    return entries;
  }

  private _renderRoomRow(
    areaIds: string[],
    name: string,
    icon: string | undefined,
    perRoomTapAction?: import('./types.js').TapActionConfig,
    popupOverrides?: {
      merge_with?: string[];
      sections?: import('./types.js').RoomSectionSpec[];
      scenes?: import('./types.js').SceneBarConfig;
      lights?: import('./types.js').RoomLightsConfig;
      light_auto_entity?: string;
      light_split_areas?: boolean;
      light_auto_entities?: Record<string, string>;
      light_singles?: import('./types.js').RoomEntityListConfig;
      covers_list?: import('./types.js').RoomEntityListConfig;
      media_list?: import('./types.js').RoomEntityListConfig;
      popup_order?: import('./types.js').RoomPopupOrderItem[];
      popup_extra?: import('./types.js').RoomPopupExtraConfig;
      chips?: import('./types.js').ChipConfig[];
    },
    display: 'row' | 'tile' = 'row',
    fieldEntities?: import('./types.js').TileFieldEntities,
    styleOverride?: string,
    perRoomIconTapAction?: import('./types.js').TapActionConfig,
  ): TemplateResult {
    const primary = areaIds[0];
    // Klucz gestu jasności i pamięci „co było zgaszone" — strefy wiersza plus
    // jawna lista świateł. Dwa wiersze tej samej strefy z różnymi listami
    // (albo „Kuchnia" i „Kuchnia+Spiżarnia" na dwóch kartach) nie mogą
    // dzielić pamięci, bo przeciągnięcie jednego przywracałoby światła drugiego.
    const swipeKey = [
      areaIds.join('+'),
      ...(fieldEntities?.lights?.length ? [[...fieldEntities.lights].sort().join(',')] : []),
    ].join('|');
    // Encje wszystkich stref wiersza (primary + merge_with), bez duplikatów.
    const entries = this._roomEntries(areaIds);

    // Jedno wyliczenie dla obu form (row/tile). Override per-pole przez
    // fieldEntities; bez override → auto-discovery z encji area.
    // Pomieszczenie offline = wszystkie jego encje unavailable (padly hub).
    const roomOffline =
      entries.length > 0 &&
      entries.every((e) => {
        const st = this.hass!.states?.[e.entity_id]?.state;
        return !st || st === 'unavailable';
      });

    const data = computeTileData(this.hass!, entries, fieldEntities);
    const rowConfig = this._resolveRowConfig();
    const tileConfig = this._resolveTileConfig();
    const conditions = this._resolveConditions();
    const conditionOverride = evaluateConditions(data, conditions);

    // Dynamiczny accent z świateł. DEFAULT: lights, chyba że user wybrał
    // konkretny accent_color (wtedy static) albo explicit accent_mode.
    const effectiveAccentMode = (
      cfg?: import('./types.js').TileDisplayConfig,
    ): 'static' | 'lights' =>
      cfg?.accent_mode ?? (cfg?.accent_color ? 'static' : 'lights');
    const rowLightsAccent =
      effectiveAccentMode(rowConfig) === 'lights' && data.lightsRgb
        ? data.lightsRgb
        : undefined;
    const tileLightsAccent =
      effectiveAccentMode(tileConfig) === 'lights' && data.lightsRgb
        ? data.lightsRgb
        : undefined;

    const rowStyleOverride =
      (fieldColorStyle(rowConfig) + (styleOverride ?? '')) || undefined;
    const tileStyleOverride =
      (fieldColorStyle(tileConfig) + (styleOverride ?? '')) || undefined;

    // Rozwiązywanie akcji dla klikalności wiersza.
    const isSet = (a: import('./types.js').TapActionConfig | undefined): boolean =>
      Boolean(a && (a as { action?: string }).action && (a as { action: string }).action !== 'default');
    const effectiveTap = isSet(perRoomTapAction)
      ? perRoomTapAction
      : isSet(this._config?.room_tap_action)
      ? this._config?.room_tap_action
      : undefined;
    // Osobna akcja dla ikony — gdy ustawiona, klik w stadion ikony NIE
    // odpala akcji wiersza (np. ikona → popup, wiersz → toggle świateł).
    const effectiveIconTap = isSet(perRoomIconTapAction)
      ? perRoomIconTapAction
      : isSet(this._config?.room_icon_tap_action)
      ? this._config?.room_icon_tap_action
      : undefined;
    const iconTappable = effectiveIconTap !== undefined && effectiveIconTap.action !== 'none';
    // Klikalność: jawna akcja (nie none) LUB brak akcji (default → popup).
    const explicitNone = effectiveTap?.action === 'none';
    const clickable = !explicitNone;

    if (display === 'tile') {
      return html`<stratum-card-room-tile
        class="room-item tile-mode"
        .areaId=${primary}
        .name=${name}
        .icon=${icon ?? 'mdi:floor-plan'}
        .lightsOn=${data.lightsOn}
        .motion=${data.motion}
        .temperature=${data.temperature}
        .humidity=${data.humidity}
        .windowsOpen=${data.windowsOpen}
        .doorsOpen=${data.doorsOpen}
        .leakActive=${data.leakActive}
        .smokeActive=${data.smokeActive}
        .gasActive=${data.gasActive}
        .problemActive=${data.problemActive}
        .displayConfig=${tileConfig}
        .conditionOverride=${conditionOverride}
        .lightsAccent=${tileLightsAccent}
        .lightsBrightness=${data.lightsBrightness}
        .styleOverride=${tileStyleOverride}
        .clickable=${clickable}
        .offline=${roomOffline}
        @row-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
          this._onRoomTap(ev, effectiveTap, popupOverrides, entries, fieldEntities, swipeKey)}
      ></stratum-card-room-tile>`;
    }
    return html`<stratum-card-room-row
      class="room-item row-mode"
      .areaId=${primary}
      .name=${name}
      .icon=${icon ?? 'mdi:floor-plan'}
      .lightsOn=${data.lightsOn}
      .motion=${data.motion}
      .temperature=${data.temperature}
      .humidity=${data.humidity}
      .windowsOpen=${data.windowsOpen}
      .doorsOpen=${data.doorsOpen}
      .leakActive=${data.leakActive}
      .smokeActive=${data.smokeActive}
      .gasActive=${data.gasActive}
      .problemActive=${data.problemActive}
      .displayConfig=${rowConfig}
      .conditionOverride=${conditionOverride}
      .lightsAccent=${rowLightsAccent}
      .lightsBrightness=${data.lightsBrightness}
      .lightsAvgBrightness=${data.lightsAvgBrightness}
      .hasLights=${resolveFieldEntityIds(this.hass!, entries, 'lights', fieldEntities)
        .length > 0}
      .lightsSwitch=${rowConfig?.lights_switch === true}
      .alarmsCount=${alarmEntityIds(this.hass!, entries).length}
      .offline=${roomOffline}
      @row-alarms=${() => this._openAlarmList(areaIds)}
      .lightsGlowOn=${rowConfig?.lights_switch_glow_on ?? 100}
      .lightsGlowOff=${rowConfig?.lights_switch_glow_off ?? 30}
      .lightsSwitchShowOff=${rowConfig?.lights_switch_show_off !== false}
      .styleOverride=${rowStyleOverride}
      .clickable=${clickable}
      .iconTappable=${iconTappable}
      @row-lights-toggle=${() =>
        this._toggleRoomLights(entries, fieldEntities, swipeKey)}
      @row-brightness=${(ev: CustomEvent<RowBrightnessDetail>) =>
        this._onRowBrightness(ev.detail, swipeKey, entries, fieldEntities)}
      @row-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
        this._onRoomTap(ev, effectiveTap, popupOverrides, entries, fieldEntities, swipeKey)}
      @icon-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
        this._onRoomTap(ev, effectiveIconTap, popupOverrides, entries, fieldEntities, swipeKey)}
    ></stratum-card-room-row>`;
  }

  /**
   * Kontrolery gestu jasności, po jednym na wiersz (klucz = strefa główna).
   * Muszą przeżyć rendery karty: handlery w szablonie powstają od nowa przy
   * każdym renderze, a gest trwa przez wiele z nich (echo stanów z HA).
   */
  private _swipes = new Map<string, LightSwipe>();

  private _swipeFor(key: string): LightSwipe {
    let swipe = this._swipes.get(key);
    if (!swipe) {
      swipe = new LightSwipe(key, { hass: () => this.hass });
      this._swipes.set(key, swipe);
    }
    return swipe;
  }

  /**
   * Gest przeciągnięcia po wierszu: ściemnia i rozjaśnia TYLKO światła,
   * które świecą, każde proporcjonalnie do własnej jasności. Zgaszonych nie
   * dotyka (dawniej jedna komenda z jedną wartością zapalała cały pokój i
   * wyrównywała wszystkie poziomy). Logika i uzasadnienia: `light-swipe.ts`.
   *
   * Wiersz zgłasza fazy gestu; odpowiedź (poziom startowy, wynik) wpisujemy
   * z powrotem do `detail` — dispatch zdarzenia jest synchroniczny.
   */
  private _onRowBrightness(
    detail: RowBrightnessDetail,
    key: string,
    entries: readonly HassEntityRegistryEntry[],
    fieldEntities: import('./types.js').TileFieldEntities | undefined,
  ): void {
    if (!this.hass) {
      detail.active = false;
      return;
    }
    const swipe = this._swipeFor(key);
    switch (detail.phase) {
      case 'start': {
        const ids = resolveFieldEntityIds(this.hass, entries, 'lights', fieldEntities);
        const fromOff = this._resolveRowConfig()?.slider_from_off ?? 'all';
        const started = swipe.start(ids, fromOff);
        detail.level = started.level;
        detail.active = started.active;
        return;
      }
      case 'move':
        swipe.move(detail.pct);
        return;
      case 'end': {
        const result = swipe.end(detail.pct);
        detail.outcome = result.outcome;
        detail.level = result.level;
        return;
      }
      case 'cancel':
        swipe.cancel();
        return;
    }
  }

  private _onRoomTap(
    ev: CustomEvent<{ area_id: string; area_name: string }>,
    action: import('./types.js').TapActionConfig | undefined,
    roomOverrides?: {
      merge_with?: string[];
      sections?: import('./types.js').RoomSectionSpec[];
      scenes?: import('./types.js').SceneBarConfig;
      lights?: import('./types.js').RoomLightsConfig;
      light_auto_entity?: string;
      light_split_areas?: boolean;
      light_auto_entities?: Record<string, string>;
      light_singles?: import('./types.js').RoomEntityListConfig;
      covers_list?: import('./types.js').RoomEntityListConfig;
      media_list?: import('./types.js').RoomEntityListConfig;
      popup_order?: import('./types.js').RoomPopupOrderItem[];
      popup_extra?: import('./types.js').RoomPopupExtraConfig;
      chips?: import('./types.js').ChipConfig[];
    },
    entries?: readonly HassEntityRegistryEntry[],
    fieldEntities?: import('./types.js').TileFieldEntities,
    swipeKey?: string,
  ): void {
    // Rozwiązywanie akcji: per-room > global > domyślny popup.
    // `action: 'default'` z ha-form = „nie ustawione" — przechodzimy głębiej.
    const isSet = (a: import('./types.js').TapActionConfig | undefined): boolean =>
      Boolean(a && (a as { action?: string }).action && (a as { action: string }).action !== 'default');

    let effective: import('./types.js').TapActionConfig | undefined;
    if (isSet(action)) effective = action;
    else if (isSet(this._config?.room_tap_action)) effective = this._config?.room_tap_action;

    if (effective?.action === 'none') return;

    if (effective?.action === 'popup') {
      this._openRoomPopup(ev.detail.area_id, roomOverrides);
      return;
    }

    if (effective?.action === 'toggle-lights') {
      this._toggleRoomLights(entries ?? [], fieldEntities, swipeKey);
      return;
    }

    if (effective) {
      void runTapAction(this.hass, effective, {
        source: this,
        area_id: ev.detail.area_id,
        area_name: ev.detail.area_name,
      });
      return;
    }

    this._openRoomPopup(ev.detail.area_id, roomOverrides);
  }

  /**
   * Akcja `toggle-lights`: jeśli JAKIEKOLWIEK światło pokoju świeci —
   * gasimy wszystkie; inaczej zapalamy wszystkie. (Zwykły `light.toggle`
   * per encja dawałby szachownicę przy mieszanych stanach.)
   */
  private _toggleRoomLights(
    entries: readonly HassEntityRegistryEntry[],
    fieldEntities?: import('./types.js').TileFieldEntities,
    swipeKey?: string,
  ): void {
    if (!this.hass) return;
    const ids = resolveFieldEntityIds(this.hass, entries, 'lights', fieldEntities);
    // Natychmiastowy stan na przełączniku, gaszenie tylko świecących,
    // pamięć zestawu dla suwaka — wszystko w power-pending.ts.
    toggleRoomLights(this.hass, ids, swipeKey);
  }

  private _openRoomPopup(
    areaId: string,
    overrides?: {
      merge_with?: string[];
      sections?: import('./types.js').RoomSectionSpec[];
      scenes?: import('./types.js').SceneBarConfig;
      lights?: import('./types.js').RoomLightsConfig;
      light_auto_entity?: string;
      light_split_areas?: boolean;
      light_auto_entities?: Record<string, string>;
      light_singles?: import('./types.js').RoomEntityListConfig;
      covers_list?: import('./types.js').RoomEntityListConfig;
      media_list?: import('./types.js').RoomEntityListConfig;
      popup_order?: import('./types.js').RoomPopupOrderItem[];
      popup_extra?: import('./types.js').RoomPopupExtraConfig;
      chips?: import('./types.js').ChipConfig[];
    },
  ): void {
    // Popup już otwarty (np. drugi tap, zanim tło przechwyciło dotyk) —
    // podmieniamy treść bez drugiego strażnika, drugiej warstwy Escape
    // i bez nadpisania elementu, do którego ma wrócić fokus.
    const wasOpen = Boolean(this._popupRoom);
    this._popupRoom = {
      area_id: areaId,
      merge_with: overrides?.merge_with,
      sections: overrides?.sections,
      scenes: overrides?.scenes,
      lights: overrides?.lights,
      light_auto_entity: overrides?.light_auto_entity,
      light_split_areas: overrides?.light_split_areas,
      light_auto_entities: overrides?.light_auto_entities,
      light_singles: overrides?.light_singles,
      covers_list: overrides?.covers_list,
      media_list: overrides?.media_list,
      popup_order: overrides?.popup_order,
      popup_extra: overrides?.popup_extra,
      chips: overrides?.chips,
    };
    if (wasOpen) return;
    this._releaseRoomEscape = pushEscapeLayer(() => this._closeRoomPopup());
    this._pushBackGuard('room');
    // Popup to zwykly div nad trescia, nie natywny dialog, wiec fokus
    // klawiatury sam do niego nie wejdzie - zostalby na wierszu pod
    // spodem i pierwszy Tab poszedlby do NASTEPNEGO pokoju, po ekranie
    // ktorego nie widac. Zapamietujemy skad przyszlismy i wchodzimy.
    this._prevFocus =
      (this.shadowRoot?.activeElement as HTMLElement | null) ??
      (document.activeElement as HTMLElement | null);
    void this.updateComplete.then(() => {
      const card = this.shadowRoot?.querySelector(
        '.stratum-popup-card',
      ) as HTMLElement | null;
      card?.focus();
    });
  }

  private _closeRoomPopupNow(): void {
    this._closing.delete('room');
    this._popupRoom = undefined;
    this._releaseRoomEscape?.();
    this._releaseRoomEscape = undefined;
    // Fokus wraca tam, skad popup zostal otwarty - inaczej po Escape
    // kursor klawiatury przepada na poczatek dokumentu.
    const prev = this._prevFocus;
    this._prevFocus = undefined;
    if (prev && typeof prev.focus === 'function') {
      void this.updateComplete.then(() => prev.focus());
    }
  }

  /** Element, ktory mial fokus przed otwarciem popupu. */
  private _prevFocus?: HTMLElement | null;

  /**
   * Zdjęcie warstwy Escape popupu pokoju. Escape idzie przez wspólny stos
   * (escape-stack.ts): reaguje tylko najwyższa warstwa Stratum, więc lista
   * chipa nad popupem zamyka się sama, a Escape z more-info HA nie rusza
   * popupu wcale.
   */
  private _releaseRoomEscape?: () => void;

  /**
   * Pulapka fokusa na wartownikach: puste, focusowalne spany na poczatku
   * i koncu arkusza. Gdy Tab wyjdzie poza tresc, ladujemy na wartowniku
   * i odbijamy fokus z powrotem do srodka. Dziala takze przez granice
   * shadow DOM karty pokoju, czego reczne zbieranie focusowalnych
   * elementow by nie zalatwilo.
   */
  private _focusInPopup(selector: string): void {
    const el = this.shadowRoot?.querySelector(selector) as HTMLElement | null;
    el?.focus();
  }

  private _onSentinelStart = (): void => {
    this._focusInPopup('.stratum-popup-close');
  };

  private _onSentinelEnd = (): void => {
    const grab = this.shadowRoot?.querySelector(
      '.stratum-popup-grab',
    ) as HTMLElement | null;
    // Uchwyt istnieje tylko na telefonie (display:none wyzej), a element
    // ukryty nie przyjmie fokusa - wtedy pierwszym przystankiem jest x.
    if (grab && grab.offsetParent !== null) grab.focus();
    else this._focusInPopup('.stratum-popup-close');
  };

  private _closeRoomPopup = (): void => {
    if (this._consumeBackGuard('room')) return;
    this._closeRoomPopupNow();
  };

  private _onBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this._closeRoomPopup();
  }

  /**
   * Przeciąganie arkusza za uchwyt (telefon). Handlery wiszą na samym
   * uchwycie, nie na całym arkuszu — dzięki temu gest nigdy nie walczy
   * ze scrollem treści popupu.
   */
  private _grab?: { startY: number; card: HTMLElement };

  private _onGrabDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const handle = ev.currentTarget as HTMLElement;
    const card = handle.parentElement as HTMLElement | null;
    if (!card) return;
    this._grab = { startY: ev.clientY, card };
    card.style.transition = 'none';
    handle.setPointerCapture(ev.pointerId);
  };

  private _onGrabMove = (ev: PointerEvent): void => {
    const g = this._grab;
    if (!g) return;
    // Tylko w dół — ciągnięcie w górę nie odkleja arkusza od krawędzi.
    const dy = Math.max(0, ev.clientY - g.startY);
    g.card.style.transform = `translateY(${dy}px)`;
  };

  private _onGrabUp = (ev: PointerEvent): void => {
    const g = this._grab;
    this._grab = undefined;
    if (!g) return;
    const dy = Math.max(0, ev.clientY - g.startY);
    // Powrót do stanu sterowanego CSS-em: transform i transition znikają,
    // więc animacja odbicia idzie z arkusza stylów, nie z inline'u.
    g.card.style.transition = '';
    g.card.style.transform = '';
    if (dy > 90) this._closeRoomPopup();
  };

  private _onGrabKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this._closeRoomPopup();
    }
  };

  static styles = cardStyles;
}

// Rejestracja karty w "katalogu" HA widocznym w wizardzie dashboardu.
interface CustomCardsWindow extends Window {
  customCards?: Array<{
    type: string;
    name: string;
    description?: string;
    preview?: boolean;
  }>;
}

const w = window as CustomCardsWindow;
w.customCards = w.customCards ?? [];
if (!w.customCards.some((c) => c.type === 'stratum-card')) {
  w.customCards.push({
    type: 'stratum-card',
    name: 'Stratum',
    description:
      'Podsumowanie strefy z rozwijaną listą pomieszczeń (świata, obecność, okna).',
    preview: false,
  });
}

// Sygnatura w konsoli — pomocna w debugowaniu wersji u użytkownika.
// eslint-disable-next-line no-console
console.info(
  `%c STRATUM %c v${VERSION} `,
  'color: #fff; background: #ff9b42; padding: 2px 6px; border-radius: 3px 0 0 3px; font-weight: 500;',
  'color: #ff9b42; background: #1e1f22; padding: 2px 6px; border-radius: 0 3px 3px 0;',
);
