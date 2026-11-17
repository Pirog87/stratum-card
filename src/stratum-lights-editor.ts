// Editor listy świateł popupu pomieszczenia.
//
// Pokazuje ZAWSZE pełną listę: jawną z configu, a gdy pusta — auto-wykrytą
// z obszaru (grupy-pomocniki jeśli są, inaczej wszystkie encje light).
// Per pozycja: ukryj (oko), zmień nazwę/ikonę, kolejność, usuń. Do tego
// „Dodaj światło" (dowolna encja, także spoza obszaru) i „Dodaj separator"
// (pozioma linia z opcjonalnym podpisem). Pierwsza zmiana utrwala listę
// w konfiguracji; „Przywróć auto-wykrywanie" wraca do auto.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  RoomLightItemConfig,
  RoomLightsConfig,
} from './types.js';
import { getEntitiesInArea, filterByDomain, filterDisplayable } from './area-entities.js';
import { editorSharedStyles } from './editor-shared-styles.js';
import { ENTITY_UI_ACTIONS } from './tap-action.js';
import { localize, lookup, messages, type MessageKey } from './localize/localize.js';

const SEPARATOR_FIELDS_SCHEMA = [{ name: 'label', selector: { text: {} } }];

// Etykiety i podpowiedzi pól ha-form: grupa `editor.entity_list` słownika.

/** Źródło auto-listy — decyduje co edytor wykrywa z obszaru. */
export type EntityListSource =
  | 'light_groups'
  | 'light_singles'
  | 'covers'
  | 'media';

const SOURCE_META: Record<
  EntityListSource,
  { domain: string; autoLabel: MessageKey; emptyHint: MessageKey; fallbackIcon: string }
> = {
  light_groups: {
    domain: 'light',
    autoLabel: 'editor.entity_list.auto_light_groups',
    emptyHint: 'editor.entity_list.empty_light_groups',
    fallbackIcon: 'mdi:lightbulb-group',
  },
  light_singles: {
    domain: 'light',
    autoLabel: 'editor.entity_list.auto_light_singles',
    emptyHint: 'editor.entity_list.empty_light_singles',
    fallbackIcon: 'mdi:lightbulb',
  },
  covers: {
    domain: 'cover',
    autoLabel: 'editor.entity_list.auto_covers',
    emptyHint: 'editor.entity_list.empty_covers',
    fallbackIcon: 'mdi:blinds',
  },
  media: {
    domain: 'media_player',
    autoLabel: 'editor.entity_list.auto_media',
    emptyHint: 'editor.entity_list.empty_media',
    fallbackIcon: 'mdi:speaker',
  },
};

@customElement('stratum-lights-editor')
export class StratumLightsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  /** Obszar do auto-wykrywania encji. */
  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  /** Dodatkowe obszary (merge_with) — ich encje też trafiają do auto-listy. */
  @property({ attribute: false }) public mergeWith: string[] = [];

  /** Co wykrywamy: grupy świateł / pojedyncze światła / rolety / media. */
  @property({ type: String }) public source: EntityListSource = 'light_groups';

  @property({ attribute: false }) public config: RoomLightsConfig = { items: [] };

  @state() private _open = new Set<number>();

  private get _meta() {
    return SOURCE_META[this.source] ?? SOURCE_META.light_groups;
  }

  /** Schema pól encji — domena zależna od źródła. */
  private _entitySchema() {
    return [
      {
        name: 'entity',
        required: true,
        selector: { entity: { filter: [{ domain: this._meta.domain }] } },
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'name', selector: { text: {} } },
          { name: 'icon', selector: { icon: {} } },
        ],
      },
      // Bez `assist` — karta go nie obsługuje; kafel ma encję, więc
      // `more-info` / `toggle` działają na niej.
      { name: 'tap_action', selector: { ui_action: { actions: ENTITY_UI_ACTIONS } } },
    ];
  }

  private _isGroupEntity(id: string): boolean {
    return Array.isArray(this.hass?.states?.[id]?.attributes?.entity_id);
  }

  /** Auto-lista wg źródła — ze wszystkich połączonych obszarów. */
  private _autoItems(): RoomLightItemConfig[] {
    if (!this.hass || !this.areaId) return [];
    const seen = new Set<string>();
    const entries = [];
    for (const id of [this.areaId, ...this.mergeWith]) {
      for (const e of getEntitiesInArea(this.hass, id)) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        entries.push(e);
      }
    }
    const all = filterDisplayable(
      this.hass,
      filterByDomain(entries, this._meta.domain),
    );
    const filtered =
      this.source === 'light_groups'
        ? all.filter((e) => this._isGroupEntity(e.entity_id))
        : this.source === 'light_singles'
        ? all.filter((e) => !this._isGroupEntity(e.entity_id))
        : all;
    return filtered.map((e) => ({ entity: e.entity_id }));
  }

  private get _isAuto(): boolean {
    return (this.config.items ?? []).length === 0;
  }

  private _workingItems(): RoomLightItemConfig[] {
    const items = this.config.items ?? [];
    return items.length > 0 ? items : this._autoItems();
  }

  private _emit(items: RoomLightItemConfig[]): void {
    this.dispatchEvent(
      new CustomEvent('lights-changed', {
        detail: { lights: { items } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _update(index: number, patch: Partial<RoomLightItemConfig>): void {
    const items = [...this._workingItems()];
    if (index < 0 || index >= items.length) return;
    const merged: RoomLightItemConfig = { ...items[index]!, ...patch };
    if (!merged.name) delete merged.name;
    if (!merged.icon) delete merged.icon;
    if (!merged.label) delete merged.label;
    if (!merged.hidden) delete merged.hidden;
    if (!merged.separator) delete merged.separator;
    if (
      !merged.tap_action ||
      (merged.tap_action as { action?: string }).action === 'default'
    ) {
      delete merged.tap_action;
    }
    items[index] = merged;
    this._emit(items);
  }

  private _add(item: RoomLightItemConfig): void {
    const items = [...this._workingItems(), item];
    this._emit(items);
    if (!item.separator) this._open = new Set([...this._open, items.length - 1]);
  }

  private _remove(index: number): void {
    this._emit(this._workingItems().filter((_, i) => i !== index));
    const next = new Set<number>();
    for (const i of this._open) {
      if (i === index) continue;
      next.add(i > index ? i - 1 : i);
    }
    this._open = next;
  }

  private _move(index: number, direction: -1 | 1): void {
    const items = [...this._workingItems()];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
    this._emit(items);
    const next = new Set<number>();
    for (const i of this._open) {
      if (i === index) next.add(target);
      else if (i === target) next.add(index);
      else next.add(i);
    }
    this._open = next;
  }

  private _resetToAuto(): void {
    this._open = new Set();
    this._emit([]);
  }

  private _toggleEdit(index: number): void {
    const next = new Set(this._open);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this._open = next;
  }

  private _title(item: RoomLightItemConfig): string {
    if (item.separator) {
      return item.label ? `— ${item.label} —` : this._t('editor.common.separator_title');
    }
    if (item.name) return item.name;
    const state = item.entity ? this.hass?.states?.[item.entity] : undefined;
    return (
      (state?.attributes?.friendly_name as string | undefined) ??
      item.entity ??
      this._t('editor.entity_list.new_light')
    );
  }

  private _iconFor(item: RoomLightItemConfig): string {
    if (item.separator) return 'mdi:minus';
    if (item.icon) return item.icon;
    const state = item.entity ? this.hass?.states?.[item.entity] : undefined;
    if (state?.attributes?.icon) return state.attributes.icon as string;
    if (this.source === 'light_groups' || this.source === 'light_singles') {
      return Array.isArray(state?.attributes?.entity_id)
        ? 'mdi:lightbulb-group'
        : 'mdi:lightbulb';
    }
    return this._meta.fallbackIcon;
  }

  private _t(key: MessageKey, vars?: Record<string, string | number>): string {
    return localize(this.hass, key, vars);
  }

  protected render(): TemplateResult {
    const items = this._workingItems();
    const m = messages(this.hass).editor.entity_list;
    const auto = this._isAuto;
    return html`
      ${auto && items.length > 0
        ? html`<p class="auto-hint">
            <ha-icon .icon=${'mdi:auto-fix'}></ha-icon>
            ${this._t('editor.entity_list.auto_hint', {
              label: this._t(this._meta.autoLabel),
              count: items.length,
            })}
          </p>`
        : nothing}
      ${auto && items.length === 0
        ? html`<p class="auto-hint">
            <ha-icon .icon=${'mdi:information-outline'}></ha-icon>
            ${this._t(this._meta.emptyHint)}
          </p>`
        : nothing}
      ${!auto && items.length > 0
        ? html`<button class="reset-auto" @click=${this._resetToAuto}>
            <ha-icon .icon=${'mdi:auto-fix'}></ha-icon>
            ${this._t('editor.entity_list.reset_auto')}
          </button>`
        : nothing}

      <div class="stratum-list">
        ${items.map((item, idx) => {
          const open = this._open.has(idx);
          const sep = Boolean(item.separator);
          return html`
            <div
              class="stratum-row active ${item.hidden ? 'item-hidden' : ''} ${sep
                ? 'row-sep'
                : ''}"
            >
              <div class="stratum-row-head">
                <span class="stratum-row-avatar">
                  <ha-icon .icon=${this._iconFor(item)}></ha-icon>
                </span>
                <span class="stratum-row-title">${this._title(item)}</span>
                ${item.hidden
                  ? html`<span class="stratum-badge ghost"
                      >${this._t('editor.common.hidden_badge')}</span
                    >`
                  : nothing}
                <div class="stratum-row-actions">
                  <button
                    class="stratum-icon-btn"
                    title=${this._t(item.hidden ? 'editor.common.show' : 'editor.common.hide')}
                    @click=${() => this._update(idx, { hidden: !item.hidden })}
                  >
                    <ha-icon
                      .icon=${item.hidden ? 'mdi:eye-off' : 'mdi:eye'}
                    ></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title=${this._t('editor.common.move_up')}
                    ?disabled=${idx === 0}
                    @click=${() => this._move(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title=${this._t('editor.common.move_down')}
                    ?disabled=${idx === items.length - 1}
                    @click=${() => this._move(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn ${open ? 'accent' : ''}"
                    title=${this._t(open ? 'editor.common.collapse' : 'editor.common.edit')}
                    @click=${() => this._toggleEdit(idx)}
                  >
                    <ha-icon .icon=${open ? 'mdi:chevron-up' : 'mdi:pencil'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn danger"
                    title=${this._t('editor.common.remove')}
                    @click=${() => this._remove(idx)}
                  >
                    <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
                  </button>
                </div>
              </div>
              ${open
                ? html`<div class="stratum-row-sub">
                    <ha-form
                      .hass=${this.hass}
                      .data=${item}
                      .schema=${sep ? SEPARATOR_FIELDS_SCHEMA : this._entitySchema()}
                      .computeLabel=${(s: { name: string }) =>
                        lookup(m.labels, s.name) ?? s.name}
                      .computeHelper=${(s: { name: string }) =>
                        lookup(m.helpers, s.name) ?? ''}
                      @value-changed=${(ev: CustomEvent<{
                        value: Partial<RoomLightItemConfig>;
                      }>) => {
                        ev.stopPropagation();
                        this._update(idx, ev.detail.value);
                      }}
                    ></ha-form>
                  </div>`
                : nothing}
            </div>
          `;
        })}
      </div>

      <div class="add-row">
        <button class="stratum-add-btn" @click=${() => this._add({ entity: '' })}>
          <ha-icon .icon=${'mdi:plus'}></ha-icon>
          ${this._t('editor.entity_list.add_entity')}
        </button>
        <button
          class="stratum-add-btn"
          @click=${() => this._add({ separator: true })}
        >
          <ha-icon .icon=${'mdi:minus'}></ha-icon>
          ${this._t('editor.entity_list.add_separator')}
        </button>
      </div>
    `;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .auto-hint {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 10px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px dashed var(--divider-color, rgba(255, 255, 255, 0.16));
        background: rgba(255, 255, 255, 0.03);
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .auto-hint ha-icon {
        --mdc-icon-size: 16px;
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--primary-color, #ff9b42);
      }

      .reset-auto {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 10px;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.16));
        background: transparent;
        font-size: 12px;
        color: var(--secondary-text-color);
        cursor: pointer;
      }

      .reset-auto:hover {
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
      }

      .reset-auto ha-icon {
        --mdc-icon-size: 14px;
      }

      .item-hidden .stratum-row-title,
      .item-hidden .stratum-row-avatar {
        opacity: 0.4;
      }

      .row-sep .stratum-row-title {
        color: var(--secondary-text-color);
        font-style: italic;
      }

      .add-row {
        display: flex;
        gap: 8px;
      }

      .add-row .stratum-add-btn {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-lights-editor': StratumLightsEditor;
  }
}
