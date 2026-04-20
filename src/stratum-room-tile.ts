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
import { buildDefaultCustomConfig } from './custom-cards.js';

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

  /**
   * Tryb wyświetlania tile. Akceptuje natywne (`tile`/`slider`/`chips`/...)
   * oraz dowolne custom card type w formacie `custom:xxx` (np.
   * `custom:mushroom-light-card`) — wtedy wewnętrznie renderujemy ten typ
   * karty z auto-configiem.
   */
  @property({ type: String }) public mode = 'tile';

  /**
   * Template configu merge'owany z auto-configiem gdy `mode: 'custom:xxx'`.
   * Pozwala przekazać dodatkowe pola (np. `fill_container: true` dla
   * mushroom-light-card) które odnoszą się do wszystkich encji w sekcji.
   */
  @property({ attribute: false }) public cardTemplate?: Record<string, unknown>;

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
    this.setAttribute('data-domain', domain);

    // Custom card mode — dowolna karta HACS jako tile.
    if (this.mode.startsWith('custom:')) return this._renderCustomCardMode();

    // Modes universal dla większości domen.
    if (this.mode === 'chips') return this._renderChipsMode(state, domain);
    if (this.mode === 'bubble') return this._renderBubbleMode(state, domain);
    if (this.mode === 'icon') return this._renderIconMode(state, domain);
    if (this.mode === 'ambient' && domain === 'light') {
      return this._renderAmbientLight(state);
    }

    switch (domain) {
      case 'light':
        return this.mode === 'slider'
          ? this._renderLightSlider(state)
          : this._renderToggle(state, domain);
      case 'switch':
      case 'fan':
        return this._renderToggle(state, domain);
      case 'cover':
        return this.mode === 'slider'
          ? this._renderCoverSlider(state)
          : this._renderCover(state);
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

  private _renderChipsMode(state: HassEntity, domain: string): TemplateResult {
    const on = state.state === 'on' || state.state === 'open' || state.state === 'playing';
    const readonly = domain === 'binary_sensor' || domain === 'climate';
    const iconMap: Record<string, string> = {
      light: on ? 'mdi:lightbulb-on' : 'mdi:lightbulb',
      switch: 'mdi:toggle-switch',
      fan: 'mdi:fan',
      cover: on ? 'mdi:blinds-open' : 'mdi:blinds',
      media_player: on ? 'mdi:pause' : 'mdi:play',
      scene: 'mdi:palette',
      binary_sensor: (state.attributes?.device_class === 'window')
        ? on ? 'mdi:window-open-variant' : 'mdi:window-closed-variant'
        : (state.attributes?.device_class === 'door')
        ? on ? 'mdi:door-open' : 'mdi:door-closed'
        : on ? 'mdi:alert' : 'mdi:check-circle',
      climate: 'mdi:thermostat',
    };
    const icon = (state.attributes?.icon as string | undefined) ?? iconMap[domain] ?? 'mdi:help';
    const click = readonly
      ? (ev: Event) => this._openMoreInfo(ev)
      : domain === 'scene'
      ? (ev: Event) => this._callService(ev, 'scene', 'turn_on')
      : domain === 'cover'
      ? (ev: Event) =>
          this._callService(ev, 'cover', on ? 'close_cover' : 'open_cover')
      : domain === 'media_player'
      ? (ev: Event) => this._callService(ev, 'media_player', 'media_play_pause')
      : (ev: Event) => this._callService(ev, domain, 'toggle');

    return html`
      <button
        class="chips-tile ${on ? 'on' : 'off'} ${readonly ? 'readonly' : ''}"
        part="tile"
        @click=${click}
        @contextmenu=${this._openMoreInfo}
        title=${friendlyName(state, this.entity)}
      >
        <ha-icon class="chips-icon" .icon=${icon}></ha-icon>
        <span class="chips-name">${friendlyName(state, this.entity)}</span>
      </button>
    `;
  }

  private _iconForDomain(state: HassEntity, domain: string, on: boolean): string {
    if (state.attributes?.icon) return state.attributes.icon as string;
    const dc = state.attributes?.device_class as string | undefined;
    switch (domain) {
      case 'light': return on ? 'mdi:lightbulb-on' : 'mdi:lightbulb';
      case 'switch': return 'mdi:toggle-switch';
      case 'fan': return 'mdi:fan';
      case 'cover': return on ? 'mdi:blinds-open' : 'mdi:blinds';
      case 'media_player': return on ? 'mdi:pause' : 'mdi:play';
      case 'scene': return 'mdi:palette';
      case 'climate': return 'mdi:thermostat';
      case 'binary_sensor':
        if (dc === 'window') return on ? 'mdi:window-open-variant' : 'mdi:window-closed-variant';
        if (dc === 'door') return on ? 'mdi:door-open' : 'mdi:door-closed';
        return on ? 'mdi:alert' : 'mdi:check-circle';
    }
    return 'mdi:help';
  }

  private _actionForDomain(domain: string, on: boolean): (ev: Event) => void {
    const readonly = domain === 'binary_sensor' || domain === 'climate';
    if (readonly) return (ev: Event) => this._openMoreInfo(ev);
    if (domain === 'scene') return (ev: Event) => this._callService(ev, 'scene', 'turn_on');
    if (domain === 'cover')
      return (ev: Event) => this._callService(ev, 'cover', on ? 'close_cover' : 'open_cover');
    if (domain === 'media_player')
      return (ev: Event) => this._callService(ev, 'media_player', 'media_play_pause');
    return (ev: Event) => this._callService(ev, domain, 'toggle');
  }

  private _isActive(state: HassEntity): boolean {
    return state.state === 'on' || state.state === 'open' || state.state === 'playing';
  }

  private _customEl?: HTMLElement;
  private _customKey?: string;

  private _renderCustomCardMode(): TemplateResult {
    const base = buildDefaultCustomConfig(this.mode, this.entity);
    // Template merge'uje się POD auto-config — `type` i `entity` z base
    // zawsze wygrywają żeby template nie mógł przypadkiem wyłamać iteracji.
    const config: Record<string, unknown> =
      this.cardTemplate && Object.keys(this.cardTemplate).length > 0
        ? { ...this.cardTemplate, ...base }
        : base;
    const key = JSON.stringify(config);
    if (!this._customEl || this._customKey !== key) {
      this._customEl = document.createElement('hui-card');
      this._customKey = key;
    }
    (this._customEl as unknown as { hass?: HomeAssistant }).hass = this.hass;
    (this._customEl as unknown as { config?: Record<string, unknown> }).config = config;
    return html`<div class="custom-slot" part="tile">${this._customEl}</div>`;
  }

  private _renderBubbleMode(state: HassEntity, domain: string): TemplateResult {
    const on = this._isActive(state);
    const icon = this._iconForDomain(state, domain, on);
    const click = this._actionForDomain(domain, on);
    return html`
      <button
        class="bubble-tile ${on ? 'on' : 'off'}"
        part="tile"
        @click=${click}
        @contextmenu=${this._openMoreInfo}
        title=${friendlyName(state, this.entity)}
      >
        <span class="bubble-circle">
          <ha-icon .icon=${icon}></ha-icon>
        </span>
        <span class="bubble-name">${friendlyName(state, this.entity)}</span>
      </button>
    `;
  }

  private _renderIconMode(state: HassEntity, domain: string): TemplateResult {
    const on = this._isActive(state);
    const icon = this._iconForDomain(state, domain, on);
    const click = this._actionForDomain(domain, on);
    return html`
      <button
        class="icon-tile ${on ? 'on' : 'off'}"
        part="tile"
        @click=${click}
        @contextmenu=${this._openMoreInfo}
        title=${friendlyName(state, this.entity)}
      >
        <ha-icon .icon=${icon}></ha-icon>
      </button>
    `;
  }

  private _renderAmbientLight(state: HassEntity): TemplateResult {
    const on = state.state === 'on';
    const bright = (state.attributes?.brightness as number | undefined) ?? 0;
    const pct = on ? Math.round((bright / 255) * 100) : 0;
    const rgb = state.attributes?.rgb_color as [number, number, number] | undefined;
    const color = rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : '#ffc107';
    const bgIntensity = on ? 0.15 + (pct / 100) * 0.55 : 0;
    const bgStyle = on
      ? `background: linear-gradient(135deg, ${color}${Math.round(bgIntensity * 255).toString(16).padStart(2, '0')}, ${color}22);`
      : '';
    return html`
      <div class="ambient-tile ${on ? 'on' : 'off'}" part="tile" style=${bgStyle}>
        <button
          class="ambient-icon"
          @click=${(ev: Event) => this._callService(ev, 'light', 'toggle')}
          @contextmenu=${this._openMoreInfo}
          title=${on ? 'Wyłącz' : 'Włącz'}
        >
          <ha-icon .icon=${on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline'} style="color:${color};"></ha-icon>
        </button>
        <div class="ambient-info">
          <span class="ambient-name">${friendlyName(state, this.entity)}</span>
          <span class="ambient-state">${on ? `${pct}%` : 'wyłączone'}</span>
        </div>
        <input
          type="range"
          class="ambient-range"
          min="0"
          max="100"
          step="1"
          .value=${String(pct)}
          @click=${(ev: Event) => ev.stopPropagation()}
          @change=${(ev: Event) => this._onBrightnessChange(ev)}
          style="accent-color:${color};"
        />
      </div>
    `;
  }

  private _renderLightSlider(state: HassEntity): TemplateResult {
    const on = state.state === 'on';
    const bright = (state.attributes?.brightness as number | undefined) ?? 0;
    const pct = on ? Math.round((bright / 255) * 100) : 0;
    const icon = on ? 'mdi:lightbulb-on' : 'mdi:lightbulb';
    return html`
      <div class="tile slider ${on ? 'on' : 'off'}" part="tile">
        <button
          class="inline-toggle"
          @click=${(ev: Event) => this._callService(ev, 'light', 'toggle')}
          @contextmenu=${this._openMoreInfo}
          title=${on ? 'Wyłącz' : 'Włącz'}
        >
          <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        </button>
        <div class="slider-body">
          <span class="tile-name">${friendlyName(state, this.entity)}</span>
          <input
            type="range"
            class="range"
            min="0"
            max="100"
            step="1"
            .value=${String(pct)}
            @click=${(ev: Event) => ev.stopPropagation()}
            @change=${(ev: Event) => this._onBrightnessChange(ev)}
          />
        </div>
        <span class="tile-state">${on ? `${pct}%` : 'off'}</span>
      </div>
    `;
  }

  private _onBrightnessChange(ev: Event): void {
    const pct = Number((ev.target as HTMLInputElement).value);
    const brightness = Math.round((pct / 100) * 255);
    if (brightness <= 0) {
      void this.hass?.callService('light', 'turn_off', { entity_id: this.entity });
    } else {
      void this.hass?.callService('light', 'turn_on', {
        entity_id: this.entity,
        brightness,
      });
    }
  }

  private _renderCoverSlider(state: HassEntity): TemplateResult {
    const pos = (state.attributes?.current_position as number | undefined) ?? 0;
    const isOpen = state.state === 'open' || pos > 0;
    return html`
      <div class="tile slider ${isOpen ? 'on' : 'off'}" part="tile">
        <ha-icon class="tile-icon" .icon=${isOpen ? 'mdi:blinds-open' : 'mdi:blinds'}></ha-icon>
        <div class="slider-body">
          <span class="tile-name">${friendlyName(state, this.entity)}</span>
          <input
            type="range"
            class="range"
            min="0"
            max="100"
            step="1"
            .value=${String(pos)}
            @click=${(ev: Event) => ev.stopPropagation()}
            @change=${(ev: Event) => {
              const v = Number((ev.target as HTMLInputElement).value);
              void this.hass?.callService('cover', 'set_cover_position', {
                entity_id: this.entity,
                position: v,
              });
            }}
          />
        </div>
        <span class="tile-state">${pos}%</span>
      </div>
    `;
  }

  private _renderToggle(state: HassEntity, domain: string): TemplateResult {
    const on = state.state === 'on';
    const defaultIcon =
      domain === 'light'
        ? on
          ? 'mdi:lightbulb-on'
          : 'mdi:lightbulb-outline'
        : domain === 'fan'
        ? 'mdi:fan'
        : on
        ? 'mdi:toggle-switch'
        : 'mdi:toggle-switch-off-outline';
    const icon = (state.attributes?.icon as string | undefined) ?? defaultIcon;
    // Lights: użyj rgb_color żarówki jako akcentu gdy ON.
    let accent: string | undefined;
    let brightnessPct: number | undefined;
    if (domain === 'light' && on) {
      const rgb = state.attributes?.rgb_color as [number, number, number] | undefined;
      if (rgb) accent = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      const b = state.attributes?.brightness as number | undefined;
      if (typeof b === 'number') brightnessPct = Math.round((b / 255) * 100);
    }
    const style = accent ? `--stratum-tile-accent:${accent};` : '';
    const stateText =
      on && typeof brightnessPct === 'number'
        ? `${brightnessPct}%`
        : on
        ? 'włączone'
        : 'wyłączone';
    return html`
      <button
        class="tile toggle ${on ? 'on' : 'off'} ${domain}"
        part="tile"
        style=${style}
        @click=${(ev: Event) => this._callService(ev, domain, 'toggle')}
        @contextmenu=${this._openMoreInfo}
      >
        <span class="tile-icon-wrap">
          <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        </span>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">${stateText}</span>
        ${on && typeof brightnessPct === 'number'
          ? html`<span
              class="progress-bar"
              style="--pct:${brightnessPct}%;"
            ></span>`
          : nothing}
        ${domain === 'switch' || domain === 'fan'
          ? html`<span class="mini-toggle ${on ? 'on' : ''}">
              <span class="mini-toggle-knob"></span>
            </span>`
          : nothing}
      </button>
    `;
  }

  private _renderCover(state: HassEntity): TemplateResult {
    const pos = state.attributes?.current_position;
    const posNum = typeof pos === 'number' ? Math.round(pos) : undefined;
    const isOpen = state.state === 'open' || (typeof pos === 'number' && pos > 0);
    const icon = isOpen ? 'mdi:blinds-open' : 'mdi:blinds';
    return html`
      <div
        class="tile cover ${isOpen ? 'on' : 'off'}"
        part="tile"
        @click=${this._openMoreInfo}
      >
        <span class="tile-icon-wrap">
          <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        </span>
        <span class="tile-name">${friendlyName(state, this.entity)}</span>
        <span class="tile-state">
          ${posNum !== undefined ? `${posNum}%` : isOpen ? 'otwarte' : 'zamknięte'}
        </span>
        ${posNum !== undefined
          ? html`<span class="progress-bar" style="--pct:${posNum}%;"></span>`
          : nothing}
        <div class="controls">
          <button
            class="ctrl-btn up"
            @click=${(ev: Event) => this._callService(ev, 'cover', 'open_cover')}
            title="Otwórz"
          >
            <ha-icon .icon=${'mdi:chevron-up'}></ha-icon>
          </button>
          <button
            class="ctrl-btn stop"
            @click=${(ev: Event) => this._callService(ev, 'cover', 'stop_cover')}
            title="Stop"
          >
            <ha-icon .icon=${'mdi:square'}></ha-icon>
          </button>
          <button
            class="ctrl-btn down"
            @click=${(ev: Event) => this._callService(ev, 'cover', 'close_cover')}
            title="Zamknij"
          >
            <ha-icon .icon=${'mdi:chevron-down'}></ha-icon>
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
      position: relative;
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
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      color: var(--primary-text-color);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.18s ease, border-color 0.18s ease,
        transform 0.1s ease, box-shadow 0.15s ease;
      overflow: hidden;
    }

    .tile:active {
      transform: scale(0.98);
    }

    .tile.toggle.on {
      background: color-mix(
        in srgb,
        var(--stratum-tile-accent, var(--stratum-chip-lights-color, #ffc107)) 12%,
        var(--stratum-tile-background, rgba(255, 255, 255, 0.03))
      );
      border-color: color-mix(
        in srgb,
        var(--stratum-tile-accent, var(--stratum-chip-lights-color, #ffc107)) 40%,
        transparent
      );
    }

    .tile-icon-wrap {
      grid-area: icon;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      color: var(--secondary-text-color);
      flex-shrink: 0;
      transition: background 0.18s ease, color 0.18s ease;
    }

    .tile.on .tile-icon-wrap {
      background: color-mix(
        in srgb,
        var(--stratum-tile-accent, var(--stratum-chip-lights-color, #ffc107)) 22%,
        transparent
      );
      color: var(--stratum-tile-accent, var(--stratum-chip-lights-color, #ffc107));
    }

    .progress-bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: var(--divider-color, rgba(255, 255, 255, 0.08));
      overflow: hidden;
    }

    .progress-bar::after {
      content: '';
      display: block;
      height: 100%;
      width: var(--pct, 0%);
      background: var(--stratum-tile-accent, var(--stratum-chip-lights-color, #ffc107));
      transition: width 0.25s ease-out;
      border-radius: 3px;
    }

    .mini-toggle {
      grid-area: state;
      position: relative;
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background: var(--divider-color, rgba(255, 255, 255, 0.2));
      flex-shrink: 0;
      transition: background 0.15s ease;
      align-self: center;
    }

    .mini-toggle.on {
      background: var(--stratum-tile-accent, var(--primary-color, #ff9b42));
    }

    .mini-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .mini-toggle.on .mini-toggle-knob {
      transform: translateX(16px);
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
      margin-top: 6px;
    }

    .ctrl-btn {
      flex: 1;
      padding: 6px;
      border-radius: 8px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.03));
      color: var(--primary-text-color);
      cursor: pointer;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      transition: background 0.12s ease, border-color 0.12s ease,
        color 0.12s ease, transform 0.08s ease;
    }

    .ctrl-btn:hover {
      background: color-mix(
        in srgb,
        var(--primary-color, #ff9b42) 12%,
        var(--secondary-background-color, rgba(255, 255, 255, 0.04))
      );
      border-color: var(--primary-color, #ff9b42);
    }

    .ctrl-btn:active {
      transform: scale(0.94);
    }

    .ctrl-btn.up:hover {
      color: #66bb6a;
      border-color: #66bb6a;
    }
    .ctrl-btn.down:hover {
      color: #ef5350;
      border-color: #ef5350;
    }
    .ctrl-btn.stop:hover {
      color: #ffb74d;
      border-color: #ffb74d;
    }

    .ctrl-btn ha-icon {
      --mdc-icon-size: 18px;
    }

    .missing {
      grid-template-columns: auto 1fr;
      grid-template-areas: 'icon name';
      opacity: 0.5;
    }

    .tile.slider {
      grid-template-columns: auto 1fr auto;
      grid-template-areas: 'icon body state';
      cursor: default;
      gap: 8px 12px;
    }

    .slider-body {
      grid-area: body;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .slider-body .tile-name {
      grid-area: unset;
    }

    .inline-toggle {
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      display: inline-flex;
      color: inherit;
    }

    .inline-toggle:hover {
      opacity: 0.8;
    }

    .range {
      width: 100%;
      height: 4px;
      accent-color: var(--stratum-chip-lights-color, #ffc107);
      cursor: pointer;
    }

    .chips-tile {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      min-height: 32px;
      border-radius: var(--stratum-tile-chip-radius, 999px);
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
      background: var(--stratum-tile-chip-background, rgba(255, 255, 255, 0.04));
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .chips-tile.readonly {
      cursor: default;
    }

    .chips-tile.on {
      border-color: var(--stratum-tile-chip-accent, var(--primary-color, #ff9b42));
      background: color-mix(in srgb, var(--stratum-tile-chip-accent, var(--primary-color, #ff9b42)) 18%, transparent);
      color: var(--stratum-tile-chip-accent, var(--primary-color, #ff9b42));
    }

    .chips-tile:hover:not(.readonly) {
      background: var(--stratum-tile-hover-background, rgba(255, 255, 255, 0.08));
    }

    .chips-tile.on:hover:not(.readonly) {
      background: color-mix(in srgb, var(--stratum-tile-chip-accent, var(--primary-color, #ff9b42)) 28%, transparent);
    }

    .chips-icon {
      --mdc-icon-size: 18px;
      flex-shrink: 0;
    }

    .chips-name {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Bubble mode */
    .bubble-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 10px 6px;
      border-radius: 14px;
      border: 1px solid transparent;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
      transition: transform 0.12s ease, background 0.15s ease;
    }

    .bubble-tile:hover {
      transform: translateY(-1px);
      background: var(--stratum-tile-hover-background, rgba(255, 255, 255, 0.06));
    }

    .bubble-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: 2px solid var(--stratum-tile-bubble-accent, var(--secondary-text-color));
      color: var(--stratum-tile-bubble-accent, var(--secondary-text-color));
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .bubble-tile.on .bubble-circle {
      background: var(--stratum-tile-bubble-accent, var(--primary-color, #ff9b42));
      color: #fff;
      border-color: var(--stratum-tile-bubble-accent, var(--primary-color, #ff9b42));
    }

    .bubble-circle ha-icon {
      --mdc-icon-size: 24px;
    }

    .bubble-name {
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    /* Per-domain bubble accent */
    :host([data-domain='light']) .bubble-tile.on {
      --stratum-tile-bubble-accent: var(--stratum-chip-lights-color, #ffc107);
    }
    :host([data-domain='switch']) .bubble-tile.on,
    :host([data-domain='fan']) .bubble-tile.on,
    :host([data-domain='media_player']) .bubble-tile.on {
      --stratum-tile-bubble-accent: var(--primary-color, #ff9b42);
    }
    :host([data-domain='cover']) .bubble-tile.on {
      --stratum-tile-bubble-accent: var(--stratum-chip-windows-color, #42a5f5);
    }
    :host([data-domain='binary_sensor']) .bubble-tile.on {
      --stratum-tile-bubble-accent: #f44336;
    }
    :host([data-domain='binary_sensor']) .bubble-tile.off {
      --stratum-tile-bubble-accent: #4caf50;
    }

    /* Icon mode */
    .icon-tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .icon-tile:hover {
      background: var(--stratum-tile-hover-background, rgba(255, 255, 255, 0.08));
    }

    .icon-tile.on {
      color: var(--stratum-tile-icon-accent, var(--primary-color, #ff9b42));
      border-color: var(--stratum-tile-icon-accent, var(--primary-color, #ff9b42));
    }

    :host([data-domain='light']) .icon-tile.on {
      --stratum-tile-icon-accent: var(--stratum-chip-lights-color, #ffc107);
    }
    :host([data-domain='binary_sensor']) .icon-tile.on {
      --stratum-tile-icon-accent: #f44336;
    }
    :host([data-domain='binary_sensor']) .icon-tile.off {
      color: #4caf50;
    }

    .icon-tile ha-icon {
      --mdc-icon-size: 22px;
    }

    /* Ambient mode (lights) */
    .ambient-tile {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-areas:
        'icon info'
        'slider slider';
      align-items: center;
      gap: 6px 14px;
      padding: 14px;
      min-height: 88px;
      border-radius: 16px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      transition: background 0.3s ease, box-shadow 0.3s ease;
      color: var(--primary-text-color);
    }

    .ambient-tile.on {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      border-color: transparent;
    }

    .ambient-icon {
      grid-area: icon;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 0;
      background: rgba(0, 0, 0, 0.25);
      color: var(--secondary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .ambient-tile.on .ambient-icon {
      background: rgba(255, 255, 255, 0.2);
    }

    .ambient-icon ha-icon {
      --mdc-icon-size: 26px;
    }

    .ambient-info {
      grid-area: info;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .ambient-name {
      font-size: 15px;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ambient-state {
      font-size: 12px;
      opacity: 0.85;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    }

    .ambient-range {
      grid-area: slider;
      width: 100%;
      height: 5px;
      cursor: pointer;
    }

    .custom-slot {
      display: block;
    }

    .custom-slot > * {
      display: block;
      width: 100%;
    }

    /* Per-domain akcenty w chips mode */
    :host([data-domain='light']) .chips-tile.on {
      --stratum-tile-chip-accent: var(--stratum-chip-lights-color, #ffc107);
    }
    :host([data-domain='binary_sensor']) .chips-tile.on {
      --stratum-tile-chip-accent: #f44336;
    }
    :host([data-domain='binary_sensor']) .chips-tile.off {
      --stratum-tile-chip-accent: #4caf50;
      border-color: var(--stratum-tile-chip-accent, #4caf50);
      color: var(--stratum-tile-chip-accent, #4caf50);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-room-tile': StratumRoomTile;
  }
}
