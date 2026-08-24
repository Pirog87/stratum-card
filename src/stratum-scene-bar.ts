// Pasek scen — siatka klikalnych tile'ów aktywujących sceny HA.
//
// Per scena: obraz (cover) lub kolor+ikona, nazwa overlay, click aktywuje
// scenę przez `scene.turn_on` (albo script/automation analogicznie).
// Layout (liczba kolumn, aspect ratio, rozmiar) pełna customization z configu.

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HomeAssistant, SceneBarConfig, SceneConfig } from './types.js';
import { resolveColor } from './colors.js';
import { resolveSceneImage } from './scene-presets.js';
import { runTapAction } from './tap-action.js';
import { lightColorOf } from './tile-data.js';

/**
 * Cache surowych danych kolorów z konfiguracji scen HA: scena bez grafiki
 * i bez koloru dostaje tło zmiksowane z kolorów świateł, które ustawia.
 * Klucz = entity_id sceny; wartość = kolory + jasność albo null (nie da
 * się odczytać — scena YAML/z mostka, brak uprawnień itp.). Moduł-level,
 * żeby wiele scene-barów nie odpytywało API o to samo. CSS budowany jest
 * przy renderze wg wybranego stylu (`gradient` w configu).
 */
interface SceneColors {
  colors: string[];
  bri: number;
}

const sceneColorsCache = new Map<string, SceneColors | null>();
const sceneColorsPending = new Set<string>();

export type SceneGradientStyle = 'mesh' | 'linear' | 'glow' | 'horizon';

function scaleRgb(rgb: string, factor: number): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  const f = (v: string): number => Math.round(parseInt(v, 10) * factor);
  return `rgb(${f(m[1]!)}, ${f(m[2]!)}, ${f(m[3]!)})`;
}

/**
 * Toning koloru sceny (przez HSL) — kafle mają świecić jak w galerii Hue:
 * - nasycenie ×1.35 z podłogą 0.3 i sufitem 0.85 (ciepłe biele → złoto,
 *   bez neonów),
 * - jasność sceny NIE dotyka kolorów W OGÓLE (wariant A z makiety) —
 *   stała podłoga L 0.55, sufit 0.8. Ciemność sceny pokazuje winieta
 *   (inset shadow na kaflu), nie kolory.
 */
function tone(rgb: string): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  const r = parseInt(m[1]!, 10) / 255;
  const g = parseInt(m[2]!, 10) / 255;
  const b = parseInt(m[3]!, 10) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  s = Math.min(0.85, Math.max(0.3, s * 1.35));
  l = Math.min(0.8, Math.max(l, 0.55));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const to255 = (v: number): number => Math.round(v * 255);
  return `rgb(${to255(hue(h + 1 / 3))}, ${to255(hue(h))}, ${to255(hue(h - 1 / 3))})`;
}

function luminance(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return 0;
  return (
    0.2126 * parseInt(m[1]!, 10) +
    0.7152 * parseInt(m[2]!, 10) +
    0.0722 * parseInt(m[3]!, 10)
  );
}

/** Deterministyczny seed z entity_id — sąsiednie kafle różnią się kompozycją. */
function seedOf(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) {
    h = (h * 31 + entityId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Buduje CSS background z kolorów sceny wg wybranego stylu. */
function buildGradient(
  style: SceneGradientStyle,
  data: SceneColors,
  entityId: string,
): string {
  // Toning: nasycenie w górę, jasność stała — ciemność sceny pokazuje
  // winieta na kaflu, nie kolory (patrz komentarz przy tone()).
  const scaled = data.colors.slice(0, 4).map((c) => tone(c));
  const byLum = [...scaled].sort((a, b) => luminance(b) - luminance(a));
  const darkest = byLum[byLum.length - 1]!;

  if (style === 'linear') {
    if (scaled.length === 1) {
      return `linear-gradient(135deg, ${scaled[0]}, ${scaleRgb(scaled[0]!, 0.55)})`;
    }
    return `linear-gradient(135deg, ${scaled.join(', ')})`;
  }

  if (style === 'glow') {
    // Najjaśniejszy kolor świeci z lewego dołu jak lampa.
    const stops =
      byLum.length === 1
        ? `${byLum[0]} 0%, ${scaleRgb(byLum[0]!, 0.3)} 100%`
        : `${byLum[0]} 0%, ${byLum.slice(1).map((c, i) => `${c} ${Math.round(((i + 1) / byLum.length) * 70)}%`).join(', ')}, ${scaleRgb(darkest, 0.3)} 100%`;
    return `radial-gradient(120% 150% at 30% 105%, ${stops})`;
  }

  if (style === 'horizon') {
    // Pionowo: najjaśniejszy u góry, najciemniejszy przy ziemi.
    const stops = [...byLum, scaleRgb(darkest, 0.55)];
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  // mesh (default) — rozmyte plamy radialne jak w Hue. Podkładem jest
  // pełny gradient z kolorów sceny (nie ciemna baza — inaczej między
  // plamami prześwituje czerń i kafel wygląda czarniawo nawet przy 100%
  // jasności); plamy tylko wzbogacają kompozycję.
  const positions = ['12% 12%', '88% 85%', '85% 20%', '15% 80%'];
  const offset = seedOf(entityId) % positions.length;
  const layers = scaled.map((c, i) => {
    const pos = positions[(i + offset) % positions.length]!;
    return `radial-gradient(100% 130% at ${pos}, ${c} 0%, transparent 75%)`;
  });
  const base =
    scaled.length === 1
      ? `linear-gradient(135deg, ${scaled[0]}, ${scaleRgb(scaled[0]!, 0.7)})`
      : `linear-gradient(135deg, ${[...scaled].reverse().join(', ')})`;
  return `${layers.join(', ')}, ${base}`;
}

/** HSL → "rgb(r, g, b)" (format zgodny z lightColorOf/tone). */
function hslToRgbStr(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number): number => Math.round((v + m) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

async function fetchSceneColors(
  hass: HomeAssistant,
  entityId: string,
): Promise<SceneColors | null> {
  const state = hass.states?.[entityId];
  // Ścieżka 1: config sceny przez REST — najdokładniejsze (docelowe
  // kolory sceny), ale tylko sceny edytowalne w UI (`id`) i tylko konto
  // ADMINA (endpoint /api/config/* jest za bramką uprawnień).
  const sceneId = state?.attributes?.id as string | undefined;
  if (sceneId && hass.fetchWithAuth) {
    try {
      const resp = await hass.fetchWithAuth(
        `/api/config/scene/config/${sceneId}`,
      );
      if (resp.ok) {
        const cfg = (await resp.json()) as {
          entities?: Record<string, unknown>;
        };
        const colors: string[] = [];
        let briSum = 0;
        let briN = 0;
        for (const [id, raw] of Object.entries(cfg.entities ?? {})) {
          if (!id.startsWith('light.')) continue;
          const attrs =
            typeof raw === 'object' && raw !== null
              ? (raw as Record<string, unknown>)
              : { state: raw };
          if (attrs.state === 'off') continue;
          const color = lightColorOf({ state: 'on', attributes: attrs });
          if (color && !colors.includes(color)) colors.push(color);
          const b = attrs.brightness;
          if (typeof b === 'number') {
            briSum += Math.max(0, Math.min(255, b));
            briN += 1;
          }
        }
        if (colors.length > 0) {
          return { colors, bri: briN > 0 ? briSum / briN / 255 : 1 };
        }
      }
    } catch {
      // 401/403 (nie-admin) albo sieć — lecimy do fallbacków niżej.
    }
  }
  // Ścieżka 2 (nie-admin / scena YAML): bieżące kolory świateł należących
  // do sceny — `attributes.entity_id` widzi każdy użytkownik. Przybliżenie
  // (kolory „teraz", nie docelowe sceny), ale kafel żyje u wszystkich.
  const members = state?.attributes?.entity_id;
  if (Array.isArray(members)) {
    const colors: string[] = [];
    let briSum = 0;
    let briN = 0;
    for (const id of members) {
      if (typeof id !== 'string' || !id.startsWith('light.')) continue;
      const color = lightColorOf(hass.states?.[id]);
      if (color && !colors.includes(color)) colors.push(color);
      const b = hass.states?.[id]?.attributes?.brightness;
      if (typeof b === 'number') {
        briSum += Math.max(0, Math.min(255, b));
        briN += 1;
      }
    }
    if (colors.length > 0) {
      return { colors, bri: briN > 0 ? briSum / briN / 255 : 1 };
    }
  }
  // Ścieżka 3: wszystko zgaszone / brak danych — deterministyczny,
  // stonowany duet z hasha entity_id, żeby kafel nigdy nie był pusty.
  const h = seedOf(entityId) % 360;
  return {
    colors: [hslToRgbStr(h, 0.5, 0.58), hslToRgbStr((h + 42) % 360, 0.45, 0.52)],
    bri: 1,
  };
}

@customElement('stratum-scene-bar')
export class StratumSceneBar extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public config?: SceneBarConfig;

  private _defaultActivate(scene: SceneConfig): void {
    if (!this.hass || !scene.entity) return;
    const domain = scene.entity.split('.')[0];
    const service =
      domain === 'script' ? 'turn_on'
      : domain === 'automation' ? 'trigger'
      : 'turn_on';
    void this.hass.callService(domain, service, { entity_id: scene.entity });
  }

  private _onTap(scene: SceneConfig): void {
    if (scene.tap_action) {
      void runTapAction(this.hass, scene.tap_action, { source: this });
      return;
    }
    this._defaultActivate(scene);
  }

  /**
   * Winieta ciemności (wariant A): im ciemniejsza scena, tym mocniej
   * ciemność zaciska się od krawędzi kafla — kolory gradientu zostają
   * żywe w środku. Jasne sceny (bri ≥ 85%) bez winiety.
   */
  private _dimShadow(entityId: string): string | undefined {
    const data = sceneColorsCache.get(entityId);
    if (!data) return undefined;
    const bri = Math.max(0, Math.min(1, data.bri));
    if (bri >= 0.85) return undefined;
    // Krzywa ^1.6: średnie jasności dostają ledwie muśnięcie, dopiero
    // naprawdę ciemne sceny wyraźną winietę — a i tak z ograniczonym
    // zasięgiem (spread max 12 px, krycie max 0.78), żeby świecący
    // rdzeń koloru nigdy nie znikał.
    const d = Math.pow(1 - bri, 1.6);
    const blur = Math.round(18 + 38 * d);
    const spread = Math.round(1 + 11 * d);
    const opacity = (0.35 + 0.43 * d).toFixed(2);
    return `box-shadow: inset 0 0 ${blur}px ${spread}px rgba(8, 5, 2, ${opacity});`;
  }

  /** Gradient z kolorów sceny — z cache; brak = kick off async fetch. */
  private _sceneGradient(entityId: string): string | undefined {
    if (sceneColorsCache.has(entityId)) {
      const data = sceneColorsCache.get(entityId);
      if (!data) return undefined;
      const style = (this.config?.gradient ?? 'mesh') as SceneGradientStyle;
      return buildGradient(style, data, entityId);
    }
    if (!this.hass || sceneColorsPending.has(entityId)) return undefined;
    sceneColorsPending.add(entityId);
    void fetchSceneColors(this.hass, entityId).then((data) => {
      sceneColorsCache.set(entityId, data);
      sceneColorsPending.delete(entityId);
      if (data) this.requestUpdate();
    });
    return undefined;
  }

  private _renderTile(scene: SceneConfig): TemplateResult {
    const state = scene.entity ? this.hass?.states?.[scene.entity] : undefined;
    const name =
      scene.name ??
      (state?.attributes?.friendly_name as string | undefined) ??
      scene.entity ??
      '';
    const resolvedImage = resolveSceneImage(scene.image);
    const hasImage = Boolean(resolvedImage);
    const icon = scene.icon ?? 'mdi:palette';
    // Bez grafiki i bez jawnego koloru: gradient z kolorów świateł sceny
    // (styl Hue); fallback — kolor akcentu.
    const gradient =
      !hasImage && !scene.color && scene.entity?.startsWith('scene.')
        ? this._sceneGradient(scene.entity)
        : undefined;
    const accent = resolveColor(scene.color) ?? 'var(--primary-color, #ff9b42)';
    const style = hasImage
      ? `background-image: url("${resolvedImage}");`
      : `background: ${gradient ?? accent};`;
    // Gradient traktujemy jak grafikę: nazwa na dole na scrimie, bez ikony.
    const hasBackdrop = hasImage || Boolean(gradient);
    const dim = gradient && scene.entity ? this._dimShadow(scene.entity) : undefined;
    return html`
      <button
        class="tile ${hasBackdrop ? 'has-image' : 'no-image'}"
        part="scene"
        style=${style}
        title=${name}
        @click=${() => this._onTap(scene)}
      >
        ${dim ? html`<span class="dim" style=${dim}></span>` : null}
        ${!hasBackdrop
          ? html`<ha-icon class="tile-icon" .icon=${icon}></ha-icon>`
          : null}
        <span class="tile-name">${name}</span>
      </button>
    `;
  }

  protected render(): TemplateResult {
    const items = (this.config?.items ?? []).filter((s) => !s.hidden);
    const sceneCount = items.filter((s) => !s.separator && s.entity).length;
    if (!this.config || sceneCount === 0) {
      return html``;
    }
    const columns = this.config.columns;
    const aspect = this.config.aspect ?? '16/9';
    const size = this.config.size ?? 'sm';
    // Bez `columns`: siatka responsywna — tyle kolumn, ile zmieści szerokość
    // (kafle min 150 px, bez rozpychania na pół monitora).
    const gridStyle = columns
      ? `--scene-aspect:${aspect};grid-template-columns:repeat(${columns},minmax(0,1fr));`
      : `--scene-aspect:${aspect};grid-template-columns:repeat(auto-fill,minmax(var(--stratum-scene-tile-min,150px),1fr));`;

    // Separatory przecinają siatkę — renderujemy ciągi kafli między nimi.
    const blocks: TemplateResult[] = [];
    let run: SceneConfig[] = [];
    const flush = (): void => {
      if (run.length === 0) return;
      const tiles = run.map((sc) => this._renderTile(sc));
      blocks.push(
        html`<div class="bar size-${size}" style=${gridStyle}>${tiles}</div>`,
      );
      run = [];
    };
    for (const item of items) {
      if (item.separator) {
        flush();
        blocks.push(
          item.label
            ? html`<div class="scene-sep"><span>${item.label}</span></div>`
            : html`<div class="scene-sep plain"></div>`,
        );
      } else if (item.entity) {
        run.push(item);
      }
    }
    flush();

    return html`<div class="scene-wrap" part="scene-bar">${blocks}</div>`;
  }

  static styles = css`
    :host {
      display: block;
    }

    .scene-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .scene-sep {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 2px 0;
      color: var(--secondary-text-color);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .scene-sep::before,
    .scene-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--divider-color, rgba(255, 255, 255, 0.12));
    }

    .scene-sep.plain {
      gap: 0;
      margin: 4px 0;
    }

    .bar {
      display: grid;
      gap: var(--stratum-scene-gap, 8px);
    }

    .tile {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      padding: 10px;
      border: 0;
      border-radius: var(--stratum-scene-radius, 12px);
      cursor: pointer;
      overflow: hidden;
      aspect-ratio: var(--scene-aspect, 16/9);
      background-size: cover;
      background-position: center;
      color: #fff;
      font-family: inherit;
      font-weight: 600;
      text-align: left;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .tile:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    .tile:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: 2px;
    }

    /* Scrim tylko pod pasem nazwy — wyżej gradient ma świecić pełnym
       kolorem (szeroki scrim „dusił" dolną połowę kafla). */
    .tile.has-image::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.45) 0%,
        rgba(0, 0, 0, 0.12) 28%,
        transparent 48%
      );
    }

    .tile.no-image {
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 6px;
    }

    /* Winieta ciemności sceny — inset shadow ustawiany inline z bri. */
    .dim {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
    }

    .tile-icon {
      --mdc-icon-size: 28px;
      color: #fff;
      z-index: 1;
    }

    .tile-name {
      position: relative;
      z-index: 1;
      font-size: 14px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    }

    .size-sm .tile {
      padding: 6px;
    }
    .size-sm .tile-name {
      font-size: 12px;
    }
    .size-sm .tile-icon {
      --mdc-icon-size: 22px;
    }

    .size-lg .tile {
      padding: 14px;
    }
    .size-lg .tile-name {
      font-size: 16px;
    }
    .size-lg .tile-icon {
      --mdc-icon-size: 34px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-scene-bar': StratumSceneBar;
  }
}
