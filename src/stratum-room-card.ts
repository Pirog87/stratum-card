// stratum-room-card — widok detalu pomieszczenia z auto-generowanymi sekcjami.
//
// v1.0 1/3 — szkielet: rejestracja card type, setConfig, header z ikoną/nazwą/chipami.
// Placeholder sekcji zostanie zastąpiony listą aktywnych sekcji w 2/3.

import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ChipConfig,
  HassEntityRegistryEntry,
  HomeAssistant,
  RoomPopupOrderItem,
  MediaShortcutConfig,
  RoomSectionConfig,
  RoomSectionType,
  StratumRoomCardConfig,
  SummaryField,
} from './types.js';
import { DEFAULT_POPUP_ORDER } from './types.js';
import { getEntitiesInArea, filterByDomain, filterBinarySensorDeviceClass } from './area-entities.js';
import { evaluateChip, resolveChipColor, resolveChipIcon } from './chip-defaults.js';
import {
  ALARM_CLASS_ICONS,
  ALARM_CLASS_LABELS,
  CHIP_LIST_COLORS,
  CHIP_LIST_LABELS,
  alarmEntityIds,
  chipEntityIds,
  chipSupportsList,
} from './chip-list-helpers.js';
import { ago } from './chip-defaults.js';
import { TemplateRenderer } from './template-renderer.js';
import { runTapAction } from './tap-action.js';
import {
  autoRoomChips,
  autoSections,
  entitiesForSection,
  normalizeSections,
} from './room-sections.js';
import { roomCardStyles } from './stratum-room-card-styles.js';
import { SECTION_ICON, SECTION_LABEL, SECTION_LAYOUT } from './section-defaults.js';
import './stratum-card-chip.js';
import './stratum-chip-list.js';
import './stratum-room-card-editor.js';
import './stratum-room-tile.js';
import './stratum-scene-bar.js';

const VERSION = '1.24.0';

interface SummaryDatum {
  label: string;
  icon: string;
  value: string;
  active: boolean;
  color: string;
}


@customElement('stratum-room-card')
export class StratumRoomCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StratumRoomCardConfig;

  /** Rozwinięte listy „Pozostałe" w sekcjach grupowanych (klucz = sekcja). */
  @state() private _openRest = new Set<string>();

  /** Sekcja media (tabs): wybrany odtwarzacz per sekcja — trzymany per sesja. */
  @state() private _mediaTab = new Map<string, string>();

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

  /** Popup listy encji po kliknięciu chipa nagłówka popupu. */
  @state() private _popupChip?: {
    chip: ChipConfig;
    label: string;
    icon: string;
    color: string;
  };

  private _onChipTap(chip: ChipConfig): void {
    if (!chipSupportsList(chip)) return;
    this._popupChip = {
      chip,
      label: CHIP_LIST_LABELS[chip.type] ?? 'Lista',
      icon: resolveChipIcon(chip) ?? 'mdi:label-outline',
      color:
        resolveChipColor(chip) ??
        CHIP_LIST_COLORS[chip.type] ??
        'var(--primary-color)',
    };
  }

  private _renderChipListPopup(entries: HassEntityRegistryEntry[]): TemplateResult {
    if (!this._popupChip || !this.hass) return html``;
    // Re-resolve na każdy render — lista aktualizuje się live.
    const freshIds = chipEntityIds(this.hass, entries, this._popupChip.chip);
    return html`<stratum-chip-list
      .hass=${this.hass}
      .chip=${this._popupChip.chip}
      .entityIds=${freshIds}
      .label=${this._popupChip.label}
      .icon=${this._popupChip.icon}
      .color=${this._popupChip.color}
      @close=${() => {
        this._popupChip = undefined;
      }}
    ></stratum-chip-list>`;
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
      const clickable = chipSupportsList(chip);
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
        ${this._renderHeader(entries, name, icon)}
        <div class="body" part="body">
          ${this._renderAlarmsBlock(entries)}
          ${sections.length === 0 && !hasExplicitScenes
            ? html`<div class="placeholder">
                Brak encji do wyświetlenia — sprawdź przypisanie area.
              </div>`
            : this._renderOrderedBlocks(entries, sections, Boolean(hasExplicitScenes))}
        </div>
      </ha-card>
      ${this._renderChipListPopup(entries)}
    `;
  }

  /**
   * Belka nagłówka popupu wg `popup_header` (globalny config z karty):
   * style classic/avatar/gradient/compact + typografia, ikona, chipy,
   * podtytuł, separator i akcent — analogicznie do belki karty głównej.
   */
  private _renderHeader(
    entries: HassEntityRegistryEntry[],
    name: string,
    icon: string,
  ): TemplateResult {
    const ph = this._config?.popup_header ?? {};
    const style = ph.style ?? 'classic';
    const compact = style === 'compact';
    const boxedIcon = style === 'avatar' || style === 'gradient';
    const accent = ph.accent_color ?? 'var(--primary-color, #ff9b42)';

    const titleSize =
      ph.title_size === 'sm' ? 15 : ph.title_size === 'lg' ? 23 : compact ? 16 : 20;
    const titleStyle = [
      `font-size:${titleSize}px;`,
      `font-weight:${ph.title_weight ?? 600};`,
      ph.title_color ? `color:${ph.title_color};` : '',
    ].join('');

    const iconSize = ph.icon_size ?? (compact ? 18 : boxedIcon ? 20 : 28);
    const iconStyle = [
      `--mdc-icon-size:${iconSize}px;`,
      ph.icon_color ? `color:${ph.icon_color};` : '',
    ].join('');
    const iconWrapStyle = `background:${
      ph.icon_bg_color ?? `color-mix(in srgb, ${accent} 16%, transparent)`
    };width:${iconSize + 20}px;height:${iconSize + 20}px;`;

    const headerStyle = [
      typeof ph.padding === 'number'
        ? `padding-bottom:${ph.padding}px;`
        : compact
        ? 'padding-bottom:8px;margin-bottom:10px;'
        : '',
      ph.divider === false ? 'border-bottom:0;' : '',
      style === 'gradient'
        ? `background:linear-gradient(135deg, color-mix(in srgb, ${accent} 14%, transparent), transparent 60%);border-radius:14px 14px 0 0;padding-top:10px;padding-left:12px;`
        : '',
      ph.accent_bar
        ? `border-left:3px solid ${accent};padding-left:${style === 'gradient' ? 12 : 10}px;`
        : '',
    ].join('');

    const subtitleMode = ph.subtitle ?? (style === 'avatar' ? 'areas' : 'none');
    let subtitleText = '';
    if (subtitleMode === 'areas') {
      const m = this._config?.merge_with ?? [];
      if (m.length > 0) {
        subtitleText =
          '+ ' + m.map((id) => this.hass!.areas?.[id]?.name ?? id).join(', ');
      }
    } else if (subtitleMode === 'entities') {
      subtitleText = `${entries.length} encji`;
    }

    const iconEl = ph.hide_icon
      ? nothing
      : boxedIcon
      ? html`<span
          class="hicon ${style === 'gradient' ? 'sq' : ''}"
          style=${iconWrapStyle}
          ><ha-icon part="room-icon" style=${iconStyle} .icon=${icon}></ha-icon
        ></span>`
      : html`<ha-icon
          class="icon"
          part="room-icon"
          style=${iconStyle}
          .icon=${icon}
        ></ha-icon>`;

    const titleEl = html`<span class="title" part="title" style=${titleStyle}
      >${name}${subtitleText
        ? html`<small class="subtitle">${subtitleText}</small>`
        : nothing}</span
    >`;

    const chipsPos = ph.chips_position ?? 'inline';
    const chipsEl =
      chipsPos === 'hidden'
        ? nothing
        : html`<div class="chips ${chipsPos === 'below' ? 'below' : ''}" part="chips">
            ${this._renderChips(entries)}
          </div>`;

    if (chipsPos === 'below') {
      return html`<div
        class="header has-below ${compact ? 'compact' : ''}"
        part="header"
        style=${headerStyle}
      >
        <div class="hrow">${iconEl}${titleEl}</div>
        ${chipsEl}
      </div>`;
    }
    return html`<div
      class="header ${compact ? 'compact' : ''}"
      part="header"
      style=${headerStyle}
    >
      ${iconEl}${titleEl}${chipsEl}
    </div>`;
  }

  /**
   * A3: czerwony blok „Aktywne alarmy" na SAMEJ GÓRZE popupu — lista
   * sprawców czerwonej otoczki (smoke/gas/CO/moisture/problem/safety/
   * tamper w stanie on). Klik w wiersz = more-info z historią.
   */
  private _renderAlarmsBlock(
    entries: HassEntityRegistryEntry[],
  ): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const ids = alarmEntityIds(this.hass, entries);
    if (ids.length === 0) return nothing;
    return html`
      <div class="alarms-block" part="alarms">
        <div class="alarms-head">
          <ha-icon .icon=${'mdi:alert'}></ha-icon>
          <span>Aktywne alarmy</span>
          <span class="alarms-count">${ids.length}</span>
        </div>
        ${ids.map((id) => {
          const st = this.hass!.states?.[id];
          const cls = st?.attributes?.device_class as string | undefined;
          const name =
            (st?.attributes?.friendly_name as string | undefined) ?? id;
          const entry = this.hass!.entities?.[id];
          const areaId =
            entry?.area_id ??
            (entry?.device_id
              ? this.hass!.devices?.[entry.device_id]?.area_id
              : undefined);
          const areaName = areaId
            ? this.hass!.areas?.[areaId]?.name ?? areaId
            : '';
          return html`<button
            class="alarm-row"
            title="Więcej info"
            @click=${() =>
              this.dispatchEvent(
                new CustomEvent('hass-more-info', {
                  detail: { entityId: id },
                  bubbles: true,
                  composed: true,
                }),
              )}
          >
            <span class="ab-bub">
              <ha-icon
                .icon=${(cls && ALARM_CLASS_ICONS[cls]) ?? 'mdi:alert-circle-outline'}
              ></ha-icon>
            </span>
            <span class="ab-mid">
              <b>${name}</b>
              ${areaName ? html`<span>${areaName}</span>` : nothing}
            </span>
            ${cls
              ? html`<span class="ab-cls">${ALARM_CLASS_LABELS[cls] ?? cls}</span>`
              : nothing}
            ${st?.last_changed
              ? html`<span class="ab-tm">${ago(st.last_changed)}</span>`
              : nothing}
          </button>`;
        })}
      </div>
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
            // Globalny default rozmiaru; `scenes.size` per pokój wygrywa.
            out.push(
              html`<stratum-scene-bar
                .hass=${this.hass}
                .config=${{
                  size: this._config!.scene_size_default,
                  columns: this._config!.scene_columns_default,
                  gradient: this._config!.scene_gradient_default,
                  ...this._config!.scenes,
                }}
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

  /**
   * Styl siatki bloków świateł: columns z configu wygrywa; custom mode =
   * 1 kolumna; default = auto-fill wg minimalnej szerokości kafla
   * (tile_min_width, 240 px) — liczba kolumn dopasowuje się do ekranu.
   * Dokłada też wysokość kafla (tile_height → --stratum-glight-min-height).
   */
  private _lightsGridStyle(section: RoomSectionConfig, mode: string): string {
    const h =
      typeof section.tile_height === 'number'
        ? `--stratum-glight-min-height:${section.tile_height}px;`
        : '';
    if (typeof section.columns === 'number') {
      return `grid-template-columns:repeat(${section.columns},minmax(0,1fr));${h}`;
    }
    if (mode.startsWith('custom:')) {
      return `grid-template-columns:1fr;${h}`;
    }
    const w = typeof section.tile_min_width === 'number' ? section.tile_min_width : 240;
    return `grid-template-columns:repeat(auto-fill,minmax(min(${w}px,100%),1fr));${h}`;
  }

  /** Badge „Auto" w nagłówku świateł — toggle pomocnika automatyzacji. */
  /**
   * Switch automatyzacji świateł (pomocnik `light_auto_entity`, np.
   * input_boolean sterujący automatyzacjami Node-RED): czerwony gdy
   * automatyka aktywna, ikona mdi:brightness-auto w gałce.
   */
  private _renderAutoSwitch(entityId?: string): TemplateResult | typeof nothing {
    const id = entityId ?? this._config?.light_auto_entity;
    const st = id ? this.hass?.states?.[id] : undefined;
    if (!id || !st) return nothing;
    const on = st.state === 'on';
    return html`
      <button
        class="hdr-switch auto ${on ? 'on' : ''}"
        role="switch"
        aria-checked=${on}
        title=${on
          ? 'Automatyka świateł włączona — kliknij aby przejść na sterowanie ręczne'
          : 'Automatyka świateł wyłączona (sterowanie ręczne) — kliknij aby włączyć'}
        @click=${(ev: Event) => {
          ev.stopPropagation();
          void this.hass?.callService('homeassistant', 'toggle', { entity_id: id });
        }}
      >
        <span class="knob"><ha-icon .icon=${'mdi:brightness-auto'}></ha-icon></span>
      </button>
    `;
  }

  /**
   * Master ⏻ wszystkich świateł pomieszczenia — wkomponowany w nagłówek
   * bloku świateł. Smart-toggle: cokolwiek świeci → zgaś wszystko;
   * nic nie świeci → włącz wszystko. Działa na encjach bezpośrednich
   * (bez pomocników-grup — unikamy podwójnych wywołań).
   */
  private _lightPowerIds(areaId?: string): string[] {
    const entries = areaId
      ? getEntitiesInArea(this.hass!, areaId)
      : this._getEntries();
    return entitiesForSection(this.hass!, entries, 'lights')
      .filter((e) => !this._isLightGroup(e.entity_id))
      .map((e) => e.entity_id);
  }

  private _renderLightsPower(areaId?: string): TemplateResult | typeof nothing {
    const ids = this._lightPowerIds(areaId);
    if (ids.length === 0) return nothing;
    const anyOn = ids.some((id) => this.hass?.states?.[id]?.state === 'on');
    // Wariant E2 z makiety: duży switch z żarówką w gałce.
    return html`
      <button
        class="hdr-switch lights ${anyOn ? 'on' : ''}"
        role="switch"
        aria-checked=${anyOn}
        title=${anyOn
          ? 'Wyłącz wszystkie światła w pomieszczeniu'
          : 'Włącz wszystkie światła w pomieszczeniu'}
        @click=${(ev: Event) => {
          ev.stopPropagation();
          void this.hass?.callService(
            'light',
            anyOn ? 'turn_off' : 'turn_on',
            { entity_id: ids },
          );
        }}
      >
        <span class="knob"><ha-icon .icon=${'mdi:lightbulb'}></ha-icon></span>
      </button>
    `;
  }

  /**
   * Para przełączników nagłówka: automatyka (opcjonalna) + master świateł.
   * Z `areaId` — scope do jednej strefy (podział przy merge_with);
   * pomocnik auto ze słownika `light_auto_entities[areaId]`, dla strefy
   * głównej fallback do `light_auto_entity`.
   */
  private _renderHeaderSwitches(areaId?: string): TemplateResult {
    const autoId = areaId
      ? this._config?.light_auto_entities?.[areaId] ??
        (areaId === this._config?.area_id
          ? this._config?.light_auto_entity
          : undefined)
      : this._config?.light_auto_entity;
    return html`<span class="hdr-switches">
      ${this._renderAutoSwitch(autoId)}${this._renderLightsPower(areaId)}
    </span>`;
  }

  /**
   * Podział bloku świateł na strefy (light_split_areas + merge_with):
   * osobny nagłówek per area (nazwa strefy) z własną parą przełączników
   * i grupami świateł tej strefy. Strefa bez świateł jest pomijana.
   */
  /** Area encji (z registry albo przez device) — do podziału na strefy. */
  private _entityAreaOf(entityId: string): string | undefined {
    const entry = this.hass?.entities?.[entityId];
    if (entry?.area_id) return entry.area_id;
    if (entry?.device_id) {
      return this.hass?.devices?.[entry.device_id]?.area_id ?? undefined;
    }
    return undefined;
  }

  private _renderLightsSplit(section: RoomSectionConfig): TemplateResult {
    const primary = this._config!.area_id;
    const areaIds = [primary, ...(this._config!.merge_with ?? [])];
    const areaSet = new Set(areaIds);
    const mode = section.mode ?? 'rail';
    const gridStyle = this._lightsGridStyle(section, mode);
    // Jawna lista z edytora (zmaterializowana) — zachowujemy overridy
    // (nazwy, ikony, ukrycia); pozycję przypisujemy do strefy jej encji,
    // encje spoza stref (i grupy między-strefowe bez area) → strefa główna.
    const explicit = this._visibleListItems(this._config?.lights).filter(
      (i) => !i.separator && i.entity,
    );
    const blocks: TemplateResult[] = [];
    for (const areaId of areaIds) {
      const entriesA = entitiesForSection(
        this.hass!,
        getEntitiesInArea(this.hass!, areaId),
        'lights',
      );
      const name = this.hass!.areas?.[areaId]?.name ?? areaId;
      let count: number;
      let tiles: TemplateResult | typeof nothing = nothing;
      if (explicit.length > 0) {
        const itemsA = explicit.filter((i) => {
          const a = this._entityAreaOf(i.entity!);
          return a === areaId || (areaId === primary && (!a || !areaSet.has(a)));
        });
        count = itemsA.length;
        if (count > 0) {
          tiles = html`${this._renderListBlocks(
            itemsA,
            mode,
            gridStyle,
            section.card_template,
          )}`;
        }
        if (count === 0 && entriesA.length === 0) continue;
      } else {
        const groups = entriesA.filter((e) => this._isLightGroup(e.entity_id));
        count = groups.length;
        if (entriesA.length === 0) continue;
        if (count > 0) {
          tiles = html`<div class="tiles" style=${gridStyle}>
            ${groups.map(
              (e) => html`<stratum-room-tile
                .hass=${this.hass}
                .entity=${e.entity_id}
                .mode=${mode}
                .cardTemplate=${section.card_template}
              ></stratum-room-tile>`,
            )}
          </div>`;
        }
      }
      blocks.push(html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${section.icon ?? 'mdi:lightbulb-group'}></ha-icon>
            <span>${name}</span>
            ${count > 0
              ? html`<span class="count inline">${count}</span>`
              : nothing}
            ${this._renderHeaderSwitches(areaId)}
          </div>
          ${tiles}
        </div>
      `);
    }
    return html`${blocks}`;
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
    // Podział na strefy — osobne nagłówki per area z przełącznikami.
    // PRZED ścieżką jawnej listy: edytor materializuje listę przy każdej
    // zmianie, więc split musi umieć działać także z explicit items.
    if (
      this._config?.light_split_areas &&
      (this._config?.merge_with?.length ?? 0) > 0
    ) {
      return this._renderLightsSplit(section);
    }
    if ((this._config?.lights?.items?.length ?? 0) > 0) {
      return this._renderLightsExplicit(section, title, iconName);
    }
    const groups = this._lightItems(section, entries).filter((e) =>
      this._isLightGroup(e.entity_id),
    );
    if (groups.length === 0) return html``;
    const mode = section.mode ?? 'rail';
    const gridStyle = this._lightsGridStyle(section, mode);
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          <span class="count inline">${groups.length}</span>
          ${this._renderHeaderSwitches()}
        </div>
        <div class="tiles" style=${gridStyle}>
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
      // Power tylko gdy blok grup się nie renderuje — bez dublowania ⏻.
      const groupsShown =
        (this._config?.lights?.items?.length ?? 0) > 0 ||
        this._lightItems(section, entries).some((e) =>
          this._isLightGroup(e.entity_id),
        );
      const mode = section.mode ?? 'rail';
      const gridStyle = this._lightsGridStyle(section, mode);
      return html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${'mdi:lightbulb-outline'}></ha-icon>
            <span>Encje światła</span>
            ${groupsShown
              ? html`<span class="count">${count}</span>`
              : html`<span class="count inline">${count}</span>
                  ${this._renderHeaderSwitches()}`}
          </div>
          ${this._renderListBlocks(all, mode, gridStyle)}
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
    const gridStyle = this._lightsGridStyle(section, mode);
    const tiles = html`<div class="tiles" style=${gridStyle}>
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
            <span class="count inline">${singles.length}</span>
            ${this._renderHeaderSwitches()}
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
      columns:
        typeof section.columns === 'number'
          ? section.columns
          : this._config?.scene_columns_default ?? 3,
      size: this._config?.scene_size_default,
      gradient: this._config?.scene_gradient_default,
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
   * %) — działa na WSZYSTKIE covery sekcji naraz. Domyślnie UKRYTY
   * (decyzja usera — per-roleta ↑■↓ wystarcza); `master: true` włącza.
   */
  private _renderCoversMaster(
    section: RoomSectionConfig,
    items: HassEntityRegistryEntry[],
  ): TemplateResult | typeof nothing {
    if (section.master !== true || items.length === 0) return nothing;
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
    gridStyle: string,
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
      blocks.push(html`<div class="tiles" style=${gridStyle}>${tiles}</div>`);
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
    const gridStyle = this._lightsGridStyle(section, mode);
    const count = all.filter((i) => !i.separator && i.entity).length;
    if (count === 0) return html``;
    return html`
      <div class="section" part="section">
        <div class="section-header" part="section-header">
          <ha-icon .icon=${iconName}></ha-icon>
          <span>${title}</span>
          <span class="count inline">${count}</span>
          ${this._renderHeaderSwitches()}
        </div>
        ${this._renderListBlocks(all, mode, gridStyle, section.card_template)}
      </div>
    `;
  }

  /** Jawna lista rolet: pasek master + kafle wg configu. */
  private _renderCoversExplicit(section: RoomSectionConfig): TemplateResult {
    const all = this._visibleListItems(this._config?.covers_list);
    const entityItems = all.filter((i) => !i.separator && i.entity);
    if (entityItems.length === 0) return html``;
    const mode = section.mode ?? 'tile';
    const gridStyle =
      typeof section.columns === 'number'
        ? `grid-template-columns:repeat(${section.columns},minmax(0,1fr));`
        : 'grid-template-columns:1fr;';
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
        ${this._renderListBlocks(all, mode, gridStyle, section.card_template)}
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
          ${this._renderListBlocks(all, mMode, 'grid-template-columns:1fr;', section.card_template)}
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
          .volumeStep=${section.volume_step}
          .intercom=${section.intercom}
          .nameOverride=${featured.name}
          .tapAction=${featured.tap_action}
        ></stratum-room-tile>
        ${this._renderMediaShortcuts(section, featured.entity!)}
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
                ? html`${this._renderListBlocks(rest, 'tile', 'grid-template-columns:1fr;')}`
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
  /** Skróty/ulubione sekcji media — chipy pod playerem. */
  private _renderMediaShortcuts(
    section: RoomSectionConfig,
    targetId: string,
  ): TemplateResult | typeof nothing {
    const shortcuts = section.shortcuts ?? [];
    if (shortcuts.length === 0) return nothing;
    return html`<div class="media-shortcuts">
      ${shortcuts.map(
        (sc) => html`<button
          class="media-sc"
          title=${sc.media_id ?? sc.name}
          @click=${() => this._onMediaShortcut(sc, targetId)}
        >
          <ha-icon .icon=${sc.icon ?? 'mdi:playlist-play'}></ha-icon>
          <span>${sc.name}</span>
        </button>`,
      )}
    </div>`;
  }

  private _onMediaShortcut(sc: MediaShortcutConfig, targetId: string): void {
    if (sc.tap_action) {
      void runTapAction(this.hass, sc.tap_action, { source: this });
      return;
    }
    if (!sc.media_id) return;
    void this.hass?.callService('media_player', 'play_media', {
      entity_id: targetId,
      media_content_id: sc.media_id,
      media_content_type: sc.media_type ?? 'music',
    });
  }

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

    // hide_when_off: wszystkie odtwarzacze wyłączone → sekcja znika.
    if (section.hide_when_off) {
      const anyActive = items.some((e) => {
        const s = hass.states?.[e.entity_id]?.state;
        return (
          Boolean(s) &&
          !['off', 'standby', 'unavailable', 'unknown'].includes(s!)
        );
      });
      if (!anyActive) return html``;
    }

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

    // Default: zakładki głośników (wariant A z makiety) — chip per
    // odtwarzacz z kropką stanu, klik przełącza player. Kolejność zakładek
    // stabilna (kolejność encji), wybór trzymany per sesja popupu.
    if ((section.media_style ?? 'tabs') === 'tabs') {
      const key = `media:${title}`;
      const chosen = this._mediaTab.get(key);
      const selected =
        chosen && items.some((e) => e.entity_id === chosen)
          ? chosen
          : featured.entity_id;
      const dotClass = (id: string): string => {
        const s = hass.states?.[id]?.state;
        if (s === 'playing') return 'play';
        if (s === 'paused' || s === 'buffering') return 'pause';
        return 'idle';
      };
      return html`
        <div class="section" part="section">
          <div class="section-header" part="section-header">
            <ha-icon .icon=${iconName}></ha-icon>
            <span>${title}</span>
            ${items.length > 1
              ? html`<span class="count">${items.length}</span>`
              : nothing}
          </div>
          ${items.length > 1
            ? html`<div class="media-tabs">
                ${items.map((e) => {
                  const st = hass.states?.[e.entity_id];
                  const name =
                    (st?.attributes?.friendly_name as string | undefined) ??
                    e.entity_id;
                  return html`<button
                    class="media-tab ${e.entity_id === selected ? 'on' : ''}"
                    @click=${() => {
                      const m = new Map(this._mediaTab);
                      m.set(key, e.entity_id);
                      this._mediaTab = m;
                    }}
                  >
                    <span class="mt-dot ${dotClass(e.entity_id)}"></span>
                    <span class="mt-name">${name}</span>
                  </button>`;
                })}
              </div>`
            : nothing}
          <stratum-room-tile
            .hass=${this.hass}
            .entity=${selected}
            .mode=${'player'}
          .volumeStep=${section.volume_step}
          .intercom=${section.intercom}
          ></stratum-room-tile>
          ${this._renderMediaShortcuts(section, selected)}
        </div>
      `;
    }

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
          .volumeStep=${section.volume_step}
          .intercom=${section.intercom}
        ></stratum-room-tile>
        ${this._renderMediaShortcuts(section, featured.entity_id)}
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

  static styles = roomCardStyles;
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
