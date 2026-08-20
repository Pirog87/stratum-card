// Editor paska scen.
//
// Pola globalne: position / size / columns / aspect.
// Lista scen jako zwijane wiersze (jak rooms-editor): czek + chevron góra/dół
// + ołówek edycji, pod expanderem pola per-scena (entity/name/icon/image/color).

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  SceneBarConfig,
  SceneConfig,
  TapActionConfig,
} from './types.js';
import {
  SCENE_PRESETS,
  presetIdFromValue,
  resolveSceneImage,
} from './scene-presets.js';
import { getEntitiesInArea, getAreasInFloor, filterByDomain, filterDisplayable } from './area-entities.js';
import { editorSharedStyles } from './editor-shared-styles.js';

const GLOBAL_SCHEMA = [
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'position',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'top', label: 'Na górze' },
              { value: 'bottom', label: 'Na dole' },
            ],
          },
        },
      },
      {
        name: 'size',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'sm', label: 'Mały' },
              { value: 'md', label: 'Średni' },
              { value: 'lg', label: 'Duży' },
            ],
          },
        },
      },
    ],
  },
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'columns',
        selector: { number: { min: 1, max: 6, step: 1, mode: 'box' } },
      },
      { name: 'aspect', selector: { text: {} } },
    ],
  },
  {
    name: 'gradient',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'mesh', label: 'Mgławica (jak Hue)' },
          { value: 'linear', label: 'Ukos' },
          { value: 'glow', label: 'Poświata' },
          { value: 'horizon', label: 'Horyzont' },
        ],
      },
    },
  },
];

const GLOBAL_LABELS: Record<string, string> = {
  position: 'Pozycja paska',
  size: 'Rozmiar tile',
  columns: 'Kolumny',
  aspect: 'Proporcje tile (CSS)',
  gradient: 'Gradient scen bez grafiki',
};

const GLOBAL_HELPERS: Record<string, string> = {
  aspect: 'Przykłady: 1/1 (kwadrat, default), 16/9, 270/150.',
  gradient: 'Puste = ustawienie globalne karty (default: Mgławica).',
};

const SCENE_FIELDS_SCHEMA = [
  { name: 'entity', required: true, selector: { entity: { domain: ['scene', 'script'] } } },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  { name: 'color', selector: { text: {} } },
  { name: 'tap_action', selector: { ui_action: {} } },
];

const SCENE_LABELS: Record<string, string> = {
  entity: 'Encja sceny (scene.* lub script.*)',
  name: 'Nazwa (override)',
  icon: 'Ikona (gdy brak obrazu)',
  color: 'Kolor tła (gdy brak obrazu)',
  tap_action: 'Akcja po kliknięciu (override)',
  label: 'Podpis separatora (opcjonalny)',
};

const SEPARATOR_FIELDS_SCHEMA = [{ name: 'label', selector: { text: {} } }];

const SCENE_HELPERS: Record<string, string> = {
  color: 'np. amber, #ff9b42. Domyślnie primary-color.',
  tap_action:
    'Domyślnie wywołuje scene.turn_on (lub script.turn_on). Nadpisuj tylko gdy potrzebujesz innego.',
  label: 'Puste = sama linia. Z podpisem = linia z tekstem po środku.',
};

@customElement('stratum-scene-editor')
export class StratumSceneEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public config: SceneBarConfig = { items: [] };

  /**
   * Obszar do auto-wykrywania scen. Gdy `config.items` puste, edytor pokazuje
   * sceny obszaru jako edytowalną listę — pierwsza zmiana (nazwa, grafika,
   * ukrycie, kolejność) utrwala całą listę w konfiguracji.
   */
  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  /** Dodatkowe obszary (merge_with) — ich sceny też trafiają do auto-listy. */
  @property({ attribute: false }) public mergeWith: string[] = [];

  /**
   * Piętro do auto-wykrywania (pasek scen karty głównej) — sceny ze
   * WSZYSTKICH obszarów piętra. Wygrywa nad areaId.
   */
  @property({ type: String, attribute: 'floor-id' }) public floorId = '';

  /** Obszary, z których zbieramy auto-sceny. */
  private _areaIds(): string[] {
    if (this.floorId && this.hass) {
      return getAreasInFloor(this.hass, this.floorId).map((a) => a.area_id);
    }
    return this.areaId ? [this.areaId, ...this.mergeWith] : [];
  }

  @state() private _openScenes = new Set<number>();

  /** Sceny wszystkich połączonych obszarów (lub całego piętra) jako auto-itemy. */
  private _autoItems(): SceneConfig[] {
    if (!this.hass) return [];
    const areaIds = this._areaIds();
    if (areaIds.length === 0) return [];
    const seen = new Set<string>();
    const out: SceneConfig[] = [];
    for (const id of areaIds) {
      const scenes = filterDisplayable(
        this.hass,
        filterByDomain(getEntitiesInArea(this.hass, id), 'scene'),
      );
      for (const e of scenes) {
        if (seen.has(e.entity_id)) continue;
        seen.add(e.entity_id);
        out.push({ entity: e.entity_id });
      }
    }
    return out;
  }

  /** Czy pracujemy na liście auto (nic nie zapisano w configu). */
  private get _isAuto(): boolean {
    return (this.config.items ?? []).length === 0;
  }

  /** Lista robocza: explicit z configu albo zmaterializowane auto. */
  private _workingItems(): SceneConfig[] {
    const items = this.config.items ?? [];
    return items.length > 0 ? items : this._autoItems();
  }

  private _computeGlobalLabel = (schema: { name: string }): string =>
    GLOBAL_LABELS[schema.name] ?? schema.name;

  private _computeGlobalHelper = (schema: { name: string }): string =>
    GLOBAL_HELPERS[schema.name] ?? '';

  private _computeSceneLabel = (schema: { name: string }): string =>
    SCENE_LABELS[schema.name] ?? schema.name;

  private _computeSceneHelper = (schema: { name: string }): string =>
    SCENE_HELPERS[schema.name] ?? '';

  private _emit(next: SceneBarConfig): void {
    this.dispatchEvent(
      new CustomEvent('scenes-changed', {
        detail: { scenes: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onGlobalChange(ev: CustomEvent<{ value: Partial<SceneBarConfig> }>): void {
    ev.stopPropagation();
    // Przy liście auto (items puste) zmiana pozycji/rozmiaru/kolumn musi
    // zmaterializować listę — inaczej cleanup wyżej skasuje cały config
    // scen (brak items) i wybór „zniknie" po chwili.
    const baseItems =
      (this.config.items ?? []).length > 0
        ? this.config.items!
        : this._workingItems();
    const next: SceneBarConfig = {
      ...this.config,
      ...ev.detail.value,
      items: baseItems,
    };
    if (!next.position) delete next.position;
    if (!next.size) delete next.size;
    if (!next.columns) delete next.columns;
    if (!next.aspect) delete next.aspect;
    this._emit(next);
  }

  private _updateScene(index: number, patch: Partial<SceneConfig>): void {
    const items = [...this._workingItems()];
    if (index < 0 || index >= items.length) return;
    const prev = items[index]!;
    const merged: SceneConfig = { ...prev, ...patch };
    if (!merged.name) delete merged.name;
    if (!merged.icon) delete merged.icon;
    if (!merged.image) delete merged.image;
    if (!merged.color) delete merged.color;
    if (!merged.hidden) delete merged.hidden;
    if (!merged.label) delete merged.label;
    if (!merged.separator) delete merged.separator;
    if (!merged.tap_action || (merged.tap_action as TapActionConfig).action === 'none') {
      delete merged.tap_action;
    }
    items[index] = merged;
    this._emit({ ...this.config, items });
  }

  private _onSceneFieldChange(
    index: number,
    ev: CustomEvent<{ value: Partial<SceneConfig> }>,
  ): void {
    ev.stopPropagation();
    this._updateScene(index, ev.detail.value);
  }

  private _addScene(): void {
    const items = [...this._workingItems(), { entity: '' } as SceneConfig];
    this._emit({ ...this.config, items });
    this._openScenes = new Set([...this._openScenes, items.length - 1]);
  }

  private _addSeparator(): void {
    const items = [...this._workingItems(), { separator: true } as SceneConfig];
    this._emit({ ...this.config, items });
  }

  private _removeScene(index: number): void {
    const items = this._workingItems().filter((_, i) => i !== index);
    this._emit({ ...this.config, items });
    const nextOpen = new Set<number>();
    for (const i of this._openScenes) {
      if (i === index) continue;
      nextOpen.add(i > index ? i - 1 : i);
    }
    this._openScenes = nextOpen;
  }

  /** Powrót do auto-wykrywania — kasuje zapisaną listę scen. */
  private _resetToAuto(): void {
    this._openScenes = new Set();
    this._emit({ ...this.config, items: [] });
  }

  private _moveScene(index: number, direction: -1 | 1): void {
    const items = [...this._workingItems()];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
    this._emit({ ...this.config, items });
    // Przesuń też state _openScenes
    const nextOpen = new Set<number>();
    for (const i of this._openScenes) {
      if (i === index) nextOpen.add(target);
      else if (i === target) nextOpen.add(index);
      else nextOpen.add(i);
    }
    this._openScenes = nextOpen;
  }

  private _toggleEdit(index: number): void {
    const next = new Set(this._openScenes);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this._openScenes = next;
  }

  private _sceneTitle(scene: SceneConfig): string {
    if (scene.separator) {
      return scene.label ? `— ${scene.label} —` : '— separator —';
    }
    if (scene.name) return scene.name;
    const state = scene.entity ? this.hass?.states?.[scene.entity] : undefined;
    return (
      (state?.attributes?.friendly_name as string | undefined) ??
      scene.entity ??
      '(nowa scena)'
    );
  }

  private _selectPreset(index: number, id: string | null): void {
    this._updateScene(index, { image: id ? `stratum:${id}` : undefined });
  }

  /**
   * Pole grafiki sceny: podgląd + ścieżka `/local/...` (katalog www w HA)
   * lub pełny URL. Prosty input tekstowy zamiast selektora z uploadem —
   * user trzyma grafiki w config/www.
   */
  // ===== Galeria HA (image_upload) =====
  //
  // HA nie udostępnia listingu katalogu www/ — zamiast tego używamy
  // natywnego magazynu obrazów HA (tego samego co zdjęcia osób/obszarów):
  // WS `image/list` + POST `/api/image/upload`. Obrazy serwowane są pod
  // stabilnym `/api/image/serve/<id>/original` (bez auth — losowe id).

  @state() private _gallery?: Array<{ id: string; name: string }>;

  @state() private _galleryError?: string;

  @state() private _galleryBusy = false;

  private async _loadGallery(force = false): Promise<void> {
    if (this._gallery && !force) return;
    if (!this.hass?.callWS) {
      this._galleryError = 'Brak API WebSocket.';
      return;
    }
    try {
      const imgs = await this.hass.callWS<Array<{ id: string; name: string }>>({
        type: 'image/list',
      });
      this._gallery = imgs ?? [];
      this._galleryError = undefined;
    } catch (e) {
      this._galleryError = `Nie udało się pobrać galerii: ${String(e)}`;
    }
  }

  private async _uploadImage(index: number, ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.hass?.fetchWithAuth) return;
    this._galleryBusy = true;
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await this.hass.fetchWithAuth('/api/image/upload', {
        method: 'POST',
        body: form,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const img = (await resp.json()) as { id: string };
      await this._loadGallery(true);
      this._updateScene(index, { image: `/api/image/serve/${img.id}/original` });
      this._galleryError = undefined;
    } catch (e) {
      this._galleryError = `Upload nieudany: ${String(e)}`;
    } finally {
      this._galleryBusy = false;
    }
  }

  // ===== Przeglądarka www/img (media source) =====
  //
  // HA nie listuje www/ wprost, ALE media source potrafi listować dowolny
  // katalog wskazany w `media_dirs`. Konwencja: user dodaje w
  // configuration.yaml wpis `img: /config/www/img` — wtedy przeglądamy
  // `media-source://media_source/img/...`, a wybór zapisujemy jako stabilną
  // ścieżkę `/local/img/<plik>` (ten sam katalog serwowany statycznie).

  @state() private _wwwItems?: Array<{
    title: string;
    id: string;
    dir: boolean;
    rel: string;
  }>;

  @state() private _wwwRel = '';

  @state() private _wwwError?: string;

  private static readonly _WWW_ROOT = 'media-source://media_source/img/.';

  private _wwwRelOf(id: string): string {
    return id
      .replace(/^media-source:\/\/media_source\/img\/?/, '')
      .replace(/\/?\.$/, '')
      .replace(/^\/+|\/+$/g, '');
  }

  private _wwwLocalUrl(rel: string): string {
    const encoded = rel.split('/').map(encodeURIComponent).join('/');
    return `/local/img/${encoded}`;
  }

  private async _browseWww(id?: string): Promise<void> {
    const target = id ?? StratumSceneEditor._WWW_ROOT;
    if (!this.hass?.callWS) {
      this._wwwError = 'Brak API WebSocket.';
      return;
    }
    try {
      const res = await this.hass.callWS<{
        children?: Array<{
          title: string;
          media_content_id: string;
          media_content_type?: string;
          can_expand?: boolean;
        }>;
      }>({ type: 'media_source/browse_media', media_content_id: target });
      const kids = res.children ?? [];
      this._wwwItems = kids
        .filter(
          (c) =>
            c.can_expand ||
            (c.media_content_type ?? '').startsWith('image/') ||
            /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(c.title),
        )
        .map((c) => ({
          title: c.title,
          id: c.media_content_id,
          dir: Boolean(c.can_expand),
          rel: this._wwwRelOf(c.media_content_id),
        }));
      this._wwwRel = this._wwwRelOf(target);
      this._wwwError = undefined;
    } catch {
      this._wwwItems = undefined;
      this._wwwError = 'brak-media-dir';
    }
  }

  private _wwwUp(): void {
    const parts = this._wwwRel.split('/').filter(Boolean);
    parts.pop();
    const id = parts.length
      ? `media-source://media_source/img/${parts.join('/')}/.`
      : StratumSceneEditor._WWW_ROOT;
    void this._browseWww(id);
  }

  private _renderWwwBrowser(index: number, scene: SceneConfig): TemplateResult {
    return html`
      <details class="gallery-block" @toggle=${(ev: Event) => {
        if ((ev.target as HTMLDetailsElement).open && !this._wwwItems) {
          void this._browseWww();
        }
      }}>
        <summary class="gallery-summary">
          <ha-icon .icon=${'mdi:folder-image'}></ha-icon>
          Pliki z www/img
        </summary>
        <div class="gallery-body">
          ${this._wwwError === 'brak-media-dir'
            ? html`<p class="gallery-hint">
                  Żeby karta mogła listować <code>www/img</code>, dodaj w
                  <code>configuration.yaml</code> i zrestartuj HA:
                </p>
                <pre class="gallery-yaml">homeassistant:
  media_dirs:
    local: /media
    img: /config/www/img</pre>
                <p class="gallery-hint">
                  (wpis <code>local</code> zachowuje standardowy katalog
                  mediów). Potem wróć tutaj — pliki pojawią się z podglądem.
                </p>`
            : nothing}
          ${!this._wwwError && this._wwwItems === undefined
            ? html`<p class="gallery-hint">Ładowanie…</p>`
            : nothing}
          ${this._wwwItems && this._wwwRel
            ? html`<button class="gallery-upload" @click=${() => this._wwwUp()}>
                <ha-icon .icon=${'mdi:arrow-up-left'}></ha-icon>
                Wróć (${this._wwwRel})
              </button>`
            : nothing}
          ${this._wwwItems && this._wwwItems.length === 0
            ? html`<p class="gallery-hint">Pusty katalog.</p>`
            : nothing}
          ${this._wwwItems && this._wwwItems.length > 0
            ? html`<div class="preset-grid">
                ${this._wwwItems.map((item) => {
                  if (item.dir) {
                    return html`<button
                      class="preset-thumb"
                      title=${item.title}
                      @click=${() => void this._browseWww(item.id)}
                    >
                      <span class="thumb-image thumb-folder">
                        <ha-icon .icon=${'mdi:folder'}></ha-icon>
                      </span>
                      <span class="thumb-label">${item.title}</span>
                    </button>`;
                  }
                  const url = this._wwwLocalUrl(item.rel);
                  const selected = scene.image === url;
                  return html`<button
                    class="preset-thumb ${selected ? 'selected' : ''}"
                    title=${item.title}
                    @click=${() => this._updateScene(index, { image: url })}
                  >
                    <span
                      class="thumb-image"
                      style=${`background-image:url("${url}");`}
                    ></span>
                    <span class="thumb-label">${item.title}</span>
                  </button>`;
                })}
              </div>`
            : nothing}
        </div>
      </details>
    `;
  }

  private _renderGallery(index: number, scene: SceneConfig): TemplateResult {
    return html`
      <details class="gallery-block" @toggle=${(ev: Event) => {
        if ((ev.target as HTMLDetailsElement).open) void this._loadGallery();
      }}>
        <summary class="gallery-summary">
          <ha-icon .icon=${'mdi:image-multiple-outline'}></ha-icon>
          Galeria HA — przeglądaj / wgraj obraz
        </summary>
        <div class="gallery-body">
          <label class="gallery-upload ${this._galleryBusy ? 'busy' : ''}">
            <ha-icon .icon=${'mdi:upload'}></ha-icon>
            ${this._galleryBusy ? 'Wgrywanie…' : 'Wgraj nowy obraz (png/jpg/webp)'}
            <input
              type="file"
              accept="image/*"
              hidden
              @change=${(ev: Event) => void this._uploadImage(index, ev)}
            />
          </label>
          ${this._galleryError
            ? html`<p class="gallery-error">${this._galleryError}</p>`
            : nothing}
          ${this._gallery === undefined && !this._galleryError
            ? html`<p class="gallery-hint">Ładowanie…</p>`
            : nothing}
          ${this._gallery && this._gallery.length === 0
            ? html`<p class="gallery-hint">
                Galeria pusta — wgraj pierwszy obraz przyciskiem powyżej.
                Obrazy trafiają do magazynu HA (Ustawienia → zdjęcia osób
                używają tego samego), nie do katalogu www.
              </p>`
            : nothing}
          ${this._gallery && this._gallery.length > 0
            ? html`<div class="preset-grid">
                ${this._gallery.map((img) => {
                  const url = `/api/image/serve/${img.id}/original`;
                  const selected = scene.image === url;
                  return html`<button
                    class="preset-thumb ${selected ? 'selected' : ''}"
                    title=${img.name}
                    @click=${() => this._updateScene(index, { image: url })}
                  >
                    <span
                      class="thumb-image"
                      style=${`background-image:url("/api/image/serve/${img.id}/512x512");`}
                    ></span>
                    <span class="thumb-label">${img.name}</span>
                  </button>`;
                })}
              </div>`
            : nothing}
        </div>
      </details>
    `;
  }

  private _renderImageField(index: number, scene: SceneConfig): TemplateResult {
    const isPreset = Boolean(presetIdFromValue(scene.image));
    const resolved = resolveSceneImage(scene.image);
    return html`
      <div class="img-block">
        <label class="img-label">Grafika sceny</label>
        <div class="img-row">
          <span
            class="img-preview"
            style=${resolved ? `background-image:url("${resolved}");` : ''}
            title=${resolved ? 'Podgląd' : 'Brak grafiki'}
          >
            ${resolved
              ? nothing
              : html`<ha-icon .icon=${'mdi:image-off-outline'}></ha-icon>`}
          </span>
          <input
            type="text"
            class="img-input"
            placeholder="/local/sceny/noc.jpg"
            .value=${isPreset ? '' : scene.image ?? ''}
            @change=${(ev: Event) => {
              const v = (ev.target as HTMLInputElement).value.trim();
              this._updateScene(index, { image: v || undefined });
            }}
          />
        </div>
        <p class="img-hint">
          Wrzuć plik (png/jpg) do katalogu <code>config/www</code> na serwerze
          HA — jest wtedy dostępny pod <code>/local/…</code>. Przykład:
          <code>www/sceny/noc.jpg</code> → wpisz <code>/local/sceny/noc.jpg</code>.
          Możesz też wkleić pełny URL. Puste = ikona + kolor. Alternatywnie
          wybierz wbudowaną grafikę poniżej.
        </p>
      </div>
    `;
  }

  private _renderPresetPicker(index: number, scene: SceneConfig): TemplateResult {
    const selected = presetIdFromValue(scene.image);
    return html`
      <div class="preset-block">
        <div class="preset-head">
          <span>Wbudowane grafiki</span>
          ${selected
            ? html`<button class="reset" @click=${() => this._selectPreset(index, null)}>
                Wyczyść wybór
              </button>`
            : nothing}
        </div>
        <div class="preset-grid">
          ${SCENE_PRESETS.map(
            (p) => html`
              <button
                class="preset-thumb ${selected === p.id ? 'selected' : ''}"
                title=${p.label}
                @click=${() => this._selectPreset(index, p.id)}
              >
                <span
                  class="thumb-image"
                  style=${`background-image:url("${resolveSceneImage('stratum:' + p.id)}");`}
                ></span>
                <span class="thumb-label">${p.label}</span>
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  protected render(): TemplateResult {
    const items = this._workingItems();
    const auto = this._isAuto;
    return html`
      ${auto && items.length > 0
        ? html`<p class="auto-hint">
            <ha-icon .icon=${'mdi:auto-fix'}></ha-icon>
            Sceny wykryte automatycznie z obszaru (${items.length}). Każda
            zmiana — nazwa, grafika, ukrycie, kolejność — utrwali tę listę
            w konfiguracji pokoju.
          </p>`
        : nothing}
      ${!auto && items.length > 0
        ? html`<button class="reset-auto" @click=${this._resetToAuto}>
            <ha-icon .icon=${'mdi:auto-fix'}></ha-icon>
            Przywróć auto-wykrywanie z obszaru
          </button>`
        : nothing}
      ${items.length > 0
        ? html`<ha-form
            .hass=${this.hass}
            .data=${this.config}
            .schema=${GLOBAL_SCHEMA}
            .computeLabel=${this._computeGlobalLabel}
            .computeHelper=${this._computeGlobalHelper}
            @value-changed=${this._onGlobalChange}
          ></ha-form>`
        : nothing}

      <div class="stratum-list scenes-list">
        ${items.map((scene, idx) => {
          const open = this._openScenes.has(idx);
          const sep = Boolean(scene.separator);
          const thumb = sep ? undefined : resolveSceneImage(scene.image);
          return html`
            <div
              class="stratum-row active ${scene.hidden ? 'scene-hidden' : ''} ${sep
                ? 'row-sep'
                : ''}"
            >
              <div class="stratum-row-head">
                <span
                  class="stratum-row-avatar ${thumb ? 'scene-thumb' : ''}"
                  style=${thumb ? `background-image:url("${thumb}");` : ''}
                >
                  ${thumb
                    ? nothing
                    : html`<ha-icon
                        .icon=${sep ? 'mdi:minus' : scene.icon ?? 'mdi:palette'}
                      ></ha-icon>`}
                </span>
                <span class="stratum-row-title">${this._sceneTitle(scene)}</span>
                ${scene.hidden
                  ? html`<span class="stratum-badge ghost">ukryta</span>`
                  : nothing}
                <div class="stratum-row-actions">
                  <button
                    class="stratum-icon-btn"
                    title=${scene.hidden ? 'Pokaż scenę' : 'Ukryj scenę'}
                    @click=${() =>
                      this._updateScene(idx, { hidden: !scene.hidden })}
                  >
                    <ha-icon
                      .icon=${scene.hidden ? 'mdi:eye-off' : 'mdi:eye'}
                    ></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title="Przesuń w górę"
                    ?disabled=${idx === 0}
                    @click=${() => this._moveScene(idx, -1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn"
                    title="Przesuń w dół"
                    ?disabled=${idx === items.length - 1}
                    @click=${() => this._moveScene(idx, 1)}
                  >
                    <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn ${open ? 'accent' : ''}"
                    title=${open ? 'Zwiń' : 'Edytuj'}
                    @click=${() => this._toggleEdit(idx)}
                  >
                    <ha-icon .icon=${open ? 'mdi:chevron-up' : 'mdi:pencil'}></ha-icon>
                  </button>
                  <button
                    class="stratum-icon-btn danger"
                    title="Usuń"
                    @click=${() => this._removeScene(idx)}
                  >
                    <ha-icon .icon=${'mdi:delete-outline'}></ha-icon>
                  </button>
                </div>
              </div>
              ${open
                ? html`<div class="stratum-row-sub">
                    <ha-form
                      .hass=${this.hass}
                      .data=${scene}
                      .schema=${sep ? SEPARATOR_FIELDS_SCHEMA : SCENE_FIELDS_SCHEMA}
                      .computeLabel=${this._computeSceneLabel}
                      .computeHelper=${this._computeSceneHelper}
                      @value-changed=${(ev: CustomEvent<{ value: Partial<SceneConfig> }>) =>
                        this._onSceneFieldChange(idx, ev)}
                    ></ha-form>
                    ${sep ? nothing : this._renderImageField(idx, scene)}
                    ${sep ? nothing : this._renderWwwBrowser(idx, scene)}
                    ${sep ? nothing : this._renderGallery(idx, scene)}
                    ${sep ? nothing : this._renderPresetPicker(idx, scene)}
                  </div>`
                : nothing}
            </div>
          `;
        })}
      </div>
      <div class="add-row">
        <button class="stratum-add-btn" @click=${this._addScene}>
          <ha-icon .icon=${'mdi:plus'}></ha-icon>
          Dodaj scenę (także spoza obszaru)
        </button>
        <button class="stratum-add-btn" @click=${this._addSeparator}>
          <ha-icon .icon=${'mdi:minus'}></ha-icon>
          Dodaj separator
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

      .scenes-list {
        margin-top: 12px;
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

      .scene-thumb {
        background-size: cover;
        background-position: center;
      }

      .img-block {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--divider-color);
      }

      .img-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--secondary-text-color);
        margin-bottom: 6px;
      }

      .img-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .img-preview {
        flex-shrink: 0;
        width: 72px;
        height: 44px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background-size: cover;
        background-position: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--secondary-text-color);
      }

      .img-preview ha-icon {
        --mdc-icon-size: 18px;
      }

      .img-input {
        flex: 1;
        min-width: 0;
        font: 13px/1.4 inherit;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.14));
        background: var(--card-background-color, #2b2d31);
        color: var(--primary-text-color);
      }

      .img-input:focus-visible {
        outline: 2px solid var(--primary-color, #ff9b42);
        outline-offset: 1px;
      }

      .img-hint {
        margin: 8px 0 0;
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--secondary-text-color);
      }

      .img-hint code {
        font-family: var(--code-font-family, ui-monospace, Menlo, monospace);
        font-size: 10.5px;
        background: rgba(255, 255, 255, 0.06);
        padding: 1px 5px;
        border-radius: 4px;
      }

      .scene-hidden .stratum-row-title,
      .scene-hidden .stratum-row-avatar {
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

      .preset-block {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--divider-color);
      }

      .preset-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--secondary-text-color);
        margin-bottom: 6px;
      }

      .reset {
        background: transparent;
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 11px;
        color: var(--secondary-text-color);
        cursor: pointer;
        text-transform: none;
        letter-spacing: 0;
      }

      .reset:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .preset-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
        gap: 8px;
      }

      .gallery-block {
        margin: 10px 0 4px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        border-radius: 10px;
        overflow: hidden;
      }

      .gallery-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--primary-text-color);
        cursor: pointer;
        user-select: none;
        list-style: none;
      }
      .gallery-summary::-webkit-details-marker { display: none; }
      .gallery-summary ha-icon {
        --mdc-icon-size: 16px;
        color: var(--primary-color, #ff9b42);
      }

      .gallery-body {
        padding: 4px 12px 12px;
      }

      .gallery-upload {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 10px;
        padding: 7px 14px;
        border-radius: 999px;
        border: 1px dashed var(--divider-color, rgba(255, 255, 255, 0.2));
        font-size: 12px;
        color: var(--primary-text-color);
        cursor: pointer;
        transition: border-color 0.12s ease, background 0.12s ease;
      }
      .gallery-upload:hover {
        border-color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 8%, transparent);
      }
      .gallery-upload.busy {
        opacity: 0.6;
        pointer-events: none;
      }
      .gallery-upload ha-icon { --mdc-icon-size: 15px; }

      .gallery-error {
        margin: 0 0 8px;
        font-size: 12px;
        color: var(--error-color, #e53935);
      }

      .gallery-hint {
        margin: 0 0 8px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .gallery-yaml {
        margin: 0 0 8px;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.25);
        font-size: 11.5px;
        line-height: 1.5;
        overflow-x: auto;
        color: var(--primary-text-color);
      }

      .thumb-folder {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.05);
        color: var(--secondary-text-color);
      }
      .thumb-folder ha-icon {
        --mdc-icon-size: 26px;
      }

      .preset-thumb {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: 0;
        border: 2px solid transparent;
        border-radius: 10px;
        background: transparent;
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.12s ease, border-color 0.12s ease,
          box-shadow 0.12s ease;
      }

      .preset-thumb:hover {
        transform: translateY(-1px);
        border-color: var(--divider-color);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
      }

      .preset-thumb.selected {
        border-color: var(--primary-color, #ff9b42);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color, #ff9b42) 25%, transparent);
      }

      .thumb-image {
        display: block;
        aspect-ratio: 16/9;
        background-size: cover;
        background-position: center;
        border-radius: 8px 8px 0 0;
      }

      .thumb-label {
        padding: 5px 0;
        font-size: 11px;
        font-weight: 500;
        color: var(--primary-text-color);
        text-align: center;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-scene-editor': StratumSceneEditor;
  }
}
