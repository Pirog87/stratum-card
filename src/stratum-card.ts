// stratum-card
//
// Customowa karta Home Assistant: podsumowanie warstwy (floor lub area)
// z rozwijanym body. Zobacz docs/roadmap.md dla kolejnych milestone'ów.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
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
} from './area-entities.js';
import {
  computeTileData,
  evaluateConditions,
  resolveFieldEntityIds,
} from './tile-data.js';
import { ensureRegistry, subscribeRegistry } from './entity-registry-cache.js';
import {
  DEFAULT_CHIPS,
  evaluateChip,
  resolveChipColor,
  resolveChipIcon,
} from './chip-defaults.js';
import { runTapAction } from './tap-action.js';
import {
  CHIP_LIST_COLORS,
  CHIP_LIST_LABELS,
  alarmEntityIds,
  chipEntityIds,
  chipSupportsList,
} from './chip-list-helpers.js';
import { TemplateRenderer } from './template-renderer.js';
import './stratum-card-chip.js';
import './stratum-card-editor.js';
import './stratum-card-room-row.js';
import './stratum-card-room-tile.js';
import './stratum-chip-list.js';
import './stratum-room-card.js';
import './stratum-scene-bar.js';

const VERSION = '1.93.0';

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
  };

  /** Template renderer — subskrybuje Jinja2 przez WebSocket i wywołuje rerender. */
  private _templates = new TemplateRenderer(() => this.requestUpdate());

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
      const tapSet = this._isTapActionSet(chip.tap_action);
      const listAvailable = this._chipSupportsList(chip);
      const clickable = tapSet || listAvailable;
      rendered.push(html`<stratum-card-chip
        .icon=${chip.icon ?? value.icon ?? resolveChipIcon(chip)}
        .label=${value.label}
        .active=${value.active}
        .color=${chip.color ?? value.color ?? resolveChipColor(chip)}
        .showWhenZero=${showWhenZero}
        .clickable=${clickable}
        @chip-tap=${() => this._onChipTap(chip)}
      ></stratum-card-chip>`);
    }
    return rendered;
  }

  private _isTapActionSet(
    a: import('./types.js').TapActionConfig | undefined,
  ): boolean {
    if (!a) return false;
    const act = (a as { action?: string }).action;
    return Boolean(act && act !== 'default' && act !== 'none');
  }

  private _chipSupportsList(chip: import('./types.js').ChipConfig): boolean {
    return chipSupportsList(chip);
  }

  private _onChipTap(chip: import('./types.js').ChipConfig): void {
    if (this._isTapActionSet(chip.tap_action)) {
      void runTapAction(this.hass, chip.tap_action as never, { source: this });
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
    this._popupChip = {
      chip,
      entityIds,
      label: CHIP_LIST_LABELS[chip.type] ?? 'Lista',
      icon: resolveChipIcon(chip) ?? 'mdi:label-outline',
      color:
        resolveChipColor(chip) ??
        CHIP_LIST_COLORS[chip.type] ??
        'var(--primary-color)',
    };
    this._pushBackGuard();
  }

  /**
   * Liczba wpisów historii wypchniętych przez otwarte popupy Stratum.
   * Android „wstecz" (popstate) zamyka najwyższy popup zamiast opuszczać
   * widok — jak natywne dialogi HA.
   */
  private _historyDepth = 0;

  private _pushBackGuard(): void {
    window.history.pushState({ stratum: true }, '');
    this._historyDepth++;
    if (this._historyDepth === 1) {
      window.addEventListener('popstate', this._onPopState);
    }
  }

  private _onPopState = (): void => {
    if (this._historyDepth === 0) return;
    this._historyDepth--;
    if (this._historyDepth === 0) {
      window.removeEventListener('popstate', this._onPopState);
    }
    // Zamykamy najwyższy otwarty popup (historia już cofnięta przez system).
    if (this._popupChip) this._closeChipListNow();
    else if (this._popupRoom) this._closeRoomPopupNow();
  };

  /** Programowe zamknięcie (×/Escape/backdrop) — zdejmij też wpis historii. */
  private _consumeBackGuard(): boolean {
    if (this._historyDepth > 0) {
      window.history.back(); // popstate zamknie popup
      return true;
    }
    return false;
  }

  private _closeChipListNow(): void {
    this._popupChip = undefined;
  }

  private _closeChipList = (): void => {
    if (this._consumeBackGuard()) return;
    this._closeChipListNow();
  };

  /** Unsubscribe dla entity registry — wywołujemy w disconnect. */
  private _unsubRegistry?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    // Druga okazja do wykrycia edytora — po tym jak element jest już w drzewie.
    if (this._isEditorPreview()) {
      this._previewFlag = true;
      this._expanded = true;
      this._clearAutoCollapse();
    }
    // Subskrybuj globalny entity registry cache — gdy fetch się zakończy,
    // chipy / row / popup liczą device_class z overridem (np. SATEL).
    this._unsubRegistry = subscribeRegistry(() => this.requestUpdate());
    if (this.hass) void ensureRegistry(this.hass);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._resetExpanded();
    this._templates.destroy();
    this._clearAutoCollapse();
    document.removeEventListener('keydown', this._onPopupKey);
    window.removeEventListener('popstate', this._onPopState);
    this._historyDepth = 0;
    this._unsubRegistry?.();
    this._unsubRegistry = undefined;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    // Trigger fetch przy pierwszym hass update (gdy ensureRegistry
    // z connectedCallback nie miał jeszcze hass).
    if (changed.has('hass') && this.hass) {
      void ensureRegistry(this.hass);
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

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;

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

  private _renderPopup(): TemplateResult {
    if (!this._popupRoom) return html``;
    const popupConfig: import('./types.js').StratumRoomCardConfig = {
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
    return html`
      <div
        class="stratum-popup-backdrop"
        part="popup"
        @click=${(ev: MouseEvent) => this._onBackdropClick(ev)}
      >
        <div class="stratum-popup-card" @click=${(ev: Event) => ev.stopPropagation()}>
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
        </div>
      </div>
    `;
  }

  /** Otwiera listę „Aktywne alarmy" dla pomieszczenia (badge ⚠ na wierszu). */
  private _openAlarmList(areaIds: string[]): void {
    this._popupChip = {
      chip: { type: 'problem' } as import('./types.js').ChipConfig,
      entityIds: [],
      label: 'Aktywne alarmy',
      icon: 'mdi:alert',
      color: 'var(--stratum-chip-leak-color, #f44336)',
      alarmAreaIds: areaIds,
    };
    this._pushBackGuard();
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

  private _renderChipListPopup(): TemplateResult {
    if (!this._popupChip) return html``;
    // Re-resolve entity IDs na każdy render — lista się aktualizuje live
    // gdy hass emituje nowe stany podczas otwartego popupu.
    const freshIds = this._popupChip.alarmAreaIds
      ? this._alarmScopeIds(this._popupChip.alarmAreaIds)
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

  private _renderBody(): TemplateResult[] {
    const parts: TemplateResult[] = [];
    const scenes = this._config?.scenes;
    const position = scenes?.position ?? 'top';
    const sceneBar =
      scenes && scenes.items && scenes.items.length > 0
        ? html`<stratum-scene-bar
            .hass=${this.hass}
            .config=${{
              gradient: this._config?.rooms_scene_gradient,
              ...scenes,
            }}
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
          {
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
          },
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
    // Zbieramy encje z wszystkich area (primary + merge_with), deduplikując.
    const seen = new Set<string>();
    const entries: HassEntityRegistryEntry[] = [];
    for (const id of areaIds) {
      for (const e of getEntitiesInArea(this.hass!, id)) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        entries.push(e);
      }
    }

    // Jedno wyliczenie dla obu form (row/tile). Override per-pole przez
    // fieldEntities; bez override → auto-discovery z encji area.
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

    // Kolory pól sekcji info z configu → CSS vars (doklejane do
    // styleOverride; kolorują pola + spójnie np. mini-switch świateł).
    const FIELD_COLOR_VARS: Record<string, string> = {
      lights: '--stratum-chip-lights-color',
      motion: '--stratum-chip-motion-color',
      windows: '--stratum-chip-windows-color',
      doors: '--stratum-chip-doors-color',
      leak: '--stratum-chip-leak-color',
      smoke: '--stratum-chip-smoke-color',
      gas: '--stratum-chip-gas-color',
      problem: '--stratum-chip-problem-color',
      temperature: '--stratum-field-temp-color',
      humidity: '--stratum-field-hum-color',
    };
    const fieldColorStyle = (
      cfg?: import('./types.js').TileDisplayConfig,
    ): string =>
      Object.entries(cfg?.field_colors ?? {})
        .filter(([k, v]) => Boolean(v) && FIELD_COLOR_VARS[k])
        .map(([k, v]) => `${FIELD_COLOR_VARS[k]}:${v};`)
        .join('');
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
        @row-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
          this._onRoomTap(ev, effectiveTap, popupOverrides, entries, fieldEntities)}
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
      @row-alarms=${() => this._openAlarmList(areaIds)}
      .lightsGlowOn=${rowConfig?.lights_switch_glow_on ?? 100}
      .lightsGlowOff=${rowConfig?.lights_switch_glow_off ?? 30}
      .lightsSwitchShowOff=${rowConfig?.lights_switch_show_off !== false}
      .styleOverride=${rowStyleOverride}
      .clickable=${clickable}
      .iconTappable=${iconTappable}
      @row-lights-toggle=${() => this._toggleRoomLights(entries, fieldEntities)}
      @row-brightness=${(ev: CustomEvent<{ pct: number; live: boolean }>) =>
        this._onRowBrightness(entries, fieldEntities, ev.detail.pct, ev.detail.live)}
      @row-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
        this._onRoomTap(ev, effectiveTap, popupOverrides, entries, fieldEntities)}
      @icon-tap=${(ev: CustomEvent<{ area_id: string; area_name: string }>) =>
        this._onRoomTap(ev, effectiveIconTap, popupOverrides, entries, fieldEntities)}
    ></stratum-card-room-row>`;
  }

  /**
   * Gest przeciągnięcia po wierszu = ustaw jasność wszystkich świateł pokoju.
   * `live: true` to update w trakcie gestu (throttlowany w komponencie),
   * `live: false` — finalna wartość po puszczeniu palca.
   * Pct ≤ 2 traktujemy jak intencję wyłączenia.
   */
  private _onRowBrightness(
    entries: HassEntityRegistryEntry[],
    fieldEntities: import('./types.js').TileFieldEntities | undefined,
    pct: number,
    live: boolean,
  ): void {
    if (!this.hass) return;
    const lightsIds = resolveFieldEntityIds(this.hass, entries, 'lights', fieldEntities);
    if (lightsIds.length === 0) return;
    if (pct <= 2 && !live) {
      void this.hass.callService('light', 'turn_off', { entity_id: lightsIds });
      return;
    }
    void this.hass.callService('light', 'turn_on', {
      entity_id: lightsIds,
      brightness_pct: Math.max(1, Math.min(100, pct)),
    });
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
    entries?: HassEntityRegistryEntry[],
    fieldEntities?: import('./types.js').TileFieldEntities,
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
      this._toggleRoomLights(entries ?? [], fieldEntities);
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
    entries: HassEntityRegistryEntry[],
    fieldEntities?: import('./types.js').TileFieldEntities,
  ): void {
    if (!this.hass) return;
    const ids = resolveFieldEntityIds(this.hass, entries, 'lights', fieldEntities);
    if (ids.length === 0) return;
    const anyOn = ids.some((id) => this.hass!.states[id]?.state === 'on');
    void this.hass.callService('light', anyOn ? 'turn_off' : 'turn_on', {
      entity_id: ids,
    });
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
    document.addEventListener('keydown', this._onPopupKey);
    this._pushBackGuard();
  }

  private _closeRoomPopupNow(): void {
    this._popupRoom = undefined;
    document.removeEventListener('keydown', this._onPopupKey);
  }

  private _closeRoomPopup = (): void => {
    if (this._consumeBackGuard()) return;
    this._closeRoomPopupNow();
  };

  private _onPopupKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && this._popupRoom) {
      ev.stopPropagation();
      this._closeRoomPopup();
    }
  };

  private _onBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this._closeRoomPopup();
  }

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      background: var(--stratum-card-background, var(--ha-card-background, var(--card-background-color, #1e1f22)));
      border-radius: var(--stratum-card-border-radius, var(--ha-card-border-radius, 12px));
      color: var(--stratum-card-color, var(--primary-text-color, #e8e8e8));
      overflow: hidden;
      box-shadow: var(--ha-card-box-shadow, none);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, transparent));
      transition: background 0.15s ease;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: var(--stratum-card-header-padding, 14px) 16px;
      cursor: pointer;
      user-select: none;
      background: transparent;
      border: 0;
      width: 100%;
      color: inherit;
      font: inherit;
      text-align: left;
      position: relative;
    }

    .header.has-accent-bar::before {
      content: '';
      position: absolute;
      top: 10px;
      bottom: 10px;
      left: 0;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--stratum-card-accent-bar-color, var(--primary-color, #ff9b42));
    }

    .header:hover {
      background: var(--stratum-card-hover-background, rgba(255, 255, 255, 0.04));
    }

    .header:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: -2px;
    }

    .area-icon {
      --mdc-icon-size: var(--stratum-card-icon-size, 22px);
      color: var(--stratum-card-icon-color, var(--primary-text-color));
      flex-shrink: 0;
    }

    .title {
      flex: 1;
      /* min-width: 0 jest kluczowe — bez tego flex nie pozwala się skurczyć
         i długa nazwa piętra rozpycha nagłówek poza kartę. */
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--stratum-card-title-size, 17px);
      font-weight: var(--stratum-card-title-weight, 500);
      letter-spacing: -0.01em;
      color: var(--stratum-card-title-color, var(--primary-text-color));
    }

    .chips {
      display: flex;
      gap: 6px;
      align-items: center;
      /* Chipy mogą się kurczyć i scrollować poziomo zamiast łamać nagłówek. */
      flex-shrink: 1;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 4px 0;
    }

    /* Badge alarmu na belce piętra — jak ⚠ N na wierszach. */
    .header-alarm-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1.5px solid
        color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 65%, transparent);
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 18%, transparent);
      color: var(--stratum-chip-leak-color, #f44336);
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      flex-shrink: 0;
      animation: stratum-header-alarm-pulse 1.6s ease-in-out infinite;
    }
    .header-alarm-badge ha-icon {
      --mdc-icon-size: 15px;
    }
    @keyframes stratum-header-alarm-pulse {
      0%,
      100% {
        box-shadow: 0 0 0 0
          color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 40%, transparent);
      }
      50% {
        box-shadow: 0 0 8px 3px
          color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 25%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .header-alarm-badge {
        animation: none;
      }
    }

    .chips::-webkit-scrollbar {
      display: none;
    }

    .expander {
      --mdc-icon-size: 20px;
      transition: transform 0.2s ease;
      color: var(--stratum-card-expander-color, var(--secondary-text-color));
      flex-shrink: 0;
    }

    .expander.open {
      transform: rotate(180deg);
    }

    .body-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows var(--stratum-card-expander-duration, 280ms)
        cubic-bezier(0.4, 0, 0.2, 1);
    }

    .body-wrap.open {
      grid-template-rows: 1fr;
    }

    .body {
      overflow: hidden;
      /* Wąskie boczne paddingi — wiersze-suwaki mają dochodzić blisko
         krawędzi karty (feedback: za dużo pustego miejsca po bokach). */
      padding: 0 var(--stratum-card-body-padding, 8px);
      border-top: 0.5px solid
        var(--stratum-card-divider-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
    }

    .body-wrap.open .body {
      padding: 6px var(--stratum-card-body-padding, 8px) 10px;
    }

    .rooms-grid {
      display: grid;
      /* grid-template-columns ustawiane inline-style z render() wg
         rooms_tile_columns (auto albo 1..6). minmax(0, 1fr) chroni
         przed rozpychaniem kolumny ponad dostępną szerokość. */
      gap: 8px;
    }

    .body-divider {
      height: 0;
      margin: 10px 0;
      border-top: 1px solid
        var(--stratum-card-divider-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
    }

    .rooms-grid .room-item.row-mode {
      grid-column: 1 / -1;
    }

    .placeholder {
      padding: 14px 0;
      color: var(--secondary-text-color);
      font-size: 13px;
      text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .body-wrap {
        transition: none;
      }
    }

    /* Popup: na telefonie fullscreen z 8 px marginesu; na szerszych ekranach
       rozsądny cap szerokości (jak dialogi HA) i wysokość wg treści — kafle
       nie rozciągają się na pół monitora. Overrides: --stratum-popup-margin,
       --stratum-popup-max-width, --stratum-popup-radius. */
    .stratum-popup-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--stratum-popup-margin, 8px);
      animation: stratum-popup-fade 0.15s ease-out;
    }

    @keyframes stratum-popup-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .stratum-popup-card {
      position: relative;
      width: 100%;
      max-width: var(--stratum-popup-max-width, min(94vw, 720px));
      height: auto;
      max-height: calc(100vh - 2 * var(--stratum-popup-margin, 8px));
      max-height: calc(100dvh - 2 * var(--stratum-popup-margin, 8px));
      overflow-y: auto;
      border-radius: var(--stratum-popup-radius, 16px);
      background: var(--ha-card-background, var(--card-background-color, #1e1f22));
      animation: stratum-popup-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Karta pokoju bez własnej ramki wewnątrz popupu. */
    .stratum-popup-card stratum-room-card {
      display: block;
      /* Rezerwa w headerze na przycisk × — chipy nie wjadą pod krzyżyk. */
      --stratum-room-header-pad-right: 46px;
    }

    .stratum-popup-card stratum-room-card::part(card) {
      box-sizing: border-box;
      border-radius: 0;
      border: 0;
      box-shadow: none;
    }

    /* Telefon: prawdziwy fullscreen — pełna szerokość i wysokość. */
    @media (max-width: 600px) {
      .stratum-popup-backdrop {
        align-items: stretch;
      }

      .stratum-popup-card {
        max-width: none;
        height: 100%;
      }

      .stratum-popup-card stratum-room-card {
        min-height: 100%;
      }

      .stratum-popup-card stratum-room-card::part(card) {
        min-height: calc(100vh - 2 * var(--stratum-popup-margin, 8px));
        min-height: calc(100dvh - 2 * var(--stratum-popup-margin, 8px));
      }
    }

    @keyframes stratum-popup-pop {
      from { transform: scale(0.95); opacity: 0.6; }
      to { transform: scale(1); opacity: 1; }
    }

    .stratum-popup-close {
      /* sticky (nie absolute): przycisk × zostaje w kadrze podczas scrollowania
         treści popupu. Ujemny margin-bottom nakłada go na kartę pod spodem.
         Neutralny, półprzezroczysty — nie konkuruje z chipami headera
         (header pokoju ma rezerwę --stratum-room-header-pad-right). */
      position: sticky;
      top: 10px;
      z-index: 5;
      margin-left: auto;
      margin-right: 10px;
      margin-bottom: -34px;
      transform: translateY(10px);
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.16));
      background: color-mix(in srgb, var(--card-background-color, #1c1e22) 72%, #000);
      color: var(--primary-text-color, #fff);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    .stratum-popup-close:hover {
      background: color-mix(in srgb, var(--card-background-color, #1c1e22) 45%, #000);
    }

    .stratum-popup-close ha-icon {
      --mdc-icon-size: 18px;
    }

    @media (prefers-reduced-motion: reduce) {
      .stratum-popup-backdrop,
      .stratum-popup-card {
        animation: none;
      }
    }
  `;
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
