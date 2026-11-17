// Pasek scen — siatka klikalnych tile'ów aktywujących sceny HA.
//
// Per scena: obraz (cover) lub kolor+ikona, nazwa overlay, click aktywuje
// scenę przez `scene.turn_on` (albo script/automation analogicznie).
// Layout (liczba kolumn, aspect ratio, rozmiar) pełna customization z configu.

import { LitElement, html, css, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, SceneBarConfig, SceneConfig } from './types.js';
import { sceneBarHassChanged } from './hass-watch.js';
import { resolveColor } from './colors.js';
import { resolveSceneBackground } from './scene-presets.js';
import { runTapAction } from './tap-action.js';
import { sceneSettled, startScenePending, type ScenePending } from './scene-pending.js';
import { buildGradient, type SceneColors, type SceneGradientStyle } from './scene-gradient.js';
import { SceneConfigColors, liveSceneColors } from './scene-colors.js';
import { activationFailed, sceneTapPlan } from './scene-activation.js';

/**
 * Kolory z configu scen (REST, tylko admin) — jedna instancja na moduł,
 * żeby belka piętra i popupy nie pytały API o to samo. Łańcuch fallbacków,
 * bramka admina, kolejka i cache w sessionStorage: scene-colors.ts.
 */
const sceneConfigColors = new SceneConfigColors({
  storage: () => window.sessionStorage,
});

/** Tyle stoi czerwona obwódka po odrzuconym poleceniu (HA zwrócił błąd). */
const SCENE_FAIL_MS = 1600;

@customElement('stratum-scene-bar')
export class StratumSceneBar extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public config?: SceneBarConfig;

  /**
   * Entity ostatnio aktywowanej sceny — kafel dostaje na 900 ms obwódkę
   * potwierdzenia. Scena NIE ma stanu „włączona" (to jednorazowe polecenie,
   * nie przełącznik), więc nie da się jej podświetlić na stałe. Bez tego
   * sygnału klik nie zostawia śladu przez sekundę czy dwie, zanim światła
   * zdążą się przestawić — i użytkownik klika drugi raz.
   */
  @state() private _acks = new Set<string>();

  /** Osobny timer na scenę — dwie sceny tapnięte po sobie gasną niezależnie. */
  private _ackTimers = new Map<string, number>();

  /**
   * Sceny „w toku": od tapnięcia, aż światła przestaną się zmieniać
   * (scene-pending.ts). W tym czasie obwódka stoi, a powtórny tap nie
   * wysyła sceny drugi raz — każde powtórzenie to kolejne komendy w kolejce
   * Zigbee i lampy, które jeszcze nie zdążyły, reagowały przez to później.
   */
  @state() private _pending = new Map<string, ScenePending>();

  private _pendingTimer?: number;

  /**
   * Sceny, których polecenie HA odrzucił — na SCENE_FAIL_MS czerwona
   * obwódka zamiast „zrobione". Bez tego kafel kłamał sukcesem.
   */
  @state() private _failed = new Set<string>();

  private _failTimers = new Map<string, number>();

  /** Sceny z gradientem z ostatniego renderu — do zapytania o config po nim. */
  private _gradientScenes: string[] = [];

  private _unsubColors?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    // Jedno przerysowanie po całej fali odpowiedzi REST, nie po każdej.
    this._unsubColors = sceneConfigColors.subscribe(() => this.requestUpdate());
  }

  public disconnectedCallback(): void {
    this._unsubColors?.();
    this._unsubColors = undefined;
    for (const t of this._ackTimers.values()) window.clearTimeout(t);
    this._ackTimers.clear();
    this._acks = new Set();
    for (const t of this._failTimers.values()) window.clearTimeout(t);
    this._failTimers.clear();
    this._failed = new Set();
    if (this._pendingTimer !== undefined) window.clearInterval(this._pendingTimer);
    this._pendingTimer = undefined;
    this._pending = new Map();
    super.disconnectedCallback();
  }

  protected updated(): void {
    // Side effect poza renderem: render tylko zbiera listę, a o config
    // pytamy po nim. Kolejka sama pomija sceny już sprawdzone, więc
    // kolejne rendery (każda zmiana hass) nie wysyłają nic nowego.
    if (this._gradientScenes.length > 0) {
      sceneConfigColors.request(this.hass, this._gradientScenes);
    }
  }

  /** Sprawdza postęp scen w toku (co 200 ms, tylko gdy jakaś trwa). */
  private _checkPending = (): void => {
    const now = Date.now();
    let changed = false;
    const next = new Map(this._pending);
    for (const [entity, p] of next) {
      if (sceneSettled(p, this.hass, now)) {
        next.delete(entity);
        changed = true;
        // Zakończenie: ta sama obwódka gaśnie płynnie (dawny błysk).
        this._flashAck(entity);
      }
    }
    if (changed) this._pending = next;
    if (next.size === 0 && this._pendingTimer !== undefined) {
      window.clearInterval(this._pendingTimer);
      this._pendingTimer = undefined;
    }
  };

  private _flashAck(entity?: string): void {
    if (!entity) return;
    const prev = this._ackTimers.get(entity);
    if (prev !== undefined) window.clearTimeout(prev);
    this._acks = new Set(this._acks).add(entity);
    this._ackTimers.set(
      entity,
      window.setTimeout(() => {
        this._ackTimers.delete(entity);
        const next = new Set(this._acks);
        next.delete(entity);
        this._acks = next;
      }, 900),
    );
  }

  /** Odrzucone polecenie: stan „w toku" i błysk znikają, zostaje czerwień. */
  private _markFailed(entity: string): void {
    if (this._pending.has(entity)) {
      const next = new Map(this._pending);
      next.delete(entity);
      this._pending = next;
    }
    const ack = this._ackTimers.get(entity);
    if (ack !== undefined) window.clearTimeout(ack);
    this._ackTimers.delete(entity);
    if (this._acks.has(entity)) {
      const acks = new Set(this._acks);
      acks.delete(entity);
      this._acks = acks;
    }
    const prev = this._failTimers.get(entity);
    if (prev !== undefined) window.clearTimeout(prev);
    this._failed = new Set(this._failed).add(entity);
    this._failTimers.set(
      entity,
      window.setTimeout(() => {
        this._failTimers.delete(entity);
        const next = new Set(this._failed);
        next.delete(entity);
        this._failed = next;
      }, SCENE_FAIL_MS),
    );
  }

  private _defaultActivate(scene: SceneConfig, plan: 'pending' | 'await' | 'ack'): void {
    const hass = this.hass;
    const entity = scene.entity;
    if (!hass || !entity) return;
    const domain = entity.split('.')[0]!;
    const service =
      domain === 'script' ? 'turn_on'
      : domain === 'automation' ? 'trigger'
      : 'turn_on';
    void activationFailed(() =>
      hass.callService(domain, service, { entity_id: entity }),
    ).then((failed) => {
      if (!this.isConnected) return;
      if (failed) this._markFailed(entity);
      // Scena nieznana/niedostępna w chwili tapnięcia: pierścień dopiero
      // po potwierdzeniu, że HA polecenie przyjął.
      else if (plan === 'await') this._flashAck(entity);
    });
  }

  private _onTap(scene: SceneConfig): void {
    if (scene.tap_action) {
      // `none` = świadomie wyłączony kafel: ani akcji, ani potwierdzenia.
      if (scene.tap_action.action === 'none') return;
      // Pierścień potwierdzenia dopiero PO obsłużeniu — wcześniej błyskał
      // także dla akcji, których nie umiemy wykonać (np. `assist`), więc
      // user widział „zrobione", choć nic się nie stało. Nieobsłużona akcja
      // wraca do domyślnej aktywacji sceny poniżej, jak klik kafla.
      if (
        runTapAction(this.hass, scene.tap_action, {
          source: this,
          entity_id: scene.entity,
        })
      ) {
        this._flashAck(scene.entity);
        return;
      }
    }
    const entity = scene.entity;
    if (!entity) return;
    // Scena już się wykonuje — drugi tap tylko potwierdza, nie wysyła.
    if (this._pending.has(entity)) return;
    const plan = sceneTapPlan(this.hass, entity);
    // Nowa próba gasi czerwień poprzedniej — wynik pokaże ta próba.
    if (this._failed.has(entity)) {
      const t = this._failTimers.get(entity);
      if (t !== undefined) window.clearTimeout(t);
      this._failTimers.delete(entity);
      const next = new Set(this._failed);
      next.delete(entity);
      this._failed = next;
    }
    if (plan === 'pending') {
      const next = new Map(this._pending);
      next.set(entity, startScenePending(this.hass, entity, Date.now()));
      this._pending = next;
      this._pendingTimer ??= window.setInterval(this._checkPending, 200);
    } else if (plan === 'ack') {
      this._flashAck(entity);
    }
    this._defaultActivate(scene, plan);
  }

  /**
   * Winieta ciemności (wariant A): im ciemniejsza scena, tym mocniej
   * ciemność zaciska się od krawędzi kafla — kolory gradientu zostają
   * żywe w środku. Jasne sceny (bri ≥ 85%) bez winiety.
   */
  private _dimShadow(data: SceneColors): string | undefined {
    const bri = Math.max(0, Math.min(1, data.bri));
    if (bri >= 0.85) return undefined;
    // Krzywa ^1.6: średnie jasności dostają ledwie muśnięcie, dopiero
    // naprawdę ciemne sceny wyraźną winietę — a i tak z ograniczonym
    // zasięgiem (spread max 12 px, krycie max 0.78), żeby świecący
    // rdzeń koloru nigdy nie znikał.
    const d = Math.pow(1 - bri, 1.6);
    const blur = Math.round(18 + 38 * d);
    const spread = Math.round(1 + 11 * d);
    const opacity = Math.round((0.35 + 0.43 * d) * 100);
    // Kolor winiety z tokenu (--stratum-scene-vignette), krycie z jasności.
    return `box-shadow: inset 0 0 ${blur}px ${spread}px color-mix(in srgb, var(--stratum-scene-vignette) ${opacity}%, transparent);`;
  }

  /**
   * Kolory sceny do gradientu: config z REST, gdy już go znamy, inaczej
   * od razu kolory na żywo (scene-colors.ts). Zawsze coś zwraca — kafel
   * ma układ gradientu od pierwszego kadru i nie przeskakuje z „ikony na
   * środku" na „nazwę na dole", kiedy dojdzie odpowiedź.
   */
  private _sceneColors(entityId: string): SceneColors {
    return (
      sceneConfigColors.get(this.hass, entityId) ?? liveSceneColors(this.hass, entityId)
    );
  }

  private _renderTile(scene: SceneConfig): TemplateResult {
    const state = scene.entity ? this.hass?.states?.[scene.entity] : undefined;
    const name =
      scene.name ??
      (state?.attributes?.friendly_name as string | undefined) ??
      scene.entity ??
      '';
    // Warstwy z fallbackami (obok bundla → /hacsfiles/ → SVG) — patrz
    // scene-photo-url.ts; pojedynczy URL dawał pusty kafel poza HACS.
    const backgroundImage = resolveSceneBackground(scene.image);
    const hasImage = Boolean(backgroundImage);
    const icon = scene.icon ?? 'mdi:palette';
    // Bez grafiki i bez jawnego koloru: gradient z kolorów świateł sceny
    // (styl Hue); fallback — kolor akcentu.
    const data =
      !hasImage && !scene.color && scene.entity?.startsWith('scene.')
        ? this._sceneColors(scene.entity)
        : undefined;
    if (data && scene.entity) this._gradientScenes.push(scene.entity);
    const gradient =
      data && scene.entity
        ? buildGradient((this.config?.gradient ?? 'mesh') as SceneGradientStyle, data, scene.entity)
        : undefined;
    const accent = resolveColor(scene.color) ?? 'var(--primary-color)';
    const style = hasImage
      ? `background-image: ${backgroundImage};`
      : `background: ${gradient ?? accent};`;
    // Gradient traktujemy jak grafikę: nazwa na dole na scrimie, bez ikony.
    const hasBackdrop = hasImage || Boolean(gradient);
    const dim = data ? this._dimShadow(data) : undefined;
    const entity = scene.entity;
    const pending = Boolean(entity && this._pending.has(entity));
    const ringClass = entity && this._failed.has(entity)
      ? 'failed'
      : pending
      ? 'ack pending'
      : entity && this._acks.has(entity)
      ? 'ack'
      : '';
    return html`
      <button
        class="tile ${hasBackdrop ? 'has-image' : 'no-image'} ${hasImage
          ? 'photo'
          : ''} ${ringClass}"
        aria-busy=${pending ? 'true' : 'false'}
        part="scene"
        style=${style}
        title=${name}
        @click=${() => this._onTap(scene)}
      >
        ${dim ? html`<span class="dim" style=${dim}></span>` : null}
        ${!hasBackdrop
          ? html`<ha-icon class="tile-icon" aria-hidden="true" .icon=${icon}></ha-icon>`
          : null}
        <span class="tile-name">${name}</span>
      </button>
    `;
  }

  /**
   * Własna bramka paska. Rodzic (popup, belka) podaje świeży `hass` przy
   * każdej zmianie dowolnej encji, a stały config z rodzica niczego nie
   * dawał bez bramki tutaj — pasek i tak przerysowywał wszystkie kafle.
   * Przepuszczamy: każdą zmianę poza samym `hass` (config, potwierdzenia,
   * sceny w toku) oraz `hass`, w którym zmieniło się coś czytanego przez
   * kafle (sceneBarHassChanged). Timery scen w toku czytają `this.hass`
   * same, więc odrzucony render nie zatrzymuje wykrycia końca sceny.
   */
  protected shouldUpdate(changed: PropertyValues<this>): boolean {
    if (changed.size !== 1 || !changed.has('hass')) return true;
    return sceneBarHassChanged(
      changed.get('hass') as HomeAssistant | undefined,
      this.hass,
      this.config?.items,
    );
  }

  protected render(): TemplateResult {
    this._gradientScenes = [];
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
    /* Warstwa tokenów paska scen — jedyne miejsce z literałami kolorów
       (ostatni fallback dla instalacji bez motywu). Kafel sceny leży na
       grafice albo gradiencie, nie na powierzchni motywu, więc napis jest
       zawsze jasny, a cienie zawsze ciemne — niezależnie od motywu. */
    :host {
      display: block;
      --stratum-scene-on-image: var(--stratum-ink-tint, #fff);
      --stratum-scene-shade: var(--stratum-ink-shade, #000);
      /* Obwódka potwierdzenia: jasna z ciemnym konturem pod spodem —
         sama biel znikała na jasnych zdjęciach („Jasne"). */
      --stratum-scene-ack-ring: color-mix(in srgb, var(--stratum-scene-on-image) 92%, transparent);
      --stratum-scene-fail-ring: var(--stratum-alarm, var(--error-color, #f44336));
      /* Winieta ciemności — ciepła czerń, krycie liczone w JS z jasności. */
      --stratum-scene-vignette: #080502;
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
      background: var(--divider-color);
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
      color: var(--stratum-scene-on-image);
      font-family: inherit;
      font-weight: 600;
      text-align: left;
      transition: transform 0.15s ease, filter 0.15s ease;
    }

    /* Zdjęcie sceny ładuje się leniwie (albo wcale: Nabu Casa, instalacja
       ręczna bez /hacsfiles). Bez podkładu kafel był przezroczysty i biała
       nazwa w jasnym motywie stała na białej karcie. Podkład to tło karty
       przyciemnione w stronę cienia — jasny napis czyta się na nim w obu
       motywach, a załadowane zdjęcie go zakrywa. */
    .tile.photo {
      background-color: color-mix(
        in srgb,
        var(--stratum-surface-base, var(--card-background-color)) 45%,
        var(--stratum-scene-shade)
      );
    }

    /* Hover = jasność, nie ruch (§3: hover nie przesuwa treści), i tylko
       przy prawdziwym wskaźniku — na telefonie :hover zostawał po
       tapnięciu i kafel wyglądał na „wybrany", a scena stanu „wybrana"
       nie ma (komentarz przy .ack niżej). */
    @media (hover: hover) {
      .tile:hover {
        filter: brightness(1.08);
      }
    }

    .tile:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--primary-color));
      outline-offset: 2px;
    }

    /* Potwierdzenie przyjęcia polecenia — obwódka gasnąca w 900 ms.
       Świadomie NIE jest to stan „scena aktywna": scena takiego stanu nie
       ma, a udawanie go kłamałoby przy następnej zmianie świateł. */
    .tile.ack::before,
    .tile.failed::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 2;
      border-radius: inherit;
      pointer-events: none;
      box-shadow:
        inset 0 0 0 2px var(--stratum-scene-ack-ring),
        inset 0 0 0 3px color-mix(in srgb, var(--stratum-scene-shade) 35%, transparent);
      animation: stratum-scene-ack 0.9s ease-out forwards;
    }

    /* Scena w toku: obwódka stoi bez gaśnięcia, dopóki lampy się zmieniają
       (bez pulsowania — puls w tej karcie znaczy alarm). Po dojechaniu klasa
       pending znika i obwódka gaśnie zwykłą animacją potwierdzenia. */
    .tile.ack.pending::before {
      animation: none;
      opacity: 1;
    }

    /* HA odrzucił polecenie (scena usunięta, urządzenia offline): ta sama
       obwódka w kolorze błędu, stoi dłużej i gaśnie — bez pulsu, bo to
       informacja o porażce, nie alarm wymagający reakcji. */
    .tile.failed::before {
      box-shadow:
        inset 0 0 0 2px var(--stratum-scene-fail-ring),
        inset 0 0 0 3px color-mix(in srgb, var(--stratum-scene-shade) 35%, transparent);
      animation: stratum-scene-ack 1.6s ease-in forwards;
    }

    .tile:active {
      transform: scale(0.97);
      transition-duration: 80ms;
    }

    @keyframes stratum-scene-ack {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    /* Bez ruchu obwódka po prostu stoi przez czas sygnału i znika razem
       z klasą — sygnał zostaje, animacji nie ma. */
    @media (prefers-reduced-motion: reduce) {
      .tile {
        transition: none;
      }
      .tile.ack::before,
      .tile.failed::before {
        animation: none;
      }
      .tile:active {
        transform: none;
      }
    }

    /* Scrim tylko pod pasem nazwy — wyżej gradient ma świecić pełnym
       kolorem (szeroki scrim „dusił" dolną połowę kafla). */
    .tile.has-image::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        color-mix(in srgb, var(--stratum-scene-shade) 45%, transparent) 0%,
        color-mix(in srgb, var(--stratum-scene-shade) 12%, transparent) 28%,
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
      color: var(--stratum-scene-on-image);
      z-index: 1;
    }

    .tile-name {
      position: relative;
      z-index: 1;
      font-size: 14px;
      text-shadow: 0 1px 2px color-mix(in srgb, var(--stratum-scene-shade) 60%, transparent);
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
