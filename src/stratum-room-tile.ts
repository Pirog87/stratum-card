// Uniwersalny tile dla pojedynczej encji w room card.
//
// Decyduje co renderować w zależności od `domain` / `device_class`:
//  - light/switch/fan      → ikona + nazwa + toggle on/off
//  - cover                 → ikona + nazwa + 3 przyciski (↑/■/↓)
//  - binary_sensor (window/door) → readonly status (kolor + ikona)
//  - climate               → temp pokojowa + setpoint (readonly v1)
//  - media_player          → play/pause + status
//  - scene                 → przycisk „Aktywuj"
//
// Wszystkie akcje przez `hass.callService`. Click w całe tile poza dedykowanymi
// kontrolkami otwiera `more-info`.

import { LitElement, html, css, type TemplateResult, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HassEntity, HomeAssistant } from './types.js';

function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? '';
}

function friendlyName(state: HassEntity | undefined, entityId: string): string {
  return (state?.attributes?.friendly_name as string | undefined) ?? entityId;
}

@customElement('stratum-room-tile')
export class StratumRoomTile extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: String, attribute: 'entity' }) public entity = '';

  private _state(): HassEntity | undefined {
    return this.hass?.states?.[this.entity];
  }

  private _callService(
    ev: Event,
    domain: string,
    service: string,
    data: Record<string, unknown> = {},
  ): void {
    ev.stopPropagation();
    ev.preventDefault();
    void this.hass?.callService(domain, service, {
      entity_id: this.entity,
      ...data,
    });
  }

  private _openMoreInfo(ev: Event): void {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('hass-more-info', {
        detail: { entityId: this.entity },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected render(): TemplateResult | typeof nothing {
    const state = this._state();
    if (!state) {
      return html`<div class="tile missing" part="tile">
        <ha-icon .icon=${'mdi:alert-circle-outline'}></ha-icon>
        <span>${this.entity}</span>
      </div>`;
    }

    const domain = domainOf(this.entity);
    switch (domain) {
      case 'light':
      case 'switch':
      case 'fan':
        return this._renderToggle(state, domain);
      case 'cover':
        return this._renderCover(state);
      case 'binary_sensor':
        return this._renderBinary(state);
      case 'climate':
        return this._renderClimate(state);
      case 'media_player':
        return this._renderMedia(state);
      case 'scene':
        return this._renderScene(state);
      default:
        return this._renderGeneric(state);
    }
  }

  private _renderToggle(state: HassEntity, domain: string): TemplateResult {
    const on = state.state === 'on';
    const icon =
      (state.attributes?.icon as string | undefined) ??
      (domain === 'light' ? (on ? 'mdi:lightbulb-on' : 'mdi:lightbulb')
       : domain === 'fan' ? 'mdi:fan'
       : 'mdi:toggle-switch');
    return html`
      <button
        class="tile toggle ${on ? 'on' : 'off'}"
        part="tile"
        @click=${(ev: Event) => this._callService(ev, domain, 'toggle')}
        @contextmenu=${this._openMoreInfo}
      >
        <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">${on ? 'włączone' : 'wyłączone'}</span>
      </button>
    `;
  }

  private _renderCover(state: HassEntity): TemplateResult {
    const pos = state.attributes?.current_position;
    const isOpen = state.state === 'open' || (typeof pos === 'number' && pos > 0);
    return html`
      <div
        class="tile cover ${isOpen ? 'on' : 'off'}"
        part="tile"
        @click=${this._openMoreInfo}
      >
        <ha-icon class="tile-icon" .icon=${isOpen ? 'mdi:blinds-open' : 'mdi:blinds'}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">${typeof pos === 'number' ? `${pos}%` : state.state}</span>
        <div class="controls">
          <button @click=${(ev: Event) => this._callService(ev, 'cover', 'open_cover')} title="Otwórz">
            <ha-icon .icon=${'mdi:arrow-up'}></ha-icon>
          </button>
          <button @click=${(ev: Event) => this._callService(ev, 'cover', 'stop_cover')} title="Stop">
            <ha-icon .icon=${'mdi:stop'}></ha-icon>
          </button>
          <button @click=${(ev: Event) => this._callService(ev, 'cover', 'close_cover')} title="Zamknij">
            <ha-icon .icon=${'mdi:arrow-down'}></ha-icon>
          </button>
        </div>
      </div>
    `;
  }

  private _renderBinary(state: HassEntity): TemplateResult {
    const on = state.state === 'on';
    const dc = state.attributes?.device_class as string | undefined;
    const icon = dc === 'window'
      ? (on ? 'mdi:window-open-variant' : 'mdi:window-closed-variant')
      : dc === 'door'
      ? (on ? 'mdi:door-open' : 'mdi:door-closed')
      : on ? 'mdi:alert' : 'mdi:check-circle';
    return html`
      <button
        class="tile binary ${on ? 'on' : 'off'}"
        part="tile"
        @click=${this._openMoreInfo}
      >
        <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">${on ? 'otwarte' : 'zamknięte'}</span>
      </button>
    `;
  }

  private _renderClimate(state: HassEntity): TemplateResult {
    const current = state.attributes?.current_temperature;
    const setpoint = state.attributes?.temperature;
    return html`
      <button
        class="tile climate ${state.state !== 'off' ? 'on' : 'off'}"
        part="tile"
        @click=${this._openMoreInfo}
      >
        <ha-icon class="tile-icon" .icon=${'mdi:thermostat'}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">
          ${typeof current === 'number' ? `${current}°` : '?°'}
          ${typeof setpoint === 'number' ? html`→ ${setpoint}°` : nothing}
        </span>
      </button>
    `;
  }

  private _renderMedia(state: HassEntity): TemplateResult {
    const playing = state.state === 'playing';
    return html`
      <button
        class="tile media ${playing ? 'on' : 'off'}"
        part="tile"
        @click=${(ev: Event) =>
          this._callService(ev, 'media_player', 'media_play_pause')}
        @contextmenu=${this._openMoreInfo}
      >
        <ha-icon class="tile-icon" .icon=${playing ? 'mdi:pause' : 'mdi:play'}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">${state.state}</span>
      </button>
    `;
  }

  private _renderScene(state: HassEntity): TemplateResult {
    return html`
      <button
        class="tile scene"
        part="tile"
        @click=${(ev: Event) => this._callService(ev, 'scene', 'turn_on')}
      >
        <ha-icon class="tile-icon" .icon=${'mdi:palette'}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">aktywuj</span>
      </button>
    `;
  }

  private _renderGeneric(state: HassEntity): TemplateResult {
    return html`
      <button class="tile" part="tile" @click=${this._openMoreInfo}>
        <ha-icon class="tile-icon" .icon=${'mdi:tag'}></ha-icon>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">${state.state}</span>
      </button>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    .tile {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas:
        'icon name state'
        'icon ctrl  ctrl';
      align-items: center;
      gap: 4px 10px;
      width: 100%;
      min-height: 56px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      color: var(--primary-text-color);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .tile.cover {
      cursor: default;
    }

    .tile:hover,
    .tile:focus-visible {
      background: var(--stratum-tile-hover-background, rgba(255, 255, 255, 0.06));
      outline: none;
    }

    .tile.on {
      border-color: var(--stratum-tile-accent, var(--primary-color, #ff9b42));
    }

    .tile-icon {
      grid-area: icon;
      --mdc-icon-size: 22px;
      color: var(--secondary-text-color);
    }

    .tile.on .tile-icon {
      color: var(--stratum-tile-accent, var(--primary-color, #ff9b42));
    }

    .tile.toggle.on .tile-icon {
      color: var(--stratum-chip-lights-color, #ffc107);
    }

    .tile.binary.on .tile-icon {
      color: #f44336;
    }

    .tile.binary.off .tile-icon {
      color: #4caf50;
    }

    .tile.scene .tile-icon {
      color: var(--stratum-chip-windows-color, #42a5f5);
    }

    .tile-name {
      grid-area: name;
      font-size: 14px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tile-state {
      grid-area: state;
      font-size: 11px;
      color: var(--secondary-text-color);
    }

    .controls {
      grid-area: ctrl;
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .controls button {
      flex: 1;
      padding: 4px;
      border-radius: 6px;
      border: 1px solid var(--divider-color);
      background: transparent;
      color: var(--primary-text-color);
      cursor: pointer;
      display: inline-flex;
      justify-content: center;
    }

    .controls button:hover {
      background: var(--stratum-tile-hover-background, rgba(255, 255, 255, 0.06));
      border-color: var(--primary-color);
    }

    .controls ha-icon {
      --mdc-icon-size: 16px;
    }

    .missing {
      grid-template-columns: auto 1fr;
      grid-template-areas: 'icon name';
      opacity: 0.5;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-room-tile': StratumRoomTile;
  }
}
