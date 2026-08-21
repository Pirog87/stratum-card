// Dedykowany edytor `display_config` — zamiast gołego ha-form pokazuje
// chipy, swatche kolorów, presety proporcji, grid pozycji ikony i slidery
// z widocznymi wartościami. Emituje `display-config-changed`.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type {
  HoverEffect,
  IconPosition,
  IconStyle,
  RowPreset,
  TileDisplayConfig,
  TileField,
} from './types.js';
import { SCENE_PRESETS } from './scene-presets.js';
import { editorSharedStyles } from './editor-shared-styles.js';

/** Typ edytora — zwykły kontrakt wyglądu, bez conditions (te są top-level). */
export type DisplayEditorMode = 'row' | 'tile';

const FIELD_META: Array<{ key: TileField; icon: string; label: string }> = [
  { key: 'temperature', icon: 'mdi:thermometer', label: 'Temperatura' },
  { key: 'humidity', icon: 'mdi:water-percent', label: 'Wilgotność' },
  { key: 'lights', icon: 'mdi:lightbulb-on', label: 'Światła' },
  { key: 'motion', icon: 'mdi:motion-sensor', label: 'Obecność' },
  { key: 'windows', icon: 'mdi:window-open-variant', label: 'Okna' },
  { key: 'doors', icon: 'mdi:door-open', label: 'Drzwi' },
  { key: 'leak', icon: 'mdi:water-alert', label: 'Wyciek' },
  { key: 'smoke', icon: 'mdi:smoke-detector-variant', label: 'Dym' },
  { key: 'gas', icon: 'mdi:gas-cylinder', label: 'Gaz / CO' },
  { key: 'problem', icon: 'mdi:alert-circle-outline', label: 'Problem' },
];

const ASPECT_PRESETS: Array<{ value: string; label: string }> = [
  { value: '1/1', label: '1:1' },
  { value: '4/3', label: '4:3' },
  { value: '3/2', label: '3:2' },
  { value: '16/9', label: '16:9' },
  { value: '2/1', label: '2:1' },
];

const COLOR_SWATCHES: Array<{ key: string; color: string; label: string }> = [
  { key: 'amber', color: '#ffc107', label: 'Amber' },
  { key: 'green', color: '#4caf50', label: 'Zielony' },
  { key: 'blue', color: '#2196f3', label: 'Niebieski' },
  { key: 'red', color: '#e53935', label: 'Czerwony' },
  { key: 'purple', color: '#9c27b0', label: 'Fioletowy' },
  { key: 'orange', color: '#ff9800', label: 'Pomarańcz' },
  { key: 'teal', color: '#009688', label: 'Morski' },
  { key: 'pink', color: '#ec407a', label: 'Różowy' },
];

const ICON_POSITIONS: Array<{ value: IconPosition; label: string; preview: string }> = [
  { value: 'top-left', label: 'Góra-lewo', preview: '↖' },
  { value: 'top-right', label: 'Góra-prawo', preview: '↗' },
  { value: 'center', label: 'Środek', preview: '●' },
  { value: 'bottom-left', label: 'Dół-lewo', preview: '↙' },
  { value: 'bottom-right', label: 'Dół-prawo', preview: '↘' },
  { value: 'left', label: 'Inline', preview: '⇤' },
];

const ICON_STYLES: Array<{ value: IconStyle; label: string; icon: string }> = [
  { value: 'bubble', label: 'Bubble', icon: 'mdi:circle-slice-8' },
  { value: 'flat', label: 'Płasko', icon: 'mdi:circle-outline' },
  { value: 'none', label: 'Brak', icon: 'mdi:eye-off-outline' },
];

const HOVER_EFFECTS: Array<{ value: HoverEffect; label: string }> = [
  { value: 'none', label: 'Brak' },
  { value: 'subtle', label: 'Subtelny' },
  { value: 'lift', label: 'Podniesienie' },
  { value: 'glow', label: 'Poświata' },
];

const DEFAULT_FIELDS: TileField[] = ['temperature', 'lights', 'motion'];

/** Presety kształtu wiersza — tylko mode 'row'. */
const ROW_PRESETS: Array<{
  value: RowPreset;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    value: 'fill',
    label: 'Fill',
    icon: 'mdi:signal',
    hint: 'Pigułka z wypełnieniem = średnia jasność świateł (domyślny)',
  },
  {
    value: 'pill',
    label: 'Pill',
    icon: 'mdi:capsule',
    hint: 'Pigułka z ringiem aktywności, bez wypełnienia',
  },
  {
    value: 'rail',
    label: 'Rail',
    icon: 'mdi:format-list-bulleted',
    hint: 'Płaska lista z paskiem akcentu — najbardziej zwarta (dawny wygląd)',
  },
  {
    value: 'cards',
    label: 'Karty',
    icon: 'mdi:card-outline',
    hint: 'Miękkie karty z gradient-tintem',
  },
];

@customElement('stratum-display-editor')
export class StratumDisplayEditor extends LitElement {
  @property({ attribute: false }) public config: TileDisplayConfig = {};

  /** Tryb edytora — `tile` pokazuje wszystkie pola, `row` ukrywa tile-only. */
  @property({ type: String }) public mode: DisplayEditorMode = 'tile';

  private _emit(next: TileDisplayConfig): void {
    this.dispatchEvent(
      new CustomEvent('display-config-changed', {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _patch(patch: Partial<TileDisplayConfig>): void {
    this._emit({ ...this.config, ...patch });
  }

  private _onFieldColor(field: TileField, ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    const next = { ...this.config };
    const map = { ...(next.field_colors ?? {}) };
    if (value) map[field] = value;
    else delete map[field];
    if (Object.keys(map).length > 0) next.field_colors = map;
    else delete next.field_colors;
    this._emit(next);
  }

  private _moveField(field: TileField, dir: -1 | 1): void {
    const current = [...(this.config.fields ?? DEFAULT_FIELDS)];
    const i = current.indexOf(field);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= current.length) return;
    [current[i], current[j]] = [current[j]!, current[i]!];
    this._emit({ ...this.config, fields: current });
  }

  private _toggleField(field: TileField): void {
    const current = this.config.fields ?? DEFAULT_FIELDS;
    const next = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field];
    this._patch({ fields: next });
  }

  private _setAspect(value: string): void {
    this._patch({ aspect: value });
  }

  private _onCustomAspect(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    if (!value) {
      const { aspect: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ aspect: value });
    }
  }

  private _setColor(value: string): void {
    this._patch({ accent_color: value });
  }

  private _setRowPreset(value: RowPreset): void {
    // 'fill' to default — nie zapisujemy do configu (czysty YAML).
    const next = { ...this.config };
    if (value === 'fill') delete next.preset;
    else next.preset = value;
    this._emit(next);
  }

  private _toggleAccentFromLights(): void {
    const cfg = this.config;
    const isLights =
      cfg.accent_mode === 'lights' ||
      (cfg.accent_mode === undefined && !cfg.accent_color);
    const next = { ...cfg };
    if (isLights) {
      // Wyłączamy tryb lights → static (z accent_color albo domyślnym amber).
      next.accent_mode = 'static';
    } else if (cfg.accent_color) {
      // Kolor ustawiony, ale user chce dynamiczny — explicit lights.
      next.accent_mode = 'lights';
    } else {
      // Brak koloru → lights jest defaultem, czyścimy klucz.
      delete next.accent_mode;
    }
    this._emit(next);
  }

  private _setStatusLayout(value: 'two-line' | 'right'): void {
    // 'right' to default — nie zapisujemy do configu.
    const next = { ...this.config };
    if (value === 'right') delete next.status_layout;
    else next.status_layout = value;
    this._emit(next);
  }

  private _toggleSlider(): void {
    const next = { ...this.config };
    if (this.config.slider === false) delete next.slider;
    else next.slider = false;
    this._emit(next);
  }

  private _toggleLightsSwitch(): void {
    const next = { ...this.config };
    if (this.config.lights_switch === true) delete next.lights_switch;
    else next.lights_switch = true;
    this._emit(next);
  }

  private _toggleLightsSwitchShowOff(): void {
    const next = { ...this.config };
    if (this.config.lights_switch_show_off === false) {
      delete next.lights_switch_show_off;
    } else {
      next.lights_switch_show_off = false;
    }
    this._emit(next);
  }

  private _onCustomColor(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    if (!value) {
      const { accent_color: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ accent_color: value });
    }
  }

  private _onBgPreset(ev: Event): void {
    const value = (ev.target as HTMLSelectElement).value;
    if (value === '__custom__') return;
    if (!value) {
      const { background_image: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ background_image: value });
    }
  }

  private _onCustomBgUrl(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value.trim();
    if (!value) {
      const { background_image: _drop, ...rest } = this.config;
      void _drop;
      this._emit(rest);
    } else {
      this._patch({ background_image: value });
    }
  }

  private _onToggle(key: 'show_icon' | 'show_name', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    // default = true, więc zapisujemy tylko gdy false.
    if (checked) {
      const next = { ...this.config };
      delete next[key];
      this._emit(next);
    } else {
      this._patch({ [key]: false });
    }
  }

  private _onSlider(key: keyof TileDisplayConfig, ev: Event): void {
    const value = parseFloat((ev.target as HTMLInputElement).value);
    this._patch({ [key]: value } as Partial<TileDisplayConfig>);
  }

  private _setIconStyle(value: IconStyle): void {
    this._patch({ icon_style: value });
  }

  private _setIconPosition(value: IconPosition): void {
    this._patch({ icon_position: value });
  }

  private _setHoverEffect(value: HoverEffect): void {
    this._patch({ hover_effect: value });
  }

  protected render(): TemplateResult {
    const cfg = this.config;
    const fields = cfg.fields ?? DEFAULT_FIELDS;
    const aspect = cfg.aspect ?? '1/1';
    const aspectIsPreset = ASPECT_PRESETS.some((p) => p.value === aspect);
    const customAspect = aspectIsPreset ? '' : aspect;
    const color = cfg.accent_color ?? '';
    const colorIsPreset = COLOR_SWATCHES.some((s) => s.key === color);
    const customColor = colorIsPreset ? '' : color;
    // DEFAULT: akcent ze świateł, chyba że user wybrał konkretny kolor
    // (wtedy static) albo explicit accent_mode.
    const accentFromLights =
      cfg.accent_mode === 'lights' ||
      (cfg.accent_mode === undefined && !cfg.accent_color);
    const rowPreset: RowPreset = cfg.preset ?? 'fill';
    const sliderOn = cfg.slider !== false;
    const statusLayout = cfg.status_layout ?? 'right';
    const bg = cfg.background_image ?? '';
    const bgIsPreset = bg.startsWith('stratum:');
    const customBgUrl = !bgIsPreset ? bg : '';
    const iconStyle = cfg.icon_style ?? 'bubble';
    const iconPos = cfg.icon_position ?? 'top-left';
    const hover = cfg.hover_effect ?? 'subtle';

    const radius = cfg.border_radius ?? 14;
    const padding = cfg.padding ?? 12;
    const minHeight = cfg.min_height ?? (this.mode === 'tile' ? 110 : 85);
    const iconSize = cfg.icon_size ?? 22;
    const press = cfg.press_scale ?? 0.98;

    return html`
      ${this.mode === 'row'
        ? html`<div class="group">
            <label class="group-label">Kształt wiersza</label>
            <div class="chip-row">
              ${ROW_PRESETS.map(
                (p) => html`<button
                  type="button"
                  class="chip ${rowPreset === p.value ? 'on' : ''}"
                  title=${p.hint}
                  @click=${() => this._setRowPreset(p.value)}
                >
                  <ha-icon .icon=${p.icon}></ha-icon>
                  <span>${p.label}</span>
                </button>`,
              )}
            </div>
            <p class="group-hint">
              Fill (domyślny) — wypełnienie pigułki pokazuje średnią jasność
              świateł w pokoju. Rail to dawny, najbardziej zwarty wygląd.
            </p>
            <label class="group-label sub">Układ statusów</label>
            <div class="chip-row">
              <button
                type="button"
                class="chip ${statusLayout === 'two-line' ? 'on' : ''}"
                title="Temp/wilgotność/motion pod nazwą, po prawej liczniki i alarmy"
                @click=${() => this._setStatusLayout('two-line')}
              >
                <ha-icon .icon=${'mdi:format-align-left'}></ha-icon>
                <span>Dwie linie</span>
              </button>
              <button
                type="button"
                class="chip ${statusLayout === 'right' ? 'on' : ''}"
                title="Jedna linia — wszystkie statusy po prawej stronie"
                @click=${() => this._setStatusLayout('right')}
              >
                <ha-icon .icon=${'mdi:format-align-right'}></ha-icon>
                <span>Wszystko po prawej</span>
              </button>
            </div>
            <div style="margin-top:12px">
              ${this._renderSlider('Wysokość wiersza', 'min_height', minHeight, 40, 120, 2, 'px')}
            </div>
            <div class="toggles-row" style="margin-top:4px">
              <label class="toggle">
                <input
                  type="checkbox"
                  .checked=${sliderOn}
                  @change=${this._toggleSlider}
                />
                <span>Suwak jasności gestem (przeciągnij po wierszu)</span>
              </label>
            </div>
            <div class="toggles-row" style="margin-top:4px">
              <label class="toggle">
                <input
                  type="checkbox"
                  .checked=${cfg.lights_switch === true}
                  @change=${this._toggleLightsSwitch}
                />
                <span>Ikona świateł jako włącznik (mini-switch, tap =
                  wł/wył wszystkich świateł)</span>
              </label>
            </div>
            ${cfg.lights_switch === true
              ? html`
                  <div style="margin-top:6px">
                    ${this._renderSlider('Poświata — włączony', 'lights_switch_glow_on', cfg.lights_switch_glow_on ?? 100, 0, 100, 5, '%')}
                    ${this._renderSlider('Poświata — wyłączony', 'lights_switch_glow_off', cfg.lights_switch_glow_off ?? 30, 0, 100, 5, '%')}
                  </div>
                  <div class="toggles-row" style="margin-top:4px">
                    <label class="toggle">
                      <input
                        type="checkbox"
                        .checked=${cfg.lights_switch_show_off !== false}
                        @change=${this._toggleLightsSwitchShowOff}
                      />
                      <span>Pokazuj przełącznik też gdy wszystko zgaszone</span>
                    </label>
                  </div>
                `
              : nothing}
          </div>`
        : nothing}

      <details class="stratum-collapsible">
        <summary>
          <ha-icon .icon=${'mdi:format-list-bulleted-type'}></ha-icon>
          <span>Pola sekcji info — wybór, kolejność, kolory</span>
        </summary>
        <div class="group">
          <label class="group-label">Pola w sekcji info</label>
          <div class="chip-row">
            ${FIELD_META.map((f) => {
              const on = fields.includes(f.key);
              return html`<button
                type="button"
                class="chip field-chip ${on ? 'on' : ''}"
                @click=${() => this._toggleField(f.key)}
              >
                <ha-icon .icon=${f.icon}></ha-icon>
                <span>${f.label}</span>
              </button>`;
            })}
          </div>
          <p class="group-hint">
            Wybrane wartości pokazuje zarówno kafel jak i wiersz. Kliknij żeby
            włączyć/wyłączyć.
          </p>
          ${fields.length > 1
            ? html`
                <label class="group-label" style="margin-top:10px;">Kolejność pól</label>
                <div class="chip-row">
                  ${fields.map((key, i) => {
                    const meta = FIELD_META.find((m) => m.key === key);
                    return html`<span class="chip order-chip">
                      <button
                        class="ord"
                        title="Wcześniej"
                        ?disabled=${i === 0}
                        @click=${() => this._moveField(key, -1)}
                      >
                        <ha-icon .icon=${'mdi:chevron-left'}></ha-icon>
                      </button>
                      <ha-icon .icon=${meta?.icon ?? 'mdi:help'}></ha-icon>
                      <span>${meta?.label ?? key}</span>
                      <button
                        class="ord"
                        title="Później"
                        ?disabled=${i === fields.length - 1}
                        @click=${() => this._moveField(key, 1)}
                      >
                        <ha-icon .icon=${'mdi:chevron-right'}></ha-icon>
                      </button>
                    </span>`;
                  })}
                </div>
                <p class="group-hint">
                  Strzałki zmieniają kolejność wyświetlania (lewo = wcześniej).
                  Kolejność obowiązuje na wierszu i kaflu.
                </p>
              `
            : nothing}
          <label class="group-label" style="margin-top:10px;">Kolory pól</label>
          ${fields.map((key) => {
            const meta = FIELD_META.find((m) => m.key === key);
            return html`<div class="fc-row">
              <span class="fc-label">
                <ha-icon .icon=${meta?.icon ?? 'mdi:help'}></ha-icon>
                ${meta?.label ?? key}
              </span>
              <input
                type="text"
                class="custom-input grow"
                placeholder="domyślny (#hex, nazwa, var(--...))"
                .value=${cfg.field_colors?.[key] ?? ''}
                @change=${(ev: Event) => this._onFieldColor(key, ev)}
              />
            </div>`;
          })}
          <p class="group-hint">
            Puste = kolor domyślny. Koloruje ikonę i wartość pola; dla
            świateł także mini-switch i akcenty wiersza.
          </p>
        </div>
      </details>

      ${this.mode === 'tile'
        ? html`<div class="group">
            <label class="group-label">Proporcje kafla</label>
            <div class="chip-row">
              ${ASPECT_PRESETS.map(
                (p) => html`<button
                  type="button"
                  class="chip aspect-chip ${aspect === p.value ? 'on' : ''}"
                  @click=${() => this._setAspect(p.value)}
                >
                  <span
                    class="aspect-preview"
                    style="aspect-ratio:${p.value};"
                  ></span>
                  ${p.label}
                </button>`,
              )}
              <input
                type="text"
                class="custom-input"
                placeholder="np. 270/150"
                .value=${customAspect}
                @change=${this._onCustomAspect}
              />
            </div>
          </div>`
        : nothing}

      <div class="group">
        <label class="group-label">Kolor akcentu</label>
        <div class="chip-row">
          <button
            type="button"
            class="chip accent-lights ${accentFromLights ? 'on' : ''}"
            title="Kolor i jasność akcentu z aktywnych świateł w pomieszczeniu"
            @click=${this._toggleAccentFromLights}
          >
            <ha-icon .icon=${'mdi:lightbulb-on-outline'}></ha-icon>
            <span>Z świateł</span>
          </button>
          ${COLOR_SWATCHES.map(
            (s) => html`<button
              type="button"
              class="swatch ${!accentFromLights && color === s.key ? 'on' : ''}"
              style="--swatch:${s.color};"
              title=${s.label}
              ?disabled=${accentFromLights}
              @click=${() => this._setColor(s.key)}
            ></button>`,
          )}
          <input
            type="text"
            class="custom-input"
            placeholder="#ffc107 lub var(--color)"
            .value=${customColor}
            ?disabled=${accentFromLights}
            @change=${this._onCustomColor}
          />
          ${color && !accentFromLights
            ? html`<button
                type="button"
                class="chip subtle"
                @click=${() => this._setColor('')}
              >
                <ha-icon .icon=${'mdi:close'}></ha-icon>
              </button>`
            : nothing}
        </div>
        ${accentFromLights
          ? html`<p class="group-hint">
              Akcent dynamiczny — bierze kolor z pierwszego świecącego
              światła (rgb_color) i jasność z brightness. Kafel zmienia
              się live gdy zmieniasz barwę żarówki.
            </p>`
          : nothing}
      </div>

      ${this.mode === 'tile'
        ? html`<div class="group">
            <label class="group-label">Obrazek tła kafla</label>
            <div class="bg-row">
              <select
                class="native-select"
                .value=${bgIsPreset ? bg : customBgUrl ? '__custom__' : ''}
                @change=${this._onBgPreset}
              >
                <option value="">— Brak —</option>
                <optgroup label="Presety Stratum">
                  ${SCENE_PRESETS.map(
                    (p) => html`<option
                      value=${`stratum:${p.id}`}
                      ?selected=${bg === `stratum:${p.id}`}
                    >
                      ${p.label}
                    </option>`,
                  )}
                </optgroup>
                <option
                  value="__custom__"
                  ?selected=${!bgIsPreset && Boolean(customBgUrl)}
                >
                  Custom URL…
                </option>
              </select>
              ${!bgIsPreset
                ? html`<input
                    type="text"
                    class="custom-input grow"
                    placeholder="/local/img/salon.jpg lub https://..."
                    .value=${customBgUrl}
                    @change=${this._onCustomBgUrl}
                  />`
                : nothing}
            </div>
          </div>`
        : nothing}

      <div class="group toggles-row">
        <label class="toggle">
          <input
            type="checkbox"
            .checked=${cfg.show_icon !== false}
            @change=${(ev: Event) => this._onToggle('show_icon', ev)}
          />
          <span>Pokaż ikonę</span>
        </label>
        <label class="toggle">
          <input
            type="checkbox"
            .checked=${cfg.show_name !== false}
            @change=${(ev: Event) => this._onToggle('show_name', ev)}
          />
          <span>Pokaż nazwę</span>
        </label>
      </div>

      <details class="stratum-collapsible" open>
        <summary>
          <ha-icon .icon=${'mdi:ruler-square'}></ha-icon>
          <span>Wymiary i zaokrąglenia</span>
        </summary>
        <div class="stratum-collapsible-body">
          ${this._renderSlider('Zaokrąglenie rogów', 'border_radius', radius, 0, 40, 1, 'px')}
          ${this._renderSlider('Wewnętrzny padding', 'padding', padding, 0, 40, 1, 'px')}
          ${this.mode === 'tile'
            ? this._renderSlider('Min. wysokość kafla', 'min_height', minHeight, 40, 260, 2, 'px')
            : nothing}
        </div>
      </details>

      <details class="stratum-collapsible" open>
        <summary>
          <ha-icon .icon=${'mdi:image-outline'}></ha-icon>
          <span>Ikona</span>
        </summary>
        <div class="stratum-collapsible-body">
          ${this._renderSlider('Rozmiar ikony', 'icon_size', iconSize, 12, 64, 1, 'px')}
          <label class="group-label sub">Styl ikony</label>
          <div class="chip-row">
            ${ICON_STYLES.map(
              (s) => html`<button
                type="button"
                class="chip ${iconStyle === s.value ? 'on' : ''}"
                @click=${() => this._setIconStyle(s.value)}
              >
                <ha-icon .icon=${s.icon}></ha-icon>
                <span>${s.label}</span>
              </button>`,
            )}
          </div>
          ${this.mode === 'tile'
            ? html`
                <label class="group-label sub">Pozycja ikony na kaflu</label>
                <div class="icon-position-grid">
                  ${ICON_POSITIONS.map(
                    (p) => html`<button
                      type="button"
                      class="pos-cell ${iconPos === p.value ? 'on' : ''}"
                      title=${p.label}
                      @click=${() => this._setIconPosition(p.value)}
                    >
                      <span class="pos-glyph">${p.preview}</span>
                      <span class="pos-label">${p.label}</span>
                    </button>`,
                  )}
                </div>
              `
            : nothing}
        </div>
      </details>

      <details class="stratum-collapsible" open>
        <summary>
          <ha-icon .icon=${'mdi:gesture-tap'}></ha-icon>
          <span>Reakcje na dotyk</span>
        </summary>
        <div class="stratum-collapsible-body">
          <label class="group-label sub">Efekt hover</label>
          <div class="chip-row">
            ${HOVER_EFFECTS.map(
              (h) => html`<button
                type="button"
                class="chip ${hover === h.value ? 'on' : ''}"
                @click=${() => this._setHoverEffect(h.value)}
              >
                ${h.label}
              </button>`,
            )}
          </div>
          ${this._renderSlider('Skala przy tapnięciu', 'press_scale', press, 0.9, 1, 0.01, '×')}
        </div>
      </details>
    `;
  }

  private _renderSlider(
    label: string,
    key: keyof TileDisplayConfig,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
  ): TemplateResult {
    return html`
      <div class="slider-row">
        <label class="slider-label">${label}</label>
        <div class="slider-value">${this._formatValue(value, unit)}</div>
        <input
          type="range"
          class="slider"
          min=${min}
          max=${max}
          step=${step}
          .value=${String(value)}
          @input=${(ev: Event) => this._onSlider(key, ev)}
        />
      </div>
    `;
  }

  private _formatValue(v: number, unit: string): string {
    if (unit === '×') return v.toFixed(2);
    return `${v} ${unit}`;
  }

  static styles = [
    editorSharedStyles,
    css`
      :host {
        display: block;
      }

      .group {
        margin-bottom: 18px;
      }

      .group-label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 8px;
      }

      .group-label.sub {
        margin-top: 14px;
      }

      .group-hint {
        margin: 6px 0 0;
        font-size: 11px;
        color: var(--secondary-text-color);
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }

      /* Kolory pól — wiersz label + input. */
      .fc-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .fc-row .fc-label {
        flex: 0 0 116px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .fc-row .fc-label ha-icon {
        --mdc-icon-size: 15px;
      }

      /* Kolejność pól — chip ze strzałkami. */
      .order-chip {
        gap: 3px;
        padding: 4px 6px;
        cursor: default;
      }
      .ord {
        border: 0;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        padding: 0;
        display: inline-flex;
        align-items: center;
      }
      .ord[disabled] {
        opacity: 0.25;
        cursor: default;
      }
      .ord ha-icon {
        --mdc-icon-size: 16px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease,
          transform 0.08s ease;
      }

      .chip ha-icon {
        --mdc-icon-size: 14px;
      }

      .chip:hover {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      }

      .chip:active {
        transform: scale(0.97);
      }

      .chip.on {
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 22%, transparent);
        border-color: var(--primary-color, #ff9b42);
        color: var(--primary-color, #ff9b42);
        font-weight: 600;
      }

      .chip.subtle {
        color: var(--secondary-text-color);
      }

      .chip.accent-lights {
        border-color: color-mix(in srgb, #ffc107 40%, var(--divider-color));
      }

      .chip.accent-lights.on {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, #ffc107 26%, transparent),
          color-mix(in srgb, #ff9b42 26%, transparent)
        );
        border-color: #ffc107;
        color: #ffc107;
      }

      .swatch[disabled],
      .custom-input[disabled] {
        opacity: 0.35;
        cursor: not-allowed;
      }

      .aspect-chip {
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px 4px;
      }

      .aspect-preview {
        display: block;
        width: 26px;
        border: 1.5px solid currentColor;
        border-radius: 3px;
        opacity: 0.6;
      }

      .aspect-chip.on .aspect-preview {
        opacity: 1;
      }

      .swatch {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--swatch, #ccc);
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: transform 0.1s ease, box-shadow 0.12s ease;
      }

      .swatch:hover {
        transform: scale(1.08);
      }

      .swatch.on {
        border-color: var(--primary-text-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--swatch, #ccc) 40%, transparent);
      }

      .custom-input {
        flex: 0 0 auto;
        min-width: 130px;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 12px;
      }

      .custom-input.grow {
        flex: 1 1 auto;
        min-width: 0;
      }

      .custom-input:focus-visible {
        outline: 2px solid var(--primary-color, #ff9b42);
        outline-offset: 1px;
      }

      .native-select {
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--primary-text-color);
        font-size: 13px;
        min-width: 180px;
      }

      .bg-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .toggles-row {
        display: flex;
        gap: 20px;
        align-items: center;
      }

      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        cursor: pointer;
      }

      .toggle input[type='checkbox'] {
        width: 18px;
        height: 18px;
        accent-color: var(--primary-color, #ff9b42);
        cursor: pointer;
      }

      .slider-row {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-rows: auto auto;
        column-gap: 10px;
        row-gap: 2px;
        margin-bottom: 10px;
      }

      .slider-label {
        grid-column: 1;
        grid-row: 1;
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .slider-value {
        grid-column: 2;
        grid-row: 1;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        font-weight: 600;
      }

      .slider {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        accent-color: var(--primary-color, #ff9b42);
        margin: 0;
      }

      .icon-position-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }

      .pos-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 8px 4px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        background: var(--card-background-color, rgba(255, 255, 255, 0.02));
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 11px;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }

      .pos-cell:hover {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      }

      .pos-cell.on {
        border-color: var(--primary-color, #ff9b42);
        background: color-mix(in srgb, var(--primary-color, #ff9b42) 18%, transparent);
        color: var(--primary-color, #ff9b42);
      }

      .pos-glyph {
        font-size: 20px;
        line-height: 1;
      }

      .pos-label {
        font-size: 10px;
      }

      details.stratum-collapsible {
        margin-top: 12px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-display-editor': StratumDisplayEditor;
  }
}
