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
    const accent = resolveColor(scene.color) ?? 'var(--primary-color, #ff9b42)';
    const style = hasImage
      ? `background-image: url("${resolvedImage}");`
      : `background: ${accent};`;
    return html`
      <button
        class="tile ${hasImage ? 'has-image' : 'no-image'}"
        part="scene"
        style=${style}
        title=${name}
        @click=${() => this._onTap(scene)}
      >
        ${!hasImage
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
    const size = this.config.size ?? 'md';
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
