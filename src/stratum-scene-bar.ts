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
  // Jasność sceny przyciemnia kolory: 100% → pełny kolor, 0% → ~55%.
  const factor = 0.55 + 0.45 * data.bri;
  const scaled = data.colors.slice(0, 4).map((c) => scaleRgb(c, factor));
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

async function fetchSceneColors(
  hass: HomeAssistant,
  entityId: string,
): Promise<SceneColors | null> {
  const state = hass.states?.[entityId];
  // Tylko sceny edytowalne w UI mają `id` i config dostępny przez REST.
  const sceneId = state?.attributes?.id as string | undefined;
  if (!sceneId || !hass.fetchWithAuth) return null;
  try {
    const resp = await hass.fetchWithAuth(
      `/api/config/scene/config/${sceneId}`,
    );
    if (!resp.ok) return null;
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
    if (colors.length === 0) return null;
    return { colors, bri: briN > 0 ? briSum / briN / 255 : 1 };
  } catch {
    return null;
  }
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
    return html`
      <button
        class="tile ${hasBackdrop ? 'has-image' : 'no-image'}"
        part="scene"
        style=${style}
        title=${name}
        @click=${() => this._onTap(scene)}
      >
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

    .tile.has-image::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.55) 0%,
        rgba(0, 0, 0, 0.1) 45%,
        transparent 75%
      );
    }

    .tile.no-image {
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 6px;
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
