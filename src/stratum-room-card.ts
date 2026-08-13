// stratum-room-card — widok detalu pomieszczenia z auto-generowanymi sekcjami.
//
// v1.0 1/3 — szkielet: rejestracja card type, setConfig, header z ikoną/nazwą/chipami.
// Placeholder sekcji zostanie zastąpiony listą aktywnych sekcji w 2/3.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
  RoomPopupOrderItem,
  RoomSectionConfig,
  RoomSectionSpec,
  RoomSectionType,
  StratumRoomCardConfig,
  SummaryField,
} from './types.js';
import { DEFAULT_POPUP_ORDER } from './types.js';
import { getEntitiesInArea, filterByDomain, filterBinarySensorDeviceClass } from './area-entities.js';
import { evaluateChip, resolveChipColor, resolveChipIcon } from './chip-defaults.js';
import { TemplateRenderer } from './template-renderer.js';
import './stratum-card-chip.js';
import './stratum-room-card-editor.js';
import './stratum-room-tile.js';
import './stratum-scene-bar.js';

const VERSION = '1.23.0';

interface SummaryDatum {
  label: string;
  icon: string;
  value: string;
  active: boolean;
  color: string;
}

/**
 * Auto-wybór chipów dla room card: lights + motion zawsze (nawet gdy 0),
 * windows/doors/leak tylko gdy coś aktywne. Plus entity-chipy temperatury
 * i wilgotności jeśli są sensory.
 */
function autoRoomChips(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
): ChipConfig[] {
  const chips: ChipConfig[] = [
    { type: 'lights' },
    // Styl mushroom: czas od ostatniego ruchu (16s / 5min / 2h) zamiast licznika.
    { type: 'motion', show_last_changed: true },
    { type: 'windows', show_when_zero: false },
    { type: 'doors', show_when_zero: false },
    { type: 'leak', show_when_zero: false },
  ];
  const temp = entries.find(
    (e) => hass.states?.[e.entity_id]?.attributes?.device_class === 'temperature',
  );
  if (temp) chips.push({ type: 'temperature' });
  const hum = entries.find(
    (e) => hass.states?.[e.entity_id]?.attributes?.device_class === 'humidity',
  );
  if (hum) chips.push({ type: 'humidity' });
  return chips;
}

import { SECTION_ICON, SECTION_LABEL, SECTION_LAYOUT } from './section-defaults.js';

/**
 * Normalizuje spec sekcji do pełnego configu. Explicit wpisy NADPISUJĄ
 * konfigurację auto-wykrytych typów; auto-typy spoza listy są DOKLEJANE
 * (wyłączanie bloków robi popup_order.hidden albo section.hidden).
 */
function normalizeSections(
  input: RoomSectionSpec[] | undefined,
  autoDetected: RoomSectionType[],
): RoomSectionConfig[] {
  const explicit = (input ?? []).map((s) =>
    typeof s === 'string' ? ({ type: s } as RoomSectionConfig) : s,
  );
  if (explicit.length === 0) return autoDetected.map((t) => ({ type: t }));
  const seen = new Set(explicit.map((s) => s.type));
  return [
    ...explicit,
    ...autoDetected.filter((t) => !seen.has(t)).map((t) => ({ type: t }) as RoomSectionConfig),
  ];
}

/** Filtry per sekcja — jakie encje do niej należą. */
function entitiesForSection(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
  section: RoomSectionType,
): HassEntityRegistryEntry[] {
  switch (section) {
    case 'lights':
      return filterByDomain(entries, 'light');
    case 'covers':
      return filterByDomain(entries, 'cover');
    case 'windows':
      return filterBinarySensorDeviceClass(hass, entries, 'window');
    case 'doors':
      return filterBinarySensorDeviceClass(hass, entries, 'door');
    case 'climate':
      return filterByDomain(entries, 'climate');
    case 'media':
      return filterByDomain(entries, 'media_player');
    case 'fans':
      return filterByDomain(entries, 'fan');
    case 'switches':
      return filterByDomain(entries, 'switch');
    case 'scenes':
      return filterByDomain(entries, 'scene');
    case 'summary':
    case 'custom':
      return [];
  }
}

/** Auto-discover: sekcje dla których są encje. Kolejność — utrwalona. */
function autoSections(
  hass: HomeAssistant,
  entries: HassEntityRegistryEntry[],
): RoomSectionType[] {
  const order: RoomSectionType[] = [
    'scenes',
    'lights',
    'covers',
    'windows',
    'doors',
    'climate',
    'media',
    'fans',
    'switches',
  ];
  return order.filter((s) => entitiesForSection(hass, entries, s).length > 0);
}

@customElement('stratum-room-card')
export class StratumRoomCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumRoomCardConfig;

  /** Rozwinięte listy „Pozostałe" w sekcjach grupowanych (klucz = sekcja). */
  @state() private _openRest = new Set<string>();

  private _templates = new TemplateRenderer(() => this.requestUpdate());

  public setConfig(config: StratumRoomCardConfig): void {
    if (!config) throw new Error('Konfiguracja jest wymagana.');
    if (!config.area_id) throw new Error('Podaj `area_id`.');
    this._config = config;
  }

  /** Ustawia config poprzez Lit property (dla osadzania w popup). */
  public set config(value: StratumRoomCardConfig) {
    if (value) this.setConfig(value);
  }

  public getCardSize(): number {
    return 6;
  }

  /** Powiązuje wizualny editor z kartą. */
  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('stratum-room-card-editor');
  }

  /** Sensowny default gdy user dodaje kartę przez wizard „Add card". */
  public static getStubConfig(hass: HomeAssistant): Partial<StratumRoomCardConfig> {
    const firstArea = hass?.areas && Object.keys(hass.areas)[0];
    return { area_id: firstArea ?? '' };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._templates.destroy();
  }

  private _getEntries(): HassEntityRegistryEntry[] {
    if (!this.hass || !this._config) return [];
    const ids = [this._config.area_id, ...(this._config.merge_with ?? [])];
    const seen = new Set<string>();
    const out: HassEntityRegistryEntry[] = [];
    for (const id of ids) {
      for (const entry of getEntitiesInArea(this.hass, id)) {
        if (seen.has(entry.entity_id)) continue;
        seen.add(entry.entity_id);
        out.push(entry);
      }
    }
    return out;
  }

  private _resolveName(): string {
    if (this._config?.name) return this._config.name;
    if (this._config?.area_id && this.hass?.areas) {
      return this.hass.areas[this._config.area_id]?.name ?? this._config.area_id;
    }
    return 'Pomieszczenie';
  }

  private _resolveIcon(): string {
    if (this._config?.icon) return this._config.icon;
    if (this._config?.area_id && this.hass?.areas) {
      const icon = this.hass.areas[this._config.area_id]?.icon;
      if (icon) return icon;
    }
    return 'mdi:floor-plan';
  }

  private _renderChips(entries: HassEntityRegistryEntry[]): TemplateResult[] {
    if (!this.hass) return [];
    this._templates.setHass(this.hass);
    const chips = this._config?.chips ?? autoRoomChips(this.hass, entries);
    const rendered: TemplateResult[] = [];
    for (const chip of chips) {
      const value = evaluateChip(this.hass!, entries, chip, this._templates);
      const showWhenZero = chip.show_when_zero !== false;
      if (!value.active && !showWhenZero) continue;
      rendered.push(html`<stratum-card-chip
        .icon=${chip.icon ?? value.icon ?? resolveChipIcon(chip)}
        .label=${value.label}
        .active=${value.active}
        .color=${chip.color ?? value.color ?? resolveChipColor(chip)}
        .showWhenZero=${showWhenZero}
      ></stratum-card-chip>`);
    }
    return rendered;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    if (!this.hass) return nothing;

    const entries = this._getEntries();
    const name = this._resolveName();
    const icon = this._resolveIcon();
    const autoTypes = autoSections(this.hass, entries);
    const sections = normalizeSections(this._config.sections, autoTypes).filter(
      (s) => !s.hidden,
    );

    // Explicit scenes config zastępuje sekcję scenes.
    const hasExplicitScenes =
      this._config.scenes && (this._config.scenes.items ?? []).length > 0;

    return html`
      <ha-card part="card">
        <div class="header" part="header">
          <ha-icon class="icon" part="room-icon" .icon=${icon}></ha-icon>
          <span class="title" part="title">${name}</span>
          <div class="chips" part="chips">${this._renderChips(entries)}</div>
        </div>
        <div class="body" part="body">
          ${sections.length === 0 && !hasExplicitScenes
            ? html`<div class="placeholder">
                Brak encji do wyświetlenia — sprawdź przypisanie area.
              </div>`
            : this._renderOrderedBlocks(entries, sections, Boolean(hasExplicitScenes))}
        </div>
      </ha-card>
    `;
  }

  /** Kolejność bloków: config popup_order + brakujące klucze wg defaultu. */
  private _resolvedPopupOrder(): RoomPopupOrderItem[] {
    const cfg = this._config?.popup_order ?? [];
    const seen = new Set(cfg.map((i) => i.section));
    return [
      ...cfg.filter((i) => DEFAULT_POPUP_ORDER.includes(i.section)),
      ...DEFAULT_POPUP_ORDER.filter((k) => !seen.has(k)).map((k) => ({
        section: k,
      })),
    ];
  }

  /**
   * Body popupu jako bloki w konfigurowalnej kolejności: sceny, grupy
   * świateł, encje światła (poza grupami), rolety, media, pozostałe sekcje.
   * `hidden` na pozycji wyłącza blok całkowicie.
   */
  private _renderOrderedBlocks(
    entries: HassEntityRegistryEntry[],
    sections: RoomSectionConfig[],
    hasExplicitScenes: boolean,
  ): TemplateResult[] {
    const findSec = (t: RoomSectionType): RoomSectionConfig =>
      sections.find((s) => s.type === t) ?? { type: t };
    const out: TemplateResult[] = [];
    for (const item of this._resolvedPopupOrder()) {
      if (item.hidden) continue;
      switch (item.section) {
        case 'scenes':
          if (hasExplicitScenes) {
            out.push(
              html`<stratum-scene-bar
                .hass=${this.hass}
                .config=${this._config!.scenes}
              ></stratum-scene-bar>`,
            );
          } else {
            out.push(this._renderSection(findSec('scenes'), entries));
          }
          break;
        case 'light_groups':
          out.push(this._renderLightsMain(findSec('lights'), entries));
          break;
        case 'light_entities':
          out.push(this._renderLightsRest(findSec('lights'), entries));
          break;
        case 'covers':
          if ((this._config?.covers_list?.items?.length ?? 0) > 0) {
            out.push(this._renderCoversExplicit(findSec('covers')));
          } else {
            out.push(
              this._renderSection(
                findSec('covers'),
                entries,
                this._config?.popup_extra?.covers,
              ),
            );
          }
          break;
        case 'media':
          if ((this._config?.media_list?.items?.length ?? 0) > 0) {
            out.push(this._renderMediaExplicit(findSec('media')));
          } else {
            out.push(
              this._renderSection(
                findSec('media'),
                entries,
                this._config?.popup_extra?.media,
              ),
            );
          }
          break;
        case 'extra':
          for (const s of sections) {
            if (
              s.type === 'scenes' ||
              s.type === 'lights' ||
              s.type === 'covers' ||
              s.type === 'media'
            ) {
              continue;
            }
            out.push(this._renderSection(s, entries));
          }
          break;
      }
    }
    return out;
  }

  /** Encje light sekcji (z filtrem section.entities + popup_extra). */
  private _lightItems(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
  ): HassEntityRegistryEntry[] {
    let items: HassEntityRegistryEntry[];
    if (section.entities && section.entities.length > 0) {
      items = section.entities
        .map(
          (id) =>
            this.hass!.entities?.[id] ?? ({ entity_id: id } as HassEntityRegistryEntry),
        )
        .filter((e) => Boolean(this.hass!.states?.[e.entity_id]));
    } else {
      items = entitiesForSection(this.hass!, entries, 'lights');
    }
    // Extra spoza obszaru: grupy i pojedyncze — filtr isGroup rozdzieli je
    // na właściwe bloki.
    items = this._appendExtra(items, this._config?.popup_extra?.light_groups);
    items = this._appendExtra(items, this._config?.popup_extra?.light_entities);
    return items;
  }

  private _isLightGroup(id: string): boolean {
    return Array.isArray(this.hass?.states?.[id]?.attributes?.entity_id);
  }

  /** Badge „Auto" w nagłówku świateł — toggle pomocnika automatyzacji. */
  private _renderAutoBadge(): TemplateResult | typeof nothing {
    const id = this._config?.light_auto_entity;
    const st = id ? this.hass?.states?.[id] : undefined;
    if (!id || !st) return nothing;
    const on = st.state === 'on';
    return html`
      <button
        class="auto-badge ${on ? 'on' : 'off'}"
        title=${on ? 'Automatyka świateł włączona — kliknij aby wyłączyć' : 'Automatyka świateł wyłączona — kliknij aby włączyć'}
        @click=${(ev: Event) => {
          ev.stopPropagation();
          void this.hass?.callService('homeassistant', 'toggle', { entity_id: id });
        }}
      >
        <ha-icon .icon=${'mdi:lightbulb-auto'}></ha-icon>
        Auto
      </button>
    `;
  }

  /**
   * Blok „Grupy świateł": WYŁĄCZNIE pomocniki „Grupa światła" (jawna lista
   * z configu ma pierwszeństwo). Brak grup = blok się nie renderuje —
   * pojedyncze encje żyją w bloku „Encje światła".
   */
  private _renderLightsMain(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
  ): TemplateResult {
    const title = section.title ?? 'Grupy świateł';
    const iconName = section.icon ?? 'mdi:lightbulb-group';
    if ((this._config?.lights?.items?.length ?? 0) > 0) {
      return this._renderLightsExplicit(section, title, iconName);
    }
    const groups = this._lightItems(section, entries).filter((e) =>
      this._isLightGroup(e.entity_id),
    );
    if (groups.length === 0) return html``;
    const mode = section.mode ?? 'rail';
    const layout =
      section.columns === 1
        ? 'grid-1'
        : section.columns === 3
        ? 'grid-3'
        : mode.startsWith('custom:')
        ? 'grid-1'
        : 'grid-2';
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          ${this._renderAutoBadge()}
          <span class="count">${groups.length}</span>
        </div>
        <div class="tiles ${layout}">
          ${groups.map(
            (e) => html`<stratum-room-tile
              .hass=${this.hass}
              .entity=${e.entity_id}
              .mode=${mode}
              .cardTemplate=${section.card_template}
            ></stratum-room-tile>`,
          )}
        </div>
      </div>
    `;
  }

  /**
   * Blok „Encje światła": WSZYSTKIE pojedyncze (nie-grupowe) światła
   * pomieszczenia. Gdy są grupy — zwinięte pod przyciskiem; bez grup —
   * normalna, otwarta sekcja.
   */
  private _renderLightsRest(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
  ): TemplateResult {
    // Jawna lista pojedynczych świateł — otwarta sekcja wg configu.
    if ((this._config?.light_singles?.items?.length ?? 0) > 0) {
      const all = this._visibleListItems(this._config?.light_singles);
      const count = all.filter((i) => !i.separator && i.entity).length;
      if (count === 0) return html``;
      const mode = section.mode ?? 'rail';
      const layout =
        section.columns === 1
          ? 'grid-1'
          : section.columns === 3
          ? 'grid-3'
          : mode.startsWith('custom:')
          ? 'grid-1'
          : 'grid-2';
      return html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${'mdi:lightbulb-outline'}></ha-icon>
            <span>Encje światła</span>
            <span class="count">${count}</span>
          </div>
          ${this._renderListBlocks(all, mode, layout)}
        </div>
      `;
    }

    const items = this._lightItems(section, entries);
    const singles = items.filter((e) => !this._isLightGroup(e.entity_id));
    if (singles.length === 0) return html``;
    const hasGroups =
      items.some((e) => this._isLightGroup(e.entity_id)) ||
      (this._config?.lights?.items?.length ?? 0) > 0;

    const mode = section.mode ?? 'rail';
    const layout =
      section.columns === 1
        ? 'grid-1'
        : section.columns === 3
        ? 'grid-3'
        : mode.startsWith('custom:')
        ? 'grid-1'
        : 'grid-2';
    const tiles = html`<div class="tiles ${layout}">
      ${singles.map(
        (e) => html`<stratum-room-tile
          .hass=${this.hass}
          .entity=${e.entity_id}
          .mode=${mode}
        ></stratum-room-tile>`,
      )}
    </div>`;

    // Bez grup: encje to jedyna lista świateł — pokazujemy otwartą sekcję.
    if (!hasGroups) {
      return html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${'mdi:lightbulb-outline'}></ha-icon>
            <span>Encje światła</span>
            <span class="count">${singles.length}</span>
          </div>
          ${tiles}
        </div>
      `;
    }

    const restKey = 'light_entities';
    const restOpen = this._openRest.has(restKey);
    return html`
      <div class="section" part="section">
        <button class="rest-toggle" @click=${() => this._toggleRest(restKey)}>
          <ha-icon .icon=${restOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
          <span>Encje światła</span>
          <span class="rest-count">${singles.length}</span>
        </button>
        ${restOpen ? tiles : nothing}
      </div>
    `;
  }

  /** Dokleja encje spoza obszaru (popup_extra) do listy sekcji, z dedupem. */
  private _appendExtra(
    items: HassEntityRegistryEntry[],
    extraIds: string[] | undefined,
  ): HassEntityRegistryEntry[] {
    if (!extraIds || extraIds.length === 0) return items;
    const seen = new Set(items.map((e) => e.entity_id));
    const out = [...items];
    for (const id of extraIds) {
      if (seen.has(id) || !this.hass!.states?.[id]) continue;
      seen.add(id);
      out.push(this.hass!.entities?.[id] ?? ({ entity_id: id } as HassEntityRegistryEntry));
    }
    return out;
  }

  private _renderSection(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
    extraIds?: string[],
  ): TemplateResult {
    const type = section.type;
    const title = section.title ?? SECTION_LABEL[type];
    const iconName = section.icon ?? SECTION_ICON[type];

    if (type === 'summary') return this._renderSummary(section, entries, title, iconName);
    if (type === 'custom') return this._renderCustomCard(section, title, iconName);

    let items: HassEntityRegistryEntry[];
    if (section.entities && section.entities.length > 0) {
      // User podał jawne entities — bierzemy je z hass.entities registry niezależnie
      // od area scope. Encja może być grupą/template'm bez area_id i powinna działać.
      items = section.entities
        .map(
          (id) =>
            this.hass!.entities?.[id] ?? ({ entity_id: id } as HassEntityRegistryEntry),
        )
        .filter((e) => Boolean(this.hass!.states?.[e.entity_id]));
    } else {
      items = entitiesForSection(this.hass!, entries, type);
    }
    items = this._appendExtra(items, extraIds);
    if (items.length === 0) return html``;

    // Światła — jawna lista z konfiguracji pokoju (widoczność, nazwy,
    // kolejność, separatory) wygrywa nad auto-discovery.
    if (type === 'lights' && (this._config?.lights?.items?.length ?? 0) > 0) {
      return this._renderLightsExplicit(section, title, iconName);
    }

    // Światła: grupowanie po pomocnikach „Grupa światła" (default). Gdy area
    // ma light-grupy — pokazujemy TYLKO je, składowe chowamy, resztę do
    // zwijanego „Pozostałe". Bez grup (albo group_by: none) — płaska lista.
    if (type === 'lights' && (section.group_by ?? 'helpers') === 'helpers') {
      const grouped = this._renderLightsGrouped(section, items, title, iconName);
      if (grouped) return grouped;
    }

    // Media: default = JEDEN duży player z okładką (auto: ten, który gra),
    // reszta odtwarzaczy w zwijanym „Pozostałe". mode: tile przywraca listę.
    if (type === 'media' && (section.mode ?? 'player') === 'player') {
      return this._renderMediaSection(section, items, title, iconName);
    }

    // Sceny: default = graficzne kafle (scene-bar), także dla auto-wykrytych.
    // Explicit mode (tile/bubble/chips/icon) przywraca stare renderowanie.
    if (type === 'scenes' && !section.mode) {
      return this._renderScenesBar(section, items, title, iconName);
    }

    const mode = section.mode ?? 'tile';
    const layoutOverride =
      mode === 'chips' ? 'chips-layout'
      : mode === 'icon' ? 'icon-layout'
      : mode === 'bubble' ? 'bubble-layout'
      : mode === 'ambient' ? 'grid-1'
      : null;
    const layout =
      layoutOverride ??
      (section.columns === 1
        ? 'grid-1'
        : section.columns === 2
        ? 'grid-2'
        : section.columns === 3
        ? 'grid-3'
        : SECTION_LAYOUT[type]);

    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          <span class="count">${items.length}</span>
        </div>
        ${type === 'covers' ? this._renderCoversMaster(section, items) : nothing}
        <div class="tiles ${layout}">
          ${items.map(
            (e) =>
              html`<stratum-room-tile
                .hass=${this.hass}
                .entity=${e.entity_id}
                .mode=${mode}
                .cardTemplate=${section.card_template}
              ></stratum-room-tile>`,
          )}
        </div>
      </div>
    `;
  }

  /**
   * Sekcja scen jako graficzne kafle — auto-wykryte sceny obszaru dostają
   * domyślny wygląd scene-bara (ikona z encji + kolor). Pełną kontrolę
   * (nazwy, grafiki, ukrywanie, sceny spoza obszaru) daje panel „Sceny"
   * w edycji pokoju — wtedy explicit config zastępuje tę sekcję.
   */
  private _renderScenesBar(
    section: RoomSectionConfig,
    items: HassEntityRegistryEntry[],
    title: string,
    iconName: string,
  ): TemplateResult {
    const barConfig: import('./types.js').SceneBarConfig = {
      items: items.map((e) => {
        const icon = this.hass!.states?.[e.entity_id]?.attributes?.icon as
          | string
          | undefined;
        return icon ? { entity: e.entity_id, icon } : { entity: e.entity_id };
      }),
      columns: typeof section.columns === 'number' ? section.columns : 3,
    };
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          <span class="count">${items.length}</span>
        </div>
        <stratum-scene-bar .hass=${this.hass} .config=${barConfig}></stratum-scene-bar>
      </div>
    `;
  }

  /**
   * Pasek akcji zbiorczych rolet (Otwórz / Stop / Zamknij + szybkie pozycje
   * %) — działa na WSZYSTKIE covery sekcji naraz. `master: false` chowa.
   */
  private _renderCoversMaster(
    section: RoomSectionConfig,
    items: HassEntityRegistryEntry[],
  ): TemplateResult | typeof nothing {
    if (section.master === false || items.length === 0) return nothing;
    const ids = items.map((e) => e.entity_id);
    const positions = (
      section.positions && section.positions.length > 0
        ? section.positions
        : [50, 75]
    )
      .filter((p) => Number.isFinite(p) && p > 0 && p < 100)
      .sort((a, b) => a - b);
    const call = (service: string, data: Record<string, unknown> = {}): void => {
      void this.hass?.callService('cover', service, { entity_id: ids, ...data });
    };
    return html`
      <div class="cover-master" part="cover-master">
        <button class="cm-btn cm-open" @click=${() => call('open_cover')}>
          <ha-icon .icon=${'mdi:arrow-up'}></ha-icon>
          Otwórz
        </button>
        <button class="cm-btn cm-stop" @click=${() => call('stop_cover')}>
          <ha-icon .icon=${'mdi:square'}></ha-icon>
          Stop
        </button>
        <button class="cm-btn cm-close" @click=${() => call('close_cover')}>
          <ha-icon .icon=${'mdi:arrow-down'}></ha-icon>
          Zamknij
        </button>
        ${positions.map(
          (p) => html`<button
            class="cm-btn cm-pct"
            title="Ustaw wszystkie na ${p}%"
            @click=${() => call('set_cover_position', { position: p })}
          >
            <ha-icon .icon=${'mdi:percent-outline'}></ha-icon>
            ${p}%
          </button>`,
        )}
      </div>
    `;
  }

  /** Widoczne pozycje jawnej listy (bez ukrytych, encje muszą istnieć). */
  private _visibleListItems(
    cfg: import('./types.js').RoomLightsConfig | undefined,
  ): import('./types.js').RoomLightItemConfig[] {
    return (cfg?.items ?? []).filter(
      (i) =>
        !i.hidden &&
        (i.separator || (i.entity && Boolean(this.hass?.states?.[i.entity]))),
    );
  }

  /** Kafle jawnej listy: separatory przecinają siatkę, overridy per pozycja. */
  private _renderListBlocks(
    items: import('./types.js').RoomLightItemConfig[],
    mode: string,
    layout: string,
    cardTemplate?: Record<string, unknown>,
  ): TemplateResult[] {
    const blocks: TemplateResult[] = [];
    let run: import('./types.js').RoomLightItemConfig[] = [];
    const flush = (): void => {
      if (run.length === 0) return;
      const tiles = run.map(
        (i) => html`<stratum-room-tile
          .hass=${this.hass}
          .entity=${i.entity!}
          .mode=${mode}
          .nameOverride=${i.name}
          .iconOverride=${i.icon}
          .tapAction=${i.tap_action}
          .cardTemplate=${cardTemplate}
        ></stratum-room-tile>`,
      );
      blocks.push(html`<div class="tiles ${layout}">${tiles}</div>`);
      run = [];
    };
    for (const item of items) {
      if (item.separator) {
        flush();
        blocks.push(
          item.label
            ? html`<div class="lights-sep"><span>${item.label}</span></div>`
            : html`<div class="lights-sep plain"></div>`,
        );
      } else if (item.entity) {
        run.push(item);
      }
    }
    flush();
    return blocks;
  }

  /**
   * Sekcja z jawnej listy (konfiguracja pokoju): kolejność jak w configu,
   * ukryte pomijamy, separatory przecinają siatkę kafli.
   */
  private _renderLightsExplicit(
    section: RoomSectionConfig,
    title: string,
    iconName: string,
  ): TemplateResult {
    const all = this._visibleListItems(this._config?.lights);
    const mode = section.mode ?? 'rail';
    const layout =
      section.columns === 1
        ? 'grid-1'
        : section.columns === 3
        ? 'grid-3'
        : mode.startsWith('custom:')
        ? 'grid-1'
        : 'grid-2';
    const count = all.filter((i) => !i.separator && i.entity).length;
    if (count === 0) return html``;
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          ${this._renderAutoBadge()}
          <span class="count">${count}</span>
        </div>
        ${this._renderListBlocks(all, mode, layout, section.card_template)}
      </div>
    `;
  }

  /** Jawna lista rolet: pasek master + kafle wg configu. */
  private _renderCoversExplicit(section: RoomSectionConfig): TemplateResult {
    const all = this._visibleListItems(this._config?.covers_list);
    const entityItems = all.filter((i) => !i.separator && i.entity);
    if (entityItems.length === 0) return html``;
    const mode = section.mode ?? 'tile';
    const layout =
      section.columns === 2 ? 'grid-2' : section.columns === 3 ? 'grid-3' : 'grid-1';
    const entries = entityItems.map(
      (i) =>
        this.hass!.entities?.[i.entity!] ??
        ({ entity_id: i.entity! } as HassEntityRegistryEntry),
    );
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${section.icon ?? SECTION_ICON['covers']}></ha-icon>
          <span>${section.title ?? SECTION_LABEL['covers']}</span>
          <span class="count">${entityItems.length}</span>
        </div>
        ${this._renderCoversMaster(section, entries)}
        ${this._renderListBlocks(all, mode, layout, section.card_template)}
      </div>
    `;
  }

  /** Jawna lista mediów: pierwszy widoczny (lub wskazany) jako duży player. */
  private _renderMediaExplicit(section: RoomSectionConfig): TemplateResult {
    const all = this._visibleListItems(this._config?.media_list);
    const entityItems = all.filter((i) => !i.separator && i.entity);
    if (entityItems.length === 0) return html``;
    // Styl custom (bubble/mushroom): każda pozycja jako karta HACS.
    const mMode = section.mode ?? 'player';
    if (mMode.startsWith('custom:')) {
      return html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${section.icon ?? SECTION_ICON['media']}></ha-icon>
            <span>${section.title ?? SECTION_LABEL['media']}</span>
            <span class="count">${entityItems.length}</span>
          </div>
          ${this._renderListBlocks(all, mMode, 'grid-1', section.card_template)}
        </div>
      `;
    }
    const featured =
      entityItems.find((i) => i.entity === section.entity) ?? entityItems[0]!;
    const rest = all.filter((i) => i !== featured);
    const restCount = rest.filter((i) => !i.separator && i.entity).length;
    const restKey = 'media:list';
    const restOpen = this._openRest.has(restKey);
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${section.icon ?? SECTION_ICON['media']}></ha-icon>
          <span>${section.title ?? SECTION_LABEL['media']}</span>
          ${restCount > 0
            ? html`<span class="count">${entityItems.length}</span>`
            : nothing}
        </div>
        <stratum-room-tile
          .hass=${this.hass}
          .entity=${featured.entity!}
          .mode=${'player'}
          .nameOverride=${featured.name}
          .tapAction=${featured.tap_action}
        ></stratum-room-tile>
        ${restCount > 0
          ? html`
              <button class="rest-toggle" @click=${() => this._toggleRest(restKey)}>
                <ha-icon
                  .icon=${restOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                ></ha-icon>
                <span>Pozostałe odtwarzacze</span>
                <span class="rest-count">${restCount}</span>
              </button>
              ${restOpen
                ? html`${this._renderListBlocks(rest, 'tile', 'grid-1')}`
                : nothing}
            `
          : nothing}
      </div>
    `;
  }

  /**
   * Sekcja lights pogrupowana po light-grupach (pomocnikach) z area.
   * Zwraca null gdy area nie ma żadnej grupy — wtedy caller renderuje
   * płaską listę jak dotychczas.
   */
  private _renderLightsGrouped(
    section: RoomSectionConfig,
    items: HassEntityRegistryEntry[],
    title: string,
    iconName: string,
  ): TemplateResult | null {
    const hass = this.hass!;
    const isGroup = (id: string): boolean =>
      Array.isArray(hass.states?.[id]?.attributes?.entity_id);
    const groups = items.filter((e) => isGroup(e.entity_id));
    if (groups.length === 0) return null;

    const members = new Set<string>();
    for (const g of groups) {
      const ids = hass.states![g.entity_id]!.attributes!.entity_id as string[];
      for (const m of ids) members.add(m);
    }
    const rest = items.filter(
      (e) => !isGroup(e.entity_id) && !members.has(e.entity_id),
    );

    const mode = section.mode ?? 'rail';
    const layout =
      section.columns === 1 ? 'grid-1' : section.columns === 3 ? 'grid-3' : 'grid-2';
    const restKey = `lights:${title}`;
    const restOpen = this._openRest.has(restKey);
    const tile = (e: HassEntityRegistryEntry): TemplateResult =>
      html`<stratum-room-tile
        .hass=${this.hass}
        .entity=${e.entity_id}
        .mode=${mode}
        .cardTemplate=${section.card_template}
      ></stratum-room-tile>`;

    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          <span class="count">${groups.length}</span>
        </div>
        <div class="tiles ${layout}">${groups.map(tile)}</div>
        ${rest.length > 0
          ? html`
              <button class="rest-toggle" @click=${() => this._toggleRest(restKey)}>
                <ha-icon
                  .icon=${restOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                ></ha-icon>
                <span>Pozostałe światła</span>
                <span class="rest-count">${rest.length}</span>
              </button>
              ${restOpen
                ? html`<div class="tiles ${layout}">${rest.map(tile)}</div>`
                : nothing}
            `
          : nothing}
      </div>
    `;
  }

  /**
   * Sekcja media (mode player): jeden duży player z okładką + reszta
   * odtwarzaczy zwinięta. Wybór głównego: `section.entity`, a bez niego
   * auto — playing > paused > włączony > pierwszy dostępny.
   */
  private _renderMediaSection(
    section: RoomSectionConfig,
    items: HassEntityRegistryEntry[],
    title: string,
    iconName: string,
  ): TemplateResult {
    const hass = this.hass!;
    const priority = (id: string): number => {
      const s = hass.states?.[id]?.state;
      switch (s) {
        case 'playing':
          return 5;
        case 'paused':
        case 'buffering':
          return 4;
        case 'on':
        case 'idle':
          return 3;
        case 'off':
        case 'standby':
          return 2;
        default:
          return 0; // unavailable/unknown na koniec
      }
    };

    let featured: HassEntityRegistryEntry | undefined;
    if (section.entity) {
      featured = items.find((e) => e.entity_id === section.entity);
      if (!featured && hass.states?.[section.entity]) {
        featured = { entity_id: section.entity } as HassEntityRegistryEntry;
      }
    }
    if (!featured) {
      featured = [...items].sort(
        (a, b) => priority(b.entity_id) - priority(a.entity_id),
      )[0];
    }
    if (!featured) return html``;

    const rest = items
      .filter((e) => e.entity_id !== featured!.entity_id)
      .sort((a, b) => priority(b.entity_id) - priority(a.entity_id));
    const restKey = `media:${title}`;
    const restOpen = this._openRest.has(restKey);

    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          ${rest.length > 0
            ? html`<span class="count">${items.length}</span>`
            : nothing}
        </div>
        <stratum-room-tile
          .hass=${this.hass}
          .entity=${featured.entity_id}
          .mode=${'player'}
        ></stratum-room-tile>
        ${rest.length > 0
          ? html`
              <button class="rest-toggle" @click=${() => this._toggleRest(restKey)}>
                <ha-icon
                  .icon=${restOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                ></ha-icon>
                <span>Pozostałe odtwarzacze</span>
                <span class="rest-count">${rest.length}</span>
              </button>
              ${restOpen
                ? html`<div class="tiles grid-1">
                    ${rest.map(
                      (e) => html`<stratum-room-tile
                        .hass=${this.hass}
                        .entity=${e.entity_id}
                        .mode=${'tile'}
                      ></stratum-room-tile>`,
                    )}
                  </div>`
                : nothing}
            `
          : nothing}
      </div>
    `;
  }

  private _toggleRest(key: string): void {
    const next = new Set(this._openRest);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._openRest = next;
  }

  private _renderCustomCard(
    section: RoomSectionConfig,
    title: string,
    iconName: string,
  ): TemplateResult {
    if (!section.card) {
      return html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${iconName}></ha-icon>
            <span>${title}</span>
          </div>
          <div class="placeholder">Sekcja custom bez configu karty.</div>
        </div>
      `;
    }
    const card = this._mountCustomCard(section.card);
    return html`
      <div class="section" part="section">
        ${section.title
          ? html`<div class="section-header" part="section-header">
              <ha-icon .icon=${iconName}></ha-icon>
              <span>${title}</span>
            </div>`
          : null}
        <div class="custom-card-slot">${card}</div>
      </div>
    `;
  }

  /** Kreuje / re-używa element dowolnej karty HA (`<hui-card>`). */
  private _customCards = new Map<string, HTMLElement>();

  private _mountCustomCard(config: Record<string, unknown>): HTMLElement {
    const key = JSON.stringify(config);
    let el = this._customCards.get(key);
    if (!el) {
      el = document.createElement('hui-card');
      this._customCards.set(key, el);
    }
    // Always refresh hass + config (Lit will re-run render, card element is cached).
    (el as unknown as { hass?: HomeAssistant }).hass = this.hass;
    (el as unknown as { config?: Record<string, unknown> }).config = config;
    return el;
  }

  private _renderSummary(
    section: RoomSectionConfig,
    entries: HassEntityRegistryEntry[],
    title: string,
    iconName: string,
  ): TemplateResult {
    const fields: SummaryField[] = section.fields ?? [
      'motion',
      'temperature',
      'humidity',
      'lights_on',
      'windows_open',
      'doors_open',
    ];
    const data = fields
      .map((f) => this._summaryData(f, entries))
      .filter((d): d is SummaryDatum => d !== null);
    if (data.length === 0) return html``;
    const mode = section.mode ?? 'cards';
    const body =
      mode === 'chips'
        ? html`<div class="summary-chips">
            ${data.map(
              (d) => html`
                <span
                  class="summary-chip ${d.active ? 'active' : 'inactive'}"
                  style=${d.active ? `--stratum-sum-accent:${d.color};` : ''}
                  title=${d.label}
                >
                  <ha-icon .icon=${d.icon}></ha-icon>
                  <span>${d.value}</span>
                </span>
              `,
            )}
          </div>`
        : html`<div class="summary-grid">
            ${data.map((d) => this._summaryItem(d.label, d.icon, d.value, d.active, d.color))}
          </div>`;
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
        </div>
        ${body}
      </div>
    `;
  }

  private _summaryData(
    field: SummaryField,
    entries: HassEntityRegistryEntry[],
  ): SummaryDatum | null {
    const hass = this.hass!;
    const mk = (label: string, icon: string, value: string, active: boolean, color: string): SummaryDatum => ({
      label, icon, value, active, color,
    });
    switch (field) {
      case 'motion':
      case 'occupancy': {
        const on = filterBinarySensorDeviceClass(hass, entries, field).some(
          (e) => hass.states?.[e.entity_id]?.state === 'on',
        );
        return mk('Obecność', 'mdi:motion-sensor', on ? 'aktywna' : 'brak', on, '#4caf50');
      }
      case 'temperature':
      case 'humidity': {
        const cls = field;
        const entry = entries.find(
          (e) =>
            e.entity_id.startsWith('sensor.') &&
            hass.states?.[e.entity_id]?.attributes?.device_class === cls,
        );
        if (!entry) return null;
        const state = hass.states?.[entry.entity_id];
        if (!state) return null;
        const unit = (state.attributes?.unit_of_measurement as string | undefined) ??
          (cls === 'temperature' ? '°C' : '%');
        const label = cls === 'temperature' ? 'Temperatura' : 'Wilgotność';
        const icon = cls === 'temperature' ? 'mdi:thermometer' : 'mdi:water-percent';
        const color = cls === 'temperature' ? '#ffc107' : '#42a5f5';
        return mk(label, icon, `${state.state} ${unit}`, true, color);
      }
      case 'lights_on': {
        const n = filterByDomain(entries, 'light').reduce(
          (acc, e) => acc + (hass.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
          0,
        );
        return mk('Światła', 'mdi:lightbulb-on', n > 0 ? `${n} włącz.` : 'wszystkie wył.', n > 0, '#ffc107');
      }
      case 'windows_open': {
        const n = filterBinarySensorDeviceClass(hass, entries, 'window').reduce(
          (acc, e) => acc + (hass.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
          0,
        );
        return mk('Okna', 'mdi:window-open-variant', n > 0 ? `${n} otwart.` : 'zamknięte', n > 0, '#42a5f5');
      }
      case 'doors_open': {
        const n = filterBinarySensorDeviceClass(hass, entries, 'door').reduce(
          (acc, e) => acc + (hass.states?.[e.entity_id]?.state === 'on' ? 1 : 0),
          0,
        );
        return mk('Drzwi', 'mdi:door-open', n > 0 ? `${n} otwart.` : 'zamknięte', n > 0, '#42a5f5');
      }
      case 'battery_low': {
        const low = entries.some((e) => {
          const s = hass.states?.[e.entity_id];
          if (!s || s.attributes?.device_class !== 'battery') return false;
          const v = parseFloat(s.state);
          return !Number.isNaN(v) && v < 20;
        });
        if (!low) return null;
        return mk('Bateria', 'mdi:battery-alert', 'niski poziom', true, '#f44336');
      }
      case 'leak': {
        const active = filterBinarySensorDeviceClass(hass, entries, 'moisture').some(
          (e) => hass.states?.[e.entity_id]?.state === 'on',
        );
        if (!active) return null;
        return mk('Wyciek', 'mdi:water-alert', 'wykryty', true, '#f44336');
      }
      default:
        return null;
    }
  }

  private _summaryItem(
    label: string,
    icon: string,
    value: string,
    active: boolean,
    color: string,
  ): TemplateResult {
    return html`
      <div class="summary-item ${active ? 'active' : 'inactive'}">
        <ha-icon style=${active ? `color:${color};` : ''} .icon=${icon}></ha-icon>
        <div class="summary-text">
          <span class="summary-label">${label}</span>
          <span class="summary-value">${value}</span>
        </div>
      </div>
    `;
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
      padding: var(--stratum-room-padding, 16px);
      box-shadow: var(--ha-card-box-shadow, none);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, transparent));
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      /* Rezerwa na przycisk × popupu — ustawiana z zewnątrz przez wrapper. */
      padding-right: var(--stratum-room-header-pad-right, 0px);
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    }

    .icon {
      --mdc-icon-size: 28px;
      color: var(--primary-text-color);
      flex-shrink: 0;
    }

    .title {
      flex: 1;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
    }

    .section-header ha-icon {
      --mdc-icon-size: 16px;
    }

    .section-header .count {
      margin-left: auto;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      color: var(--secondary-text-color);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }

    .summary-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .summary-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
      background: var(--stratum-tile-chip-background, rgba(255, 255, 255, 0.04));
      font-size: 12px;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .summary-chip.inactive {
      opacity: 0.45;
    }

    .summary-chip.active {
      color: var(--stratum-sum-accent, var(--primary-color));
      border-color: var(--stratum-sum-accent, var(--primary-color));
      background: color-mix(in srgb, var(--stratum-sum-accent, var(--primary-color)) 18%, transparent);
    }

    .summary-chip ha-icon {
      --mdc-icon-size: 16px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      transition: opacity 0.15s ease;
    }

    .summary-item.inactive {
      opacity: 0.5;
    }

    .summary-item ha-icon {
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }

    .summary-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .summary-label {
      font-size: 11px;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .summary-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 480px) {
      ha-card {
        padding: 12px;
      }
      .header {
        gap: 8px;
      }
      .title {
        font-size: 17px;
      }
      .body {
        gap: 14px;
      }
    }

    .tiles {
      display: grid;
      gap: 8px;
    }

    .tiles.chips-layout {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tiles.icon-layout {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tiles.bubble-layout {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: 8px;
    }

    .custom-card-slot {
      display: block;
    }

    .custom-card-slot > * {
      display: block;
      width: 100%;
    }

    .tiles.grid-1 {
      grid-template-columns: 1fr;
    }

    .tiles.grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tiles.grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @media (max-width: 480px) {
      .tiles.grid-3 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .placeholder {
      padding: 20px;
      text-align: center;
      color: var(--secondary-text-color);
    }

    .auto-badge {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid transparent;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      text-transform: none;
      letter-spacing: 0;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .auto-badge ha-icon {
      --mdc-icon-size: 14px;
    }

    .auto-badge.on {
      color: var(--stratum-auto-badge-color, #ef5350);
      border-color: color-mix(in srgb, var(--stratum-auto-badge-color, #ef5350) 50%, transparent);
      background: color-mix(in srgb, var(--stratum-auto-badge-color, #ef5350) 14%, transparent);
    }

    /* Badge zajmuje auto-margines — licznik przestaje go potrzebować. */
    .section-header .auto-badge + .count {
      margin-left: 8px;
    }

    .lights-sep {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 4px 0;
      color: var(--secondary-text-color);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .lights-sep::before,
    .lights-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--divider-color, rgba(255, 255, 255, 0.12));
    }

    .lights-sep.plain {
      gap: 0;
      margin: 6px 0;
    }

    .cover-master {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .cm-btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 0;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.12s ease, transform 0.08s ease;
    }

    .cm-btn:hover {
      filter: brightness(1.2);
    }

    .cm-btn:active {
      transform: scale(0.95);
    }

    .cm-btn ha-icon {
      --mdc-icon-size: 16px;
    }

    .cm-open {
      background: rgba(102, 187, 106, 0.16);
      color: #66bb6a;
    }

    .cm-stop {
      background: rgba(255, 183, 77, 0.15);
      color: #ffb74d;
    }

    .cm-close {
      background: rgba(239, 83, 80, 0.15);
      color: #ef5350;
    }

    .cm-pct {
      background: rgba(100, 169, 232, 0.13);
      color: #64a9e8;
    }

    .rest-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      border: 1px dashed var(--divider-color, rgba(255, 255, 255, 0.14));
      border-radius: 10px;
      padding: 8px 12px;
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .rest-toggle:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .rest-toggle ha-icon {
      --mdc-icon-size: 16px;
    }

    .rest-count {
      margin-left: auto;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      font-size: 11px;
    }
  `;
}

// Rejestracja drugiego card type w katalogu HA.
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
if (!w.customCards.some((c) => c.type === 'stratum-room-card')) {
  w.customCards.push({
    type: 'stratum-room-card',
    name: 'Stratum — Pokój',
    description:
      'Widok pojedynczego pomieszczenia z auto-generowanymi sekcjami (Światła, Rolety, Okna, Klimat).',
    preview: false,
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-room-card': StratumRoomCard;
  }
}

// eslint-disable-next-line no-console
console.info(
  `%c STRATUM-ROOM %c v${VERSION} `,
  'color: #fff; background: #42a5f5; padding: 2px 6px; border-radius: 3px 0 0 3px; font-weight: 500;',
  'color: #42a5f5; background: #1e1f22; padding: 2px 6px; border-radius: 0 3px 3px 0;',
);
