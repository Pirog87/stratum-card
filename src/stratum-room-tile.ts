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

import {
  LitElement,
  html,
  css,
  type PropertyValues,
  type TemplateResult,
  nothing,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassEntity, HomeAssistant, TapActionConfig } from './types.js';
import { runTapAction } from './tap-action.js';
import { buildDefaultCustomConfig, mergeCustomTileConfig } from './custom-cards.js';
import { lightColorOf } from './tile-data.js';
import { groupMemberIds } from './area-entities.js';
import { expandLightIds, lightControllerOf, roomLevelFromHass } from './light-dimming.js';
import {
  effectiveState,
  effectiveView,
  pendingWant,
  subscribePower,
  swipePowerHook,
  tapPower,
  touches,
} from './power-pending.js';
import { LightSwipe } from './light-swipe.js';
import { GLIGHT_KEY_COMMIT_MS, glightKeyLevel } from './glight-keys.js';
import { stripeInk } from './header-stripes.js';
import { appBrandGradient } from './media-brands.js';
import { encodeWav } from './audio-wav.js';
import { playPauseService, playerCaps, volumeMode } from './media-features.js';
import {
  INTERCOM_ERROR_MS,
  INTERCOM_PLAY_CONFIRM_MS,
  INTERCOM_UPLOAD_TIMEOUT_MS,
  IntercomError,
  intercomMessage,
  micFailure,
  sendFailure,
  settleWithin,
  uploadFailure,
  withTimeout,
} from './intercom.js';
import { ambientColor, ambientStyle } from './tile-ambient.js';
import {
  binaryStateText,
  entityStateText,
  mediaStateText,
  tileStrings,
} from './tile-state-text.js';
import type { TileStrings } from './localize/tile.js';

/** Stany z podmienionym `state` (w toku) — ta sama tożsamość między renderami. */
const patchedStates = new WeakMap<HassEntity, Map<string, HassEntity>>();

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

  /** Override nazwy (jawna lista świateł popupu). */
  @property({ type: String, attribute: 'name-override' }) public nameOverride?: string;

  /** Override ikony (jawna lista świateł popupu). */
  @property({ type: String, attribute: 'icon-override' }) public iconOverride?: string;

  /** Override akcji kliknięcia kafla (jawne listy popupu). */
  @property({ attribute: false }) public tapAction?: TapActionConfig;

  /** Player: krok przycisków ± głośności w % (config sekcji). Default 2. */
  @property({ attribute: false }) public volumeStep?: number;

  /** Player: krótkofalówka 🎙 (config sekcji `intercom`). Default true. */
  @property({ attribute: false }) public intercom?: boolean;

  /**
   * Stan krótkofalówki: nagrywanie / wysyłka / błąd (undefined = spoczynek).
   * `error` trzyma się kilka sekund — przycisk, który po porażce po prostu
   * wraca do spoczynku, wygląda jak udana wysyłka.
   */
  @state() private _rec?: 'recording' | 'sending' | 'error';

  /** Komunikat ostatniej porażki krótkofalówki (podpis przycisku w stanie `error`). */
  @state() private _recError?: string;

  private _recErrorTimer?: number;

  private _recorder?: MediaRecorder;

  private _recChunks: Blob[] = [];

  private _recStream?: MediaStream;

  private _recMaxTimer?: number;

  /** Czy palec nadal trzyma przycisk — getUserMedia jest async. */
  private _recWanted = false;

  /**
   * Głośnik, dla którego trwa nagranie — zapamiętany przy starcie.
   * Zakładki odtwarzaczy w sekcji mediów renderują JEDEN kafel i
   * podmieniają mu `entity`; czytane dopiero po uploadzie (do ~30 s)
   * `this.entity` puszczało komunikat nagrany dla Kuchni w Salonie,
   * jeśli w międzyczasie zmieniono zakładkę.
   */
  private _recEntity?: string;

  /**
   * Pokolenie krótkofalówki — rośnie przy zmianie encji i odłączeniu
   * (_recReset). Wysyłka z poprzedniego pokolenia leci do końca na swój
   * głośnik, ale nie rusza już stanu przycisku: „wysyłanie" / błąd
   * Kuchni nie może się pokazać na kaflu Salonu.
   */
  private _recGen = 0;

  /** Słownik tekstów kafla w języku HA (PL domyślnie). */
  private get _s(): TileStrings {
    return tileStrings(this.hass?.language);
  }

  /** Dekoduje nagranie i przepisuje do WAV 24 kHz mono. null = nie wyszło. */
  private async _toWav(blob: Blob): Promise<Blob | null> {
    try {
      const raw = await blob.arrayBuffer();
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      const decoded = await ctx.decodeAudioData(raw);
      void ctx.close();
      const rate = 24000;
      const frames = Math.ceil(decoded.duration * rate);
      if (frames <= 0) return null;
      const off = new OfflineAudioContext(1, frames, rate);
      const src = off.createBufferSource();
      src.buffer = decoded;
      src.connect(off.destination);
      src.start();
      const rendered = await off.startRendering();
      return new Blob([encodeWav(rendered.getChannelData(0), rate)], {
        type: 'audio/wav',
      });
    } catch {
      return null;
    }
  }

  /**
   * Krótkofalówka dostępna: config nie wyłącza, kontekst bezpieczny
   * (mikrofon działa tylko po HTTPS), przeglądarka umie nagrywać,
   * a user jest adminem (upload do /media to endpoint admin-only).
   * Bit PLAY_MEDIA sprawdza render playera — getter nie zna stanu encji.
   */
  private get _canIntercom(): boolean {
    if (this.intercom === false) return false;
    if (typeof MediaRecorder === 'undefined') return false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    if (this.hass?.user?.is_admin === false) return false;
    return Boolean(this.hass?.fetchWithAuth);
  }

  /**
   * Start nagrania — z palca/myszy (pointerdown) albo z klawiatury
   * (Enter/Spacja, _micKeyDown). Przechwycenie wskaźnika tylko dla
   * PointerEvent: KeyboardEvent nie ma `pointerId`, a setPointerCapture
   * z undefined rzuca NotFoundError, zanim nagranie w ogóle ruszy.
   */
  private async _intercomStart(ev: Event): Promise<void> {
    ev.stopPropagation();
    ev.preventDefault();
    if (ev instanceof PointerEvent) {
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    }
    // Błąd poprzedniej próby nie blokuje nowej — przytrzymanie go zdejmuje.
    if (this._rec === 'error') this._clearRecError();
    if (this._rec) return;
    this._recWanted = true;
    const gen = this._recGen;
    const entity = this.entity;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this._recWanted || gen !== this._recGen) {
        // Palec puszczony (albo zmiana zakładki / odłączenie), zanim
        // przeglądarka dała mikrofon.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      this._recChunks = [];
      rec.ondataavailable = (e: BlobEvent): void => {
        if (e.data.size > 0) this._recChunks.push(e.data);
      };
      rec.onstop = (): void => {
        void this._intercomSend();
      };
      rec.start();
      this._recorder = rec;
      this._recStream = stream;
      this._recEntity = entity;
      this._rec = 'recording';
      // Bezpiecznik: max 30 s nagrania.
      this._recMaxTimer = window.setTimeout(() => this._intercomStop(), 30000);
    } catch (err) {
      // Brak zgody na mikrofon (aplikacja HA bez uprawnienia, odmowa w
      // przeglądarce) albo brak urządzenia — mówimy to wprost, zamiast
      // martwego przycisku bez wyjaśnienia.
      this._recWanted = false;
      // Mikrofon dany, ale MediaRecorder nie wstał (nieobsługiwany format)
      // — zwalniamy go, inaczej Android trzyma ikonę nagrywania.
      stream?.getTracks().forEach((t) => t.stop());
      this._recFail(new IntercomError(micFailure(err)), gen === this._recGen);
    }
  }

  /**
   * Porażka krótkofalówki: toast HA z powodem zawsze, a czerwony przycisk
   * tylko gdy `ownState` — kafel dalej pokazuje ten głośnik i nie zaczął
   * w międzyczasie nowego nagrania.
   */
  private _recFail(err: IntercomError, ownState = true): void {
    const message = intercomMessage(err, this._s);
    // Odłączony kafel (popup zamknięty w trakcie wysyłki): disconnected-
    // Callback już wyczyścił stan, a timer ustawiałby go martwemu elementowi.
    if (ownState && this.isConnected) {
      this._rec = 'error';
      this._recError = message;
      if (this._recErrorTimer !== undefined) window.clearTimeout(this._recErrorTimer);
      this._recErrorTimer = window.setTimeout(() => {
        this._recErrorTimer = undefined;
        if (this._rec === 'error') this._clearRecError();
      }, INTERCOM_ERROR_MS);
    }
    // Toast HA — ten sam kanał, którym frontend pokazuje własne błędy.
    // Event z odłączonego elementu nigdzie nie dopływa: użytkownik puszcza
    // przycisk, zamyka popup, a 403 przychodzi chwilę później — dawniej
    // znów cisza. Wtedy wysyłamy wprost na <home-assistant>, gdzie HA
    // nasłuchuje `hass-notification`; window to ostatnia deska (bez toastu,
    // ale i bez wyjątku).
    const target: EventTarget = this.isConnected
      ? this
      : document.querySelector('home-assistant') ?? window;
    target.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _clearRecError(): void {
    if (this._recErrorTimer !== undefined) {
      window.clearTimeout(this._recErrorTimer);
      this._recErrorTimer = undefined;
    }
    if (this._rec === 'error') this._rec = undefined;
    this._recError = undefined;
  }

  /**
   * Pełny reset krótkofalówki (zmiana encji, odłączenie): trwające nagranie
   * przepada bez wysyłki, mikrofon zwolniony, nowe pokolenie. Wysyłka już
   * w locie kończy się na głośniku, który zapamiętała.
   */
  private _recReset(): void {
    this._recGen += 1;
    this._recWanted = false;
    if (this._recMaxTimer !== undefined) {
      window.clearTimeout(this._recMaxTimer);
      this._recMaxTimer = undefined;
    }
    if (this._recorder && this._recorder.state === 'recording') {
      this._recorder.onstop = null;
      this._recorder.stop();
    }
    this._recorder = undefined;
    this._recChunks = [];
    this._recStream?.getTracks().forEach((t) => t.stop());
    this._recStream = undefined;
    this._recEntity = undefined;
    this._clearRecError();
    this._rec = undefined;
  }

  private _intercomStop = (ev?: Event): void => {
    ev?.stopPropagation();
    this._recWanted = false;
    if (this._recMaxTimer !== undefined) {
      window.clearTimeout(this._recMaxTimer);
      this._recMaxTimer = undefined;
    }
    if (this._recorder && this._recorder.state === 'recording') {
      this._recorder.stop(); // onstop → _intercomSend
    }
  };

  /**
   * Klawiatura: Enter/Spacja działają jak przytrzymanie palca — wciśnięty
   * klawisz nagrywa, puszczony wysyła. Dawniej mikrofon reagował tylko na
   * pointerdown i z klawiatury był martwy (CLAUDE.md §3). Autopowtórzenie
   * trzymanego klawisza (`repeat`) ignorujemy — startowałoby w kółko.
   */
  private _micKeyDown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat) return;
    void this._intercomStart(ev);
  }

  private _micKeyUp = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    // preventDefault: Spacja na <button> klika dopiero przy puszczeniu.
    ev.preventDefault();
    this._intercomStop(ev);
  };

  private async _intercomSend(): Promise<void> {
    const gen = this._recGen;
    // To samo pokolenie = kafel dalej pokazuje ten głośnik i może ruszać
    // stan przycisku.
    const own = (): boolean => gen === this._recGen;
    const entity = this._recEntity ?? this.entity;
    this._recEntity = undefined;
    const mime = this._recorder?.mimeType || 'audio/webm';
    this._recorder = undefined;
    this._recStream?.getTracks().forEach((t) => t.stop());
    this._recStream = undefined;
    const blob = new Blob(this._recChunks, { type: mime });
    this._recChunks = [];
    // Muśnięcie przycisku (<0,3 s) — nie wysyłamy szumu.
    if (blob.size < 2000) {
      this._rec = undefined;
      return;
    }
    this._rec = 'sending';
    try {
      // Przekodowanie do WAV — Cast/TV często nie dekodują WebM/Opus
      // (przyjmują plik i „grają" ciszę). WAV PCM gra wszędzie.
      // Limit: decodeAudioData w części WebView potrafi nigdy nie wrócić —
      // wtedy wysyłamy oryginał zamiast wisieć.
      const wav = await withTimeout(() => this._toWav(blob), 8000).catch(() => null);
      const upBlob = wav ?? blob;
      const ext = wav ? 'wav' : mime.includes('mp4') ? 'm4a' : 'webm';
      const upMime = wav ? 'audio/wav' : mime;
      const fname = `stratum-intercom.${ext}`;
      const contentId = `media-source://media_source/local/${fname}`;
      const hass = this.hass;
      const fetchWithAuth = hass?.fetchWithAuth;
      if (!hass || !fetchWithAuth) throw new IntercomError('upload_denied', 401);
      // Poprzednie nagranie precz — inaczej upload dostaje sufiks _2, _3…
      // Porażka (brak pliku, brak uprawnień) nie jest tu błędem: o
      // uprawnieniach i tak powie upload. Krótki limit — WS bywa zawieszony.
      await withTimeout(
        () =>
          Promise.resolve(
            hass.callWS?.({
              type: 'media_source/local_source/remove',
              media_content_id: contentId,
            }),
          ),
        5000,
      ).catch(() => undefined);
      const form = new FormData();
      form.append('media_content_id', 'media-source://media_source/local/.');
      form.append('file', new File([upBlob], fname, { type: upMime }));
      const data = await withTimeout(async (signal) => {
        const resp = await fetchWithAuth('/api/media_source/local_source/upload', {
          method: 'POST',
          body: form,
          signal,
        });
        // 401/403: nie-admin albo zablokowany endpoint; 400/404/500: zwykle
        // brak `media_dirs` (katalog /media nie istnieje w tej instalacji).
        if (!resp.ok) throw new IntercomError(uploadFailure(resp.status), resp.status);
        return (await resp.json()) as { media_content_id?: string };
      }, INTERCOM_UPLOAD_TIMEOUT_MS);
      const play = Promise.resolve(
        hass.callService('media_player', 'play_media', {
          entity_id: entity,
          media_content_id: data.media_content_id ?? contentId,
          media_content_type: 'music',
          announce: true,
        }),
      ).catch(() => {
        // Odrzucenie usługi to porażka głośnika, nie sieci — nawet gdy
        // WebSocket opakuje ją w TypeError.
        throw new IntercomError('play_failed');
      });
      // Brak odpowiedzi w INTERCOM_PLAY_CONFIRM_MS to nie porażka — część
      // integracji odpowiada dopiero po odegraniu komunikatu. Przycisk wraca
      // do spoczynku; późne odrzucenie i tak pokaże toast, a czerwony
      // przycisk tylko, jeśli w międzyczasie nie ruszyło nowe nagranie.
      const outcome = await settleWithin(play, INTERCOM_PLAY_CONFIRM_MS);
      if (outcome === 'pending') {
        play.catch((err: unknown) => {
          this._recFail(sendFailure(err), own() && this._rec === undefined);
        });
      }
      if (own()) this._rec = undefined;
    } catch (err) {
      this._recFail(sendFailure(err), own());
    } finally {
      // Nigdy nie zostawiamy „wysyłania" — dawniej zawieszony fetch
      // blokował przycisk do przeładowania strony.
      if (own() && this._rec === 'sending') this._rec = undefined;
    }
  }

  /**
   * Wykonuje override akcji kliknięcia. true = obsłużone (event zjedzony).
   * Akcja, której nie umiemy wykonać (np. `assist`, `default` z ha-form),
   * zwraca false — kafel wraca do swojego domyślnego kliknięcia zamiast
   * stać się martwy. `none` to świadome wyłączenie klika: zjadamy event.
   */
  private _customTap(ev: Event): boolean {
    const action = this.tapAction;
    if (!action) return false;
    const handled =
      action.action === 'none' ||
      runTapAction(this.hass, action, { source: this, entity_id: this.entity });
    if (!handled) return false;
    ev.stopPropagation();
    ev.preventDefault();
    return true;
  }

  /**
   * Ikona kafla — override z listy popupu wygrywa w KAŻDYM trybie. Wcześniej
   * czytał go tylko rail/tint, więc „Ikona (override)" z edytora nie
   * działała w chips/bubble/icon/slider/ambient/tile ani dla rolet i mediów.
   */
  private _icon(fallback: string): string {
    return this.iconOverride || fallback;
  }

  /** Nazwa do wyświetlenia — override wygrywa nad friendly_name. */
  private _displayName(state: HassEntity): string {
    return this.nameOverride ?? friendlyName(state, this.entity);
  }

  /**
   * Jasność (%) nadpisująca stan z hass: pozycja palca w trakcie swipe, a
   * po puszczeniu — wartość docelowa trzymana, aż HA ją potwierdzi.
   * Ustawiana raz na klatkę (`_scheduleDragRender`), nie na każdy
   * pointermove — ekrany 120 Hz dają ponad sto zdarzeń na sekundę.
   */
  @state() private _dragPct?: number;

  /** Czy palec właśnie ciągnie (wyłącza tranzycję paska — idzie 1:1). */
  @state() private _dragging = false;

  private _dragRaf?: number;

  /** Wartość trzymana po puszczeniu palca + bezpiecznik czasowy. */
  private _hold?: { pct: number; timer: number };

  /** Kontroler gestu jasności — wspólny z wierszem pokoju (`light-swipe.ts`). */
  private _swipe?: LightSwipe;

  private _swipeCtl(): LightSwipe {
    this._swipe ??= new LightSwipe(`tile:${this.entity}`, {
      hass: () => this.hass,
      // Stan kafla (on/off) idzie za wynikiem gestu od razu, jak po tapnięciu.
      onPower: swipePowerHook(() => this.hass),
    });
    return this._swipe;
  }

  private _clearHold(): void {
    if (!this._hold) return;
    window.clearTimeout(this._hold.timer);
    this._hold = undefined;
  }

  /** Poziom (0..100) ze stanów HA — dla grupy: średnia świecących członków. */
  private _lightRestPct(): number {
    return (
      roomLevelFromHass(this.hass, [this.entity], (id) => effectiveView(this.hass, id)) ?? 0
    );
  }

  protected willUpdate(changed: PropertyValues): void {
    // Inna encja = inna roleta: cel poprzedniej nie może na nią przejść.
    if (changed.has('entity') && changed.get('entity') !== undefined) {
      this._coverTarget = undefined;
    }
    // Cel suwaka rolety znika, gdy roleta dojechała albo stoi (po 3 s
    // „rozruchu") — następna jazda (np. z automatyzacji) pokazuje prawdę.
    const ct = this._coverTarget;
    if (ct?.sent) {
      const st = this.hass?.states?.[this.entity];
      const pos = st?.attributes?.current_position as number | undefined;
      const moving = st?.state === 'opening' || st?.state === 'closing';
      const age = Date.now() - ct.at;
      if (
        changed.has('entity') ||
        (typeof pos === 'number' && Math.abs(pos - ct.pos) <= 1) ||
        (!moving && age >= 3000) ||
        age >= 90_000
      ) {
        this._coverTarget = undefined;
      }
    }
    // Ten sam element kafla potrafi dostać inną encję (zakładki odtwarzaczy
    // w sekcji mediów renderują JEDEN kafel i podmieniają mu `entity`).
    // Stan głośności z poprzedniego głośnika nie może przejść na nowy —
    // dawniej „+" po zmianie zakładki wysyłał telewizorowi głośność Sonosa.
    if (changed.has('entity') && changed.get('entity') !== undefined) {
      this._volReset();
      // To samo dla krótkofalówki: nagranie trwające przy zmianie zakładki
      // przepada (było dla innego głośnika), a „wysyłanie" / błąd
      // poprzedniego nie zostaje na kaflu nowego.
      this._recReset();
    }
    // Głośność trzymana po puszczeniu ± — oddajemy ją stanowi z HA, gdy ten
    // dogonił (i nic już nie leci), zamiast po sztywnych 1,5 s.
    if (this._volPending !== undefined && !this._volPressing && changed.has('hass')) {
      this._volMaybeRelease();
    }
    // Po puszczeniu palca trzymamy wartość docelową, dopóki stany z HA do
    // niej nie dojdą (członkowie grupy raportują po kolei).
    if (this._hold && !this._dragging && changed.has('hass')) {
      if (Math.abs(this._lightRestPct() - this._hold.pct) <= 2) {
        this._clearHold();
        this._dragPct = undefined;
      }
    }
  }

  /**
   * Głośność (player): wartość optymistyczna podczas regulacji ±.
   * hass potrafi odświeżać stan z opóźnieniem — bez tego suwak by
   * „skakał" wstecz między tickami przytrzymania.
   */
  @state() private _volPending?: number;

  private _volHoldTimer?: number;

  private _volClearTimer?: number;

  private _volTicks = 0;

  /** Przycisk ± wciśnięty (między pointerdown a pierwszym zakończeniem). */
  private _volPressing = false;

  /**
   * Wysyłka latest-wins: jedna komenda `volume_set` w locie, a kolejne
   * kroki nadpisują tylko wartość czekającą. Przytrzymanie na wolnym
   * urządzeniu (TV, Sonos po Wi-Fi) wysyłało ~34 komendy w 5 s, które
   * urządzenie odrabiało jeszcze długo po puszczeniu.
   */
  private _volInflight = false;

  /**
   * Pokolenie regulacji — rośnie przy zmianie odtwarzacza / odłączeniu.
   * Odpowiedź na komendę z poprzedniego pokolenia niczego już nie rusza:
   * dawniej zmiana zakładki w trakcie lecącej komendy zostawiała „w locie"
   * stary głośnik, a pierwszy krok na nowym ginął w kolejce.
   */
  private _volGen = 0;

  private _volQueued?: number;

  private _volLastSent?: number;

  private _volSend(level: number): void {
    if (!this.hass) return;
    if (this._volInflight) {
      this._volQueued = level;
      return;
    }
    this._volInflight = true;
    this._volLastSent = level;
    const entity = this.entity;
    const gen = this._volGen;
    const done = (): void => {
      // Kafel dostał w międzyczasie inny głośnik albo został odłączony —
      // stan kolejki należy już do nowego pokolenia, nie ruszamy go.
      if (gen !== this._volGen) return;
      this._volInflight = false;
      const queued = this._volQueued;
      this._volQueued = undefined;
      if (queued !== undefined && queued !== this._volLastSent) {
        this._volSend(queued);
        return;
      }
      if (!this._volPressing) this._volMaybeRelease();
    };
    void Promise.resolve(
      this.hass.callService('media_player', 'volume_set', { volume_level: level }, { entity_id: entity }),
    ).then(done, done);
  }

  /**
   * Urządzenie zna tylko krok (VOLUME_STEP bez VOLUME_SET — pilot IR,
   * część TV): `volume_up` / `volume_down`. `volume_set` skończyłby się
   * toastem „akcja nieobsługiwana". Jedna komenda w locie — przytrzymanie
   * nie zakolejkuje kilkudziesięciu kroków, które TV odrabiałby po puszczeniu.
   */
  private _volStepSend(dir: 1 | -1): void {
    if (!this.hass || this._volInflight) return;
    this._volInflight = true;
    const gen = this._volGen;
    const done = (): void => {
      if (gen === this._volGen) this._volInflight = false;
    };
    void Promise.resolve(
      this.hass.callService(
        'media_player',
        dir > 0 ? 'volume_up' : 'volume_down',
        {},
        { entity_id: this.entity },
      ),
    ).then(done, done);
  }

  /** Oddaje suwak stanowi z HA, gdy ten dogonił wartość optymistyczną. */
  private _volMaybeRelease(): void {
    if (this._volPending === undefined || this._volInflight || this._volQueued !== undefined) return;
    // Tylko zgodność wartości — nie „pierwszy raport po potwierdzeniu":
    // urządzenia odsyłają raporty ze spóźnieniem, a stara wartość przyjęta
    // za prawdę cofała głośność przy następnym tapnięciu. Urządzenia
    // zaokrąglające (kroki 5%) puszcza bezpiecznik 4 s.
    const actual = this.hass?.states?.[this.entity]?.attributes?.volume_level;
    const step = (this.volumeStep ?? 2) / 100;
    if (typeof actual === 'number' && Math.abs(actual - this._volPending) <= Math.max(0.015, step / 2)) {
      this._volPending = undefined;
      if (this._volClearTimer !== undefined) {
        window.clearTimeout(this._volClearTimer);
        this._volClearTimer = undefined;
      }
    }
  }

  /** Czyści cały stan regulacji głośności (zmiana encji, odłączenie). */
  private _volReset(): void {
    this._volGen += 1;
    // Komenda poprzedniego głośnika niech leci sama — nowy wysyła od razu.
    this._volInflight = false;
    this._volStopHold();
    this._volPressing = false;
    if (this._volClearTimer !== undefined) {
      window.clearTimeout(this._volClearTimer);
      this._volClearTimer = undefined;
    }
    this._volQueued = undefined;
    this._volLastSent = undefined;
    this._volPending = undefined;
  }

  /**
   * Bramka renderu. Popup pokoju ma 20–50 kafli i każdy dostaje nowy `hass`
   * przy każdej zmianie stanu w domu — a kafel czyta wyłącznie własną encję
   * (plus członków, gdy jest grupą świateł). Bez bramki 100% kafli
   * renderowało się na zmiany, które nie dotyczyły żadnego z nich, i to
   * seriami dokładnie wtedy, gdy palec ciągnie suwak jasności.
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    // Pusta mapa = gołe requestUpdate() (zegar postępu); każdy inny klucz
    // to realna zmiana właściwości kafla.
    if (changed.size !== 1 || !changed.has('hass')) return true;
    const prev = changed.get('hass') as HomeAssistant | undefined;
    const next = this.hass;
    if (!prev || !next) return true;
    const a = prev.states?.[this.entity];
    const b = next.states?.[this.entity];
    if (this.mode.startsWith('custom:')) {
      // Osadzona karta (Mushroom, Bubble…) sama filtruje, co ją obchodzi —
      // dostaje każdy `hass` bezpośrednio, bez naszego renderu po drodze.
      if (!this._customEl || Boolean(a) !== Boolean(b)) return true;
      (this._customEl as unknown as { hass?: HomeAssistant }).hass = next;
      return false;
    }
    if (a !== b) return true;
    // Krótkofalówka zależy od uprawnień użytkownika.
    if (prev.user !== next.user) return true;
    // Grupa świateł: pasek jasności liczy się ze stanów członków, a te
    // potrafią się zmienić bez zmiany stanu samej grupy.
    const members = groupMemberIds(b);
    if (members) {
      for (const m of members) {
        if (prev.states?.[m] !== next.states?.[m]) return true;
      }
    }
    // Segment WLED: zgaszenie/zapalenie sterownika z zewnątrz (automatyzacja,
    // aplikacja WLED) nie zmienia stanu segmentu w HA, a zmienia to, co kafel
    // pokazuje i co zrobi tapnięcie. Dla grupy — sterowniki jej segmentów.
    if (this.entity.startsWith('light.')) {
      const leaves = members ? expandLightIds(next, [this.entity]) : [this.entity];
      for (const leaf of leaves) {
        const c = lightControllerOf(next, leaf);
        if (c && prev.states?.[c] !== next.states?.[c]) return true;
      }
    }
    return false;
  }

  /**
   * Zegar paska postępu odtwarzacza. Pozycja liczy się z `Date.now()` w
   * renderze i dotąd przesuwała się tylko dlatego, że obce zmiany stanu
   * budziły kafel — z bramką pasek by stanął. Tyka wyłącznie w trybie
   * `player` i tylko podczas odtwarzania.
   */
  private _progressTimer?: number;

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const st = this._state();
    const need =
      this.mode === 'player' &&
      st?.state === 'playing' &&
      typeof st.attributes?.media_duration === 'number';
    if (need && this._progressTimer === undefined) {
      this._progressTimer = window.setInterval(() => {
        if (!document.hidden) this.requestUpdate();
      }, 1000);
    } else if (!need && this._progressTimer !== undefined) {
      window.clearInterval(this._progressTimer);
      this._progressTimer = undefined;
    }
  }

  public disconnectedCallback(): void {
    this._unsubPower?.();
    this._unsubPower = undefined;
    if (this._progressTimer !== undefined) {
      window.clearInterval(this._progressTimer);
      this._progressTimer = undefined;
    }
    if (this._dragRaf !== undefined) {
      cancelAnimationFrame(this._dragRaf);
      this._dragRaf = undefined;
    }
    // Seria strzałek przerwana odłączeniem — zatwierdzamy ją. Każde
    // naciśnięcie to skończona decyzja (klawisz puszczony), nie palec wciąż
    // na ekranie. Zwykle i tak już jest zatwierdzona: Chromium przy
    // usuwaniu sfokusowanego kafla wysyła najpierw blur, a @blur woła
    // _commitKeyDim (zmierzone: turn_on ~10 ms po remove()). To wywołanie
    // tutaj obejmuje przeglądarki, które przy odłączeniu blur nie wysyłają
    // — bez niego wynik zależałby od silnika. Komenda końcowa czekająca na
    // falę w locie wychodzi w dispose() niżej (flush).
    this._commitKeyDim();
    this._clearHold();
    this._swipe?.dispose();
    this._swipe = undefined;
    this._drag = undefined;
    this._dragging = false;
    this._dragPct = undefined;
    // Pełny reset regulacji głośności — przytrzymanie przerwane odłączeniem
    // nie może zostawić zawieszonej wartości po ponownym podpięciu kafla.
    this._volReset();
    // Krótkofalówka: zwolnij mikrofon, gdy kafel wypada z DOM.
    this._recReset();
    super.disconnectedCallback();
  }

  private _volStep(dir: 1 | -1): void {
    const st = this.entity ? this.hass?.states?.[this.entity] : undefined;
    if (
      volumeMode(playerCaps(st?.attributes?.supported_features), st?.attributes?.volume_level) ===
      'step'
    ) {
      this._volStepSend(dir);
      return;
    }
    const cur =
      this._volPending ??
      ((st?.attributes?.volume_level as number | undefined) ?? 0);
    const step = (this.volumeStep ?? 2) / 100;
    // Zaokrąglenie do 0,1% — bez tego sumowanie kroków dawało ogony typu
    // 0.30000000000000004, a porównania „to samo co wysłane" zawodziły.
    const next = Math.round(Math.max(0, Math.min(1, cur + dir * step)) * 1000) / 1000;
    this._volPending = next;
    this._volSend(next);
  }

  /**
   * Przytrzymanie ±: pierwszy krok od razu, powtarzanie po 400 ms —
   * najpierw spokojnie (260 ms), po chwili delikatnie przyspiesza
   * (180 ms, potem 110 ms). Krok stały 2%.
   */
  private _volHoldStart(ev: PointerEvent, dir: 1 | -1): void {
    ev.stopPropagation();
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    this._volStopHold();
    if (this._volClearTimer !== undefined) {
      window.clearTimeout(this._volClearTimer);
      this._volClearTimer = undefined;
    }
    this._volPressing = true;
    this._volTicks = 0;
    this._volStep(dir);
    const tick = (): void => {
      this._volTicks += 1;
      this._volStep(dir);
      const delay = this._volTicks > 10 ? 110 : this._volTicks > 4 ? 180 : 260;
      this._volHoldTimer = window.setTimeout(tick, delay);
    };
    this._volHoldTimer = window.setTimeout(tick, 400);
  }

  private _volHoldEnd = (ev?: Event): void => {
    ev?.stopPropagation();
    this._volStopHold();
    // Na dotyku przychodzą po sobie pointerup, pointerleave i pointercancel —
    // liczy się tylko pierwsze. Dawniej każde planowało własny timer, a
    // osierocony timer zerował wartość optymistyczną w środku kolejnych
    // tapnięć i głośność cofała się o kilka procent.
    if (!this._volPressing) return;
    this._volPressing = false;
    if (this._volClearTimer !== undefined) window.clearTimeout(this._volClearTimer);
    // Wartość trzymamy, aż HA ją potwierdzi (willUpdate / _volMaybeRelease);
    // bezpiecznik na wypadek urządzenia, które nie raportuje głośności.
    this._volClearTimer = window.setTimeout(() => {
      this._volClearTimer = undefined;
      this._volPending = undefined;
    }, 4000);
    this._volMaybeRelease();
  };

  private _volStopHold(): void {
    if (this._volHoldTimer !== undefined) {
      window.clearTimeout(this._volHoldTimer);
      this._volHoldTimer = undefined;
    }
  }

  /** Stan aktywnego gestu swipe (rail/tint). */
  private _drag?: {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    width: number;
    sliding: boolean;
    /** Pozycja suwaka 0..100, przyrostowo. */
    t: number;
  };

  /**
   * Chwila zakończenia swipe — tłumi click, który mysz generuje tuż po
   * puszczeniu. Flaga zdejmowana dopiero następnym clickiem połykała na
   * dotyku kolejne, prawdziwe dotknięcie (po swipe click nie powstaje).
   */
  private _dragEndedAt = -1e9;

  private _clickSuppressed(): boolean {
    return performance.now() - this._dragEndedAt < 350;
  }

  /**
   * Stan encji do pokazania — z uwzględnieniem stanu „w toku" po tapnięciu
   * (power-pending.ts). Obiekt podmieniony trzymamy w pamięci podręcznej,
   * żeby kolejne rendery dostawały tę samą tożsamość.
   */
  private _state(): HassEntity | undefined {
    const raw = this.hass?.states?.[this.entity];
    if (!raw) return raw;
    // Stan „w toku" — własny albo (dla grupy) wyliczony z członków w toku.
    const want = pendingWant(this.hass, this.entity) ?? effectiveState(this.hass, this.entity);
    if (!want || raw.state === want) return raw;
    let byWant = patchedStates.get(raw);
    if (!byWant) {
      byWant = new Map();
      patchedStates.set(raw, byWant);
    }
    let patched = byWant.get(want);
    if (!patched) {
      patched = { ...raw, state: want };
      byWant.set(want, patched);
    }
    return patched;
  }

  private _unsubPower?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    // Ponowne podpięcie (pamięć widoku HA, powrót karty pokoju): rodzic
    // przerysowuje się z tym samym `hass`, więc kafel sam by nie ruszył,
    // a disconnectedCallback zatrzymał zegar postępu — pasek grającego
    // playera stałby do następnej zmiany stanu encji. Puste requestUpdate()
    // przechodzi przez shouldUpdate, a updated() wznawia zegar.
    if (this.hasUpdated) this.requestUpdate();
    // Przerysuj od razu po tapnięciu (własnym albo głównego włącznika) —
    // ale tylko kafel, którego encji / członków grupy to dotyczy.
    this._unsubPower = subscribePower((ids) => {
      if (touches(this.hass, this.entity, ids)) this.requestUpdate();
    });
  }

  private _callService(
    ev: Event,
    domain: string,
    service: string,
    data: Record<string, unknown> = {},
  ): void {
    ev.stopPropagation();
    ev.preventDefault();
    // Przełączniki: jawne włącz/wyłącz ze stanu, który widać (także „w
    // toku"), zamiast `toggle` — drugi tap w trakcie nie odwraca akcji.
    if (service === 'toggle' && Object.keys(data).length === 0) {
      if (tapPower(this.hass, this.entity)) return;
    }
    void this.hass?.callService(domain, service, {
      entity_id: this.entity,
      ...data,
    });
  }

  /**
   * Tap w kafel media_playera: play albo pauza — ta sama reguła co ⏯
   * w playerze (playPauseService). Urządzenie, które danej akcji nie
   * obsłuży (TV na HDMI, pauza bez bitu PAUSE), dostaje more-info zamiast
   * usługi kończącej się toastem „akcja nieobsługiwana" — kafel nie jest
   * martwy, a z more-info widać, co urządzenie umie.
   */
  private _mediaToggle(ev: Event): void {
    const st = this._state();
    const svc = playPauseService(st?.state, playerCaps(st?.attributes?.supported_features));
    if (svc) this._callService(ev, 'media_player', svc);
    else this._openMoreInfo(ev);
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

    // Encja niedostępna — jednolity przygaszony kafel z plakietką offline
    // zamiast martwych kontrolek. Klik = more-info (diagnoza).
    if (state.state === 'unavailable' && !this.mode.startsWith('custom:')) {
      return this._renderUnavailable(state);
    }

    // Custom card mode — dowolna karta HACS jako tile.
    if (this.mode.startsWith('custom:')) return this._renderCustomCardMode();

    // Modes universal dla większości domen.
    if (this.mode === 'chips') return this._renderChipsMode(state, domain);
    if (this.mode === 'bubble') return this._renderBubbleMode(state, domain);
    if (this.mode === 'icon') return this._renderIconMode(state, domain);
    if (this.mode === 'ambient' && domain === 'light') {
      return this._renderAmbientLight(state);
    }
    if ((this.mode === 'rail' || this.mode === 'tint') && domain === 'light') {
      return this._renderGroupLight(state, this.mode);
    }
    if (this.mode === 'player' && domain === 'media_player') {
      return this._renderPlayer(state);
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
    const icon = this._icon(
      (state.attributes?.icon as string | undefined) ?? iconMap[domain] ?? 'mdi:help',
    );
    const defaultClick = readonly
      ? (ev: Event) => this._openMoreInfo(ev)
      : domain === 'scene'
      ? (ev: Event) => this._callService(ev, 'scene', 'turn_on')
      : domain === 'cover'
      ? (ev: Event) =>
          this._callService(ev, 'cover', on ? 'close_cover' : 'open_cover')
      : domain === 'media_player'
      ? (ev: Event) => this._mediaToggle(ev)
      : (ev: Event) => this._callService(ev, domain, 'toggle');
    // Override z listy popupu wygrywa także nad readonly more-info —
    // _customTap zwraca false, gdy override'u nie ma.
    const click = (ev: Event): void => {
      if (!this._customTap(ev)) defaultClick(ev);
    };

    return html`
      <button
        class="chips-tile ${on ? 'on' : 'off'} ${readonly ? 'readonly' : ''}"
        part="tile"
        @click=${click}
        @contextmenu=${this._openMoreInfo}
        title=${this._displayName(state)}
      >
        <ha-icon class="chips-icon" .icon=${icon}></ha-icon>
        <span class="chips-name">${this._displayName(state)}</span>
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
    const fallback = this._defaultActionForDomain(domain, on);
    // Override akcji z listy popupu najpierw — bez niego domyślna akcja domeny.
    return (ev: Event) => {
      if (!this._customTap(ev)) fallback(ev);
    };
  }

  private _defaultActionForDomain(domain: string, on: boolean): (ev: Event) => void {
    const readonly = domain === 'binary_sensor' || domain === 'climate';
    if (readonly) return (ev: Event) => this._openMoreInfo(ev);
    if (domain === 'scene') return (ev: Event) => this._callService(ev, 'scene', 'turn_on');
    if (domain === 'cover')
      return (ev: Event) => this._callService(ev, 'cover', on ? 'close_cover' : 'open_cover');
    if (domain === 'media_player') return (ev: Event) => this._mediaToggle(ev);
    return (ev: Event) => this._callService(ev, domain, 'toggle');
  }

  private _isActive(state: HassEntity): boolean {
    return state.state === 'on' || state.state === 'open' || state.state === 'playing';
  }

  private _customEl?: HTMLElement;
  private _customKey?: string;

  private _renderCustomCardMode(): TemplateResult {
    const base = buildDefaultCustomConfig(this.mode, this.entity);
    // Override'y pozycji listy (nazwa/ikona/akcja) też trafiają do karty
    // custom:* — kolejność warstw opisana przy mergeCustomTileConfig.
    const config = mergeCustomTileConfig(
      this.cardTemplate,
      { name: this.nameOverride, icon: this.iconOverride, tap_action: this.tapAction },
      base,
    );
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
    const icon = this._icon(this._iconForDomain(state, domain, on));
    const click = this._actionForDomain(domain, on);
    return html`
      <button
        class="bubble-tile ${on ? 'on' : 'off'}"
        part="tile"
        @click=${click}
        @contextmenu=${this._openMoreInfo}
        title=${this._displayName(state)}
      >
        <span class="bubble-circle">
          <ha-icon .icon=${icon}></ha-icon>
        </span>
        <span class="bubble-name">${this._displayName(state)}</span>
      </button>
    `;
  }

  private _renderIconMode(state: HassEntity, domain: string): TemplateResult {
    const on = this._isActive(state);
    const icon = this._icon(this._iconForDomain(state, domain, on));
    const click = this._actionForDomain(domain, on);
    return html`
      <button
        class="icon-tile ${on ? 'on' : 'off'}"
        part="tile"
        @click=${click}
        @contextmenu=${this._openMoreInfo}
        title=${this._displayName(state)}
      >
        <ha-icon .icon=${icon}></ha-icon>
      </button>
    `;
  }

  private _renderAmbientLight(state: HassEntity): TemplateResult {
    const on = state.state === 'on';
    const pct = this._sliderPct(state);
    const lightColor = lightColorOf(state);
    const color = ambientColor(lightColor);
    // Gradient składa CSS (`.ambient-tile.on`) z dwóch zmiennych — patrz
    // tile-ambient.ts, dlaczego nie doklejamy alfy do koloru.
    const bgStyle = ambientStyle(on, lightColor, pct);
    const s = this._s;
    return html`
      <div class="ambient-tile ${on ? 'on' : 'off'}" part="tile" style=${bgStyle}>
        <button
          class="ambient-icon"
          @click=${(ev: Event) =>
            this._customTap(ev) || this._callService(ev, 'light', 'toggle')}
          @contextmenu=${this._openMoreInfo}
          title=${on ? s.player.power_off : s.player.power_on}
          aria-label=${`${this._displayName(state)}: ${on ? s.player.power_off : s.player.power_on}`}
        >
          <ha-icon
            aria-hidden="true"
            .icon=${this._icon(on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline')}
            style="color:${color};"
          ></ha-icon>
        </button>
        <div class="ambient-info">
          <span class="ambient-name">${this._displayName(state)}</span>
          <span class="ambient-state">${on ? `${pct}%` : s.off}</span>
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

  /**
   * Kafel grupy świateł (mode `rail` / `tint`) — wzorowany na dashboardzie
   * bubble-card: rail = pionowy pasek jasności z lewej + ikona w ciemnym kółku,
   * tint = tło kafla podbarwione kolorem światła + pasek jasności na dole.
   * Tap = toggle, swipe poziomy = jasność (live), contextmenu/long-press =
   * more-info (dla grup HA pokazuje tam listę encji-składowych).
   */
  private _renderGroupLight(state: HassEntity, variant: 'rail' | 'tint'): TemplateResult {
    const on = state.state === 'on';
    // `_dragPct` to także wartość trzymana po puszczeniu palca.
    const overridden = typeof this._dragPct === 'number';
    // Poziom = średnia świecących członków (dla zwykłej żarówki — jej
    // własna jasność). Ten sam zbiór, który skaluje swipe, więc pasek nie
    // odskakuje po puszczeniu.
    const statePct = on ? Math.round(this._lightRestPct()) : 0;
    const pct = overridden ? Math.round(this._dragPct!) : statePct;
    const color = on ? lightColorOf(state) : undefined;
    const isGroup = groupMemberIds(state) !== undefined;
    const icon = this._icon(
      (state.attributes?.icon as string | undefined) ??
      (isGroup
        ? on
          ? 'mdi:lightbulb-group'
          : 'mdi:lightbulb-group-off-outline'
        : on
        ? 'mdi:lightbulb-on'
        : 'mdi:lightbulb-outline'),
    );

    const style = [
      color ? `--stratum-glight-accent:${color};` : '',
      `--stratum-glight-pct:${pct}%;`,
      // Ta sama wartość jako liczba 0–1 — clip-path napisu poza paskiem
      // liczy z niej krawędź w układzie nagłówka (patrz .glight-head-base).
      `--stratum-glight-t:${pct / 100};`,
    ].join('');
    // Napis NA pasku dostaje atrament z luminancji koloru światła (ten sam
    // wybór co paski belki piętra). Bez koloru (żarówka bez rgb) pasek
    // bierze żółty --stratum-lights, czyli jasny — ciemny atrament.
    const ink = stripeInk(color);
    const name = this._displayName(state);
    const stateLine = on || overridden ? `${pct}%` : 'wyłączono';

    return html`
      <div
        class="glight ${variant} ${on ? 'on' : 'off'} ${this._dragging
          ? 'dragging'
          : ''} ${overridden ? 'held' : ''} ink-${ink}"
        part="tile"
        style=${style}
        role="button"
        tabindex="0"
        title=${name}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        @click=${this._onGroupClick}
        @keydown=${this._onGroupKey}
        @blur=${this._commitKeyDim}
        @contextmenu=${this._openMoreInfo}
        @pointerdown=${this._onGroupPointerDown}
        @pointermove=${this._onGroupPointerMove}
        @pointerup=${this._onGroupPointerUp}
        @pointercancel=${this._onGroupPointerCancel}
        @lostpointercapture=${this._onGroupLostCapture}
      >
        ${variant === 'rail'
          ? html`<span class="glight-fill" aria-hidden="true"></span>
              <!-- Druga warstwa napisu, przycięta do szerokości paska: na
                   pasku tekst zmienia atrament dokładnie na jego krawędzi
                   (technika z Bubble Card). Jeden kolor tekstu naraz na
                   żółtym pasku i na ciemnej powierzchni dawał 1,6–1,8:1. -->
              <span class="glight-ink" aria-hidden="true">
                <span class="glight-head">
                  <span class="glight-name">${name}</span>
                  <span class="glight-state">${stateLine}</span>
                </span>
              </span>`
          : nothing}
        <span class="glight-head glight-head-base">
          <span class="glight-name">${name}</span>
          <span class="glight-state">${stateLine}</span>
        </span>
        <span class="glight-row">
          <span
            class="glight-bubble"
            title="Szczegóły encji"
            @click=${this._onIconMoreInfo}
            ><ha-icon .icon=${icon}></ha-icon
          ></span>
        </span>
        ${variant === 'tint'
          ? html`<span class="glight-bar" aria-hidden="true"></span>`
          : nothing}
      </div>
    `;
  }

  private _onGroupClick = (ev: Event): void => {
    if (this._clickSuppressed()) return;
    // Klik bez pointerdown (czytnik ekranu, el.click()) też kończy serię
    // strzałek, zanim przełączy — kolejność komend w HA = kolejność gestów.
    this._commitKeyDim();
    if (this._customTap(ev)) return;
    // Przełączenie ma ostatnie słowo — jak w _onGroupKey. Trzymana wartość
    // (seria strzałek zatwierdzona przez pointerdown albo linijkę wyżej,
    // świeży gest palcem) nie może wisieć na pasku do 6 s nad światłem,
    // które tap właśnie zgasił: willUpdate zdejmuje ją tylko, gdy HA
    // potwierdzi poziom w okolicy trzymanej wartości, a zgaszone = 0.
    this._dropHeldLevel();
    this._callService(ev, 'light', 'toggle');
  };

  /** Pasek wraca do stanu z HA — porzuca trzymaną wartość końca gestu. */
  private _dropHeldLevel(): void {
    this._clearHold();
    this._dragPct = undefined;
  }

  /** Klik w ikonę kafla = domyślna akcja encji HA (dialog more-info). */
  private _onIconMoreInfo = (ev: Event): void => {
    ev.stopPropagation();
    if (this._clickSuppressed()) return;
    this._openMoreInfo(ev);
  };

  /**
   * Enter/Spacja na ikonie wiersza rolety (role="button"). Wiersz rolety
   * (i kafel playera, patrz .player-tag) to <div @click> z przyciskami
   * w środku — sam div nie może być przyciskiem (zagnieżdżone kontrolki),
   * więc dla klawiatury wejściem do szczegółów jest mniejszy element.
   * Bez niego more-info było z klawiatury nieosiągalne.
   */
  private _onMoreInfoKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat) return;
    this._openMoreInfo(ev);
  };

  private _onGroupKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      // Seria strzałek w toku — zatwierdzamy ją PRZED przełączeniem, jak
      // przy pointerdown. Bez tego timer serii odpalał turn_on z jasnością
      // ~450 ms po Enterze i cofał świeże „wyłącz" użytkownika.
      this._commitKeyDim();
      // Klawiatura = to samo co tap: override akcji z listy najpierw.
      if (this._customTap(ev)) return;
      // Przełączenie ma ostatnie słowo — trzymana wartość serii (np. 40%)
      // nie może wisieć na pasku do 6 s nad zgaszonym światłem. Tak samo
      // jak w _onGroupClick: bez względu na to, kto ją ustawił.
      this._dropHeldLevel();
      if (!tapPower(this.hass, this.entity)) {
        void this.hass?.callService('light', 'toggle', { entity_id: this.entity });
      }
      return;
    }
    this._keyDim(ev);
  };

  /**
   * Strzałki ←/→ = jasność. Seria naciśnięć to jeden gest LightSwipe
   * (start → move → end po GLIGHT_KEY_COMMIT_MS ciszy albo przy utracie
   * fokusu), dokładnie jak przeciągnięcie palcem: te same proporcje członków
   * grupy, te same progi zapalania z ciemności i gaszenia przy 0. Dawniej
   * jasności nie dało się zmienić z klawiatury wcale.
   */
  private _keyDimState?: { t: number; timer: number };

  private _keyDim(ev: KeyboardEvent): void {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    // Palec właśnie ciągnie — klawiatura nie wchodzi mu w gest.
    if (this._drag?.sliding) return;
    if (glightKeyLevel(0, ev.key) === undefined) return;
    const prev = this._keyDimState;
    let base = prev?.t;
    if (base === undefined) {
      const start = this._swipeCtl().start([this.entity], 'all');
      if (!start.active) return;
      base = start.level;
    }
    const next = glightKeyLevel(base, ev.key)!;
    ev.preventDefault();
    ev.stopPropagation();
    if (prev) window.clearTimeout(prev.timer);
    this._clearHold();
    this._swipeCtl().move(next);
    this._dragPct = next;
    this._keyDimState = {
      t: next,
      timer: window.setTimeout(this._commitKeyDim, GLIGHT_KEY_COMMIT_MS),
    };
  }

  private _commitKeyDim = (): void => {
    const k = this._keyDimState;
    if (!k) return;
    window.clearTimeout(k.timer);
    this._keyDimState = undefined;
    this._holdResult(this._swipeCtl().end(k.t));
  };

  /**
   * Wynik końca gestu (palec albo strzałki): trzymamy wartość docelową, aż
   * HA ją potwierdzi (`willUpdate`), z bezpiecznikiem 6 s. Sztywne 1,5 s
   * było za krótkie dla grup Zigbee.
   */
  private _holdResult(result: { outcome: string; level: number }): void {
    this._clearHold();
    if (result.outcome === 'noop') {
      // Nic nie poszło do HA — pasek wraca do stanu faktycznego.
      this._dragPct = undefined;
      return;
    }
    this._dragPct = result.level;
    this._hold = {
      pct: result.level,
      timer: window.setTimeout(() => {
        this._hold = undefined;
        this._dragPct = undefined;
      }, 6000),
    };
  }

  private _onGroupPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0 || ev.isPrimary === false) return;
    // Seria strzałek w toku — zatwierdzamy ją, zanim palec zacznie nowy gest
    // na tym samym kontrolerze (start() porzuciłby ją bez komendy końcowej).
    this._commitKeyDim();
    this._dragEndedAt = -1e9;
    this._drag = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      lastX: ev.clientX,
      width: 1,
      sliding: false,
      t: 0,
    };
  };

  /** Jedno przepisanie wartości do stanu Lita na klatkę, nie na zdarzenie. */
  private _scheduleDragRender(): void {
    if (this._dragRaf !== undefined) return;
    this._dragRaf = requestAnimationFrame(() => {
      this._dragRaf = undefined;
      const d = this._drag;
      if (!d?.sliding) return;
      this._dragPct = d.t;
      this._swipeCtl().move(d.t);
    });
  }

  private _onGroupPointerMove = (ev: PointerEvent): void => {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    if (ev.pointerType === 'mouse' && ev.buttons === 0) {
      // Przycisk puszczony poza zasięgiem pointerup — anuluj, nie zatwierdzaj.
      this._abandonGroupDrag(d);
      return;
    }
    if (!d.sliding) {
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      // Pionowy ruch = scroll listy — oddajemy przeglądarce i ubijamy
      // gest, żeby ukośne przewijanie NIE zmieniało jasności świateł.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        this._drag = undefined;
        return;
      }
      // Swipe jasności startuje dopiero przy zdecydowanie poziomym ruchu.
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const el = ev.currentTarget as HTMLElement;
      // Kontroler zamraża zestaw ŚWIECĄCYCH członków grupy i podaje poziom,
      // od którego liczy proporcje. Komendy idą do członków, nigdy do samej
      // grupy — `turn_on` na grupie zapalało wszystkich na jednym poziomie.
      // Kafel dotknięty przy zgaszonej grupie zapala jej światła (to jawna
      // intencja), ale dopiero po puszczeniu i po przekroczeniu progu.
      const start = this._swipeCtl().start([this.entity], 'all');
      if (!start.active) {
        this._drag = undefined;
        this._dragEndedAt = performance.now();
        return;
      }
      d.sliding = true;
      d.width = Math.max(1, el.getBoundingClientRect().width);
      d.t = start.level;
      d.lastX = ev.clientX;
      el.setPointerCapture(ev.pointerId);
      this._clearHold();
      this._dragging = true;
      this._dragPct = d.t;
    }
    // Przyrostowo, z przycięciem na każdym kroku: po wyjechaniu poza koniec
    // zakresu powrót reaguje od pierwszego piksela.
    d.t = Math.max(0, Math.min(100, d.t + ((ev.clientX - d.lastX) / d.width) * 100));
    d.lastX = ev.clientX;
    this._scheduleDragRender();
  };

  private _onGroupPointerUp = (ev: PointerEvent): void => {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this._drag = undefined;
    if (!d.sliding) return;
    ev.stopPropagation();
    this._dragEndedAt = performance.now();
    this._dragging = false;
    this._holdResult(this._swipeCtl().end(d.t));
  };

  /** Gest przerwany przez system — to nie zatwierdzenie (patrz wiersz pokoju). */
  private _onGroupPointerCancel = (ev: PointerEvent): void => {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this._abandonGroupDrag(d);
  };

  /**
   * Tylko utrata przechwycenia przez SAM kafel. Utrata przez dziecko (palec
   * niejawnie przechwycony przez nazwę albo ikonę, potem przepięty na kafel)
   * bąbelkuje tutaj i nie może przerywać gestu — patrz wiersz pokoju.
   */
  private _onGroupLostCapture = (ev: PointerEvent): void => {
    if (ev.target !== ev.currentTarget) return;
    this._onGroupPointerCancel(ev);
  };

  private _abandonGroupDrag(d: NonNullable<StratumRoomTile['_drag']>): void {
    this._drag = undefined;
    if (!d.sliding) return;
    this._dragEndedAt = performance.now();
    if (this._dragRaf !== undefined) {
      cancelAnimationFrame(this._dragRaf);
      this._dragRaf = undefined;
    }
    this._dragging = false;
    this._swipeCtl().cancel();
    this._clearHold();
    this._dragPct = undefined;
  }

  private _renderLightSlider(state: HassEntity): TemplateResult {
    const on = state.state === 'on';
    const pct = this._sliderPct(state);
    const icon = this._icon(on ? 'mdi:lightbulb-on' : 'mdi:lightbulb');
    return html`
      <div class="tile slider ${on ? 'on' : 'off'}" part="tile">
        <button
          class="inline-toggle"
          @click=${(ev: Event) =>
            this._customTap(ev) || this._callService(ev, 'light', 'toggle')}
          @contextmenu=${this._openMoreInfo}
          title=${on ? 'Wyłącz' : 'Włącz'}
        >
          <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        </button>
        <div class="slider-body">
          <span class="tile-name">${this._displayName(state)}</span>
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
        <span class="tile-state">${on ? `${pct}%` : this._s.off}</span>
      </div>
    `;
  }

  /**
   * Grupa świateł HA (pomocnik z atrybutem `entity_id`) — tylko dla niej
   * suwak skaluje członków. Sterownik WLED (`group_entities`) ma własną
   * jasność mnożoną przez segmenty: sterujemy nim bezpośrednio, jak dotąd.
   */
  private _isHaLightGroup(state: HassEntity | undefined): boolean {
    return Array.isArray(state?.attributes?.entity_id);
  }

  /** Pozycja suwaka: dla grupy HA średnia świecących członków (baza skalowania). */
  private _sliderPct(state: HassEntity): number {
    if (state.state !== 'on') return 0;
    if (this._isHaLightGroup(state)) return Math.round(this._lightRestPct());
    const bright = (state.attributes?.brightness as number | undefined) ?? 0;
    return Math.round((bright / 255) * 100);
  }

  private _onBrightnessChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const pct = Number(input.value);
    // Grupa świateł HA: `turn_on` z jasnością na grupie zapala WSZYSTKICH
    // członków na jednym poziomie (także celowo zgaszonych). Świecącą grupę
    // skalujemy więc przez kontroler gestu (tylko świecący członkowie,
    // proporcjonalnie). Suwak to decyzja dyskretna, nie gest — progi
    // uzbrojenia i „poniżej 2% gaś" z przeciągania tu nie obowiązują.
    const state = this._state();
    if (this.hass && this._isHaLightGroup(state) && state?.state === 'on' && pct > 0) {
      const swipe = this._swipeCtl();
      const started = swipe.start([this.entity], 'none');
      const res = started.active ? swipe.end(Math.max(3, pct)) : undefined;
      if (!res || res.outcome === 'noop') {
        // Nic nie poszło (np. świecą same przekaźniki) — kciuk wraca na
        // pozycję faktyczną; Lit nie przepisze niezmienionego `.value` sam.
        input.value = String(this._sliderPct(state));
      }
      return;
    }
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

  /**
   * Pozycja zadana suwakiem rolety, trzymana do dojechania. Roleta raportuje
   * pozycję w trakcie jazdy (4%, 9%, 15%…), a suwak był związany z bieżącą
   * pozycją — kciuk skakał z 70% na 4% i pełzł przez 20–60 s, więc wyglądało
   * to jak nieprzyjęte polecenie i użytkownik przeciągał drugi raz.
   */
  @state() private _coverTarget?: { pos: number; at: number; sent: boolean };

  /**
   * Koniec przeciągania bez zatwierdzenia (palec wrócił na start — wtedy
   * `change` nie przychodzi — albo gest przerwany). Niewysłany cel znika po
   * ewentualnym `change`, inaczej suwak zamarzałby na stałe.
   */
  private _endCoverDrag = (): void => {
    const t = this._coverTarget;
    if (!t || t.sent) return;
    window.setTimeout(() => {
      if (this._coverTarget === t) this._coverTarget = undefined;
    }, 0);
  };

  private _coverShownPos(state: HassEntity): number {
    const pos = (state.attributes?.current_position as number | undefined) ?? 0;
    const t = this._coverTarget;
    if (!t) return pos;
    const moving = state.state === 'opening' || state.state === 'closing';
    const age = Date.now() - t.at;
    // Trzymamy cel: w trakcie przeciągania, w trakcie jazdy (maks. 90 s) i
    // przez pierwsze 3 s po wysłaniu, zanim roleta w ogóle ruszy.
    if (!t.sent || (Math.abs(pos - t.pos) > 1 && (moving || age < 3000) && age < 90_000)) {
      return t.pos;
    }
    return pos;
  }

  private _renderCoverSlider(state: HassEntity): TemplateResult {
    const pos = this._coverShownPos(state);
    const isOpen = state.state === 'open' || pos > 0;
    return html`
      <div class="tile slider ${isOpen ? 'on' : 'off'}" part="tile">
        <ha-icon class="tile-icon" .icon=${this._icon(isOpen ? 'mdi:blinds-open' : 'mdi:blinds')}></ha-icon>
        <div class="slider-body">
          <span class="tile-name">${this._displayName(state)}</span>
          <input
            type="range"
            class="range"
            min="0"
            max="100"
            step="1"
            .value=${String(pos)}
            @click=${(ev: Event) => ev.stopPropagation()}
            @input=${(ev: Event) => {
              // W trakcie przeciągania kciuk należy do palca — render z
              // raportem pozycji nie może go przestawić.
              const v = Number((ev.target as HTMLInputElement).value);
              this._coverTarget = { pos: v, at: Date.now(), sent: false };
            }}
            @pointerup=${this._endCoverDrag}
            @pointercancel=${this._endCoverDrag}
            @touchcancel=${this._endCoverDrag}
            @blur=${this._endCoverDrag}
            @change=${(ev: Event) => {
              const v = Number((ev.target as HTMLInputElement).value);
              this._coverTarget = { pos: v, at: Date.now(), sent: true };
              void this.hass?.callService('cover', 'set_cover_position', {
                entity_id: this.entity,
                position: v,
              });
              // Gdy roleta w ogóle nie ruszy, po 3 s wracamy do jej pozycji.
              window.setTimeout(() => this.requestUpdate(), 3100);
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
    const icon = this._icon((state.attributes?.icon as string | undefined) ?? defaultIcon);
    // Lights: użyj aktualnego koloru świecenia jako akcentu gdy ON.
    let accent: string | undefined;
    let brightnessPct: number | undefined;
    if (domain === 'light' && on) {
      accent = lightColorOf(state);
      const b = state.attributes?.brightness as number | undefined;
      if (typeof b === 'number') brightnessPct = Math.round((b / 255) * 100);
    }
    const style = accent ? `--stratum-tile-accent:${accent};` : '';
    const stateText =
      on && typeof brightnessPct === 'number'
        ? `${brightnessPct}%`
        : on
        ? this._s.on
        : this._s.off;
    return html`
      <button
        class="tile toggle ${on ? 'on' : 'off'} ${domain}"
        part="tile"
        style=${style}
        @click=${(ev: Event) => this._customTap(ev) || this._callService(ev, domain, 'toggle')}
        @contextmenu=${this._openMoreInfo}
      >
        <span class="tile-icon-wrap" title="Szczegóły encji" @click=${this._onIconMoreInfo}>
          <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        </span>
        <span class="tile-name">${this._displayName(state)}</span>
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
    const icon = this._icon(isOpen ? 'mdi:blinds-open' : 'mdi:blinds');
    return html`
      <div
        class="cover-row ${isOpen ? 'on' : 'off'}"
        part="tile"
        @click=${(ev: Event) => this._customTap(ev) || this._openMoreInfo(ev)}
      >
        <span
          class="tile-icon-wrap"
          role="button"
          tabindex="0"
          title="Szczegóły encji"
          aria-label=${`Szczegóły encji: ${this._displayName(state)}`}
          @click=${this._onIconMoreInfo}
          @keydown=${this._onMoreInfoKey}
        >
          <ha-icon class="tile-icon" aria-hidden="true" .icon=${icon}></ha-icon>
        </span>
        <span class="cover-body">
          <span class="tile-name">${this._displayName(state)}</span>
          <span class="cover-state">
            ${posNum !== undefined ? `${posNum}%` : isOpen ? this._s.open : this._s.closed}
          </span>
        </span>
        <span class="cover-ctrl">
          <button
            class="cover-btn"
            title="Otwórz"
            @click=${(ev: Event) => this._callService(ev, 'cover', 'open_cover')}
          >
            <ha-icon .icon=${'mdi:arrow-up'}></ha-icon>
          </button>
          <button
            class="cover-btn"
            title="Stop"
            @click=${(ev: Event) => this._callService(ev, 'cover', 'stop_cover')}
          >
            <ha-icon .icon=${'mdi:square'}></ha-icon>
          </button>
          <button
            class="cover-btn"
            title="Zamknij"
            @click=${(ev: Event) => this._callService(ev, 'cover', 'close_cover')}
          >
            <ha-icon .icon=${'mdi:arrow-down'}></ha-icon>
          </button>
        </span>
      </div>
    `;
  }

  private _renderBinary(state: HassEntity): TemplateResult {
    const on = state.state === 'on';
    const dc = state.attributes?.device_class as string | undefined;
    // `unknown` (czujnik po restarcie HA jeszcze nic nie zgłosił) nie
    // dostaje zamkniętego okna ani ikony „ok" (check-circle) — ikona nie może
    // obiecywać „wszystko w porządku", gdy stanu nie znamy (jak tekst
    // w binaryStateText).
    const known = on || state.state === 'off';
    const icon = this._icon(
      !known
        ? 'mdi:help-circle-outline'
        : dc === 'window'
        ? (on ? 'mdi:window-open-variant' : 'mdi:window-closed-variant')
        : dc === 'door'
        ? (on ? 'mdi:door-open' : 'mdi:door-closed')
        : on ? 'mdi:alert' : 'mdi:check-circle',
    );
    return html`
      <button
        class="tile binary ${on ? 'on' : 'off'}"
        part="tile"
        @click=${(ev: Event) => this._customTap(ev) || this._openMoreInfo(ev)}
      >
        <ha-icon class="tile-icon" .icon=${icon}></ha-icon>
        <span class="tile-name">${this._displayName(state)}</span>
        <span class="tile-state">${binaryStateText(this.hass, state)}</span>
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
        @click=${(ev: Event) => this._customTap(ev) || this._openMoreInfo(ev)}
      >
        <ha-icon class="tile-icon" .icon=${this._icon('mdi:thermostat')}></ha-icon>
        <span class="tile-name">${this._displayName(state)}</span>
        <span class="tile-state">
          ${typeof current === 'number' ? `${current}°` : '?°'}
          ${typeof setpoint === 'number' ? html`→ ${setpoint}°` : nothing}
        </span>
      </button>
    `;
  }

  /**
   * Duży player z okładką (mode `player`) — jeden porządny odtwarzacz
   * zamiast listy wierszy. Okładka (entity_picture) jako tło z gradientem,
   * tytuł/artysta, pasek postępu, prev/play-pause/next + głośność.
   * Klik w okładkę = more-info.
   */
  private _renderPlayer(state: HassEntity): TemplateResult {
    const playing = state.state === 'playing';
    const active = playing || state.state === 'paused' || state.state === 'buffering';
    const title = state.attributes?.media_title as string | undefined;
    const artist =
      (state.attributes?.media_artist as string | undefined) ??
      (state.attributes?.media_album_name as string | undefined) ??
      (state.attributes?.app_name as string | undefined);
    const picture = state.attributes?.entity_picture as string | undefined;

    // Postęp: media_position jest „zamrożone" w chwili updated_at — przy
    // odtwarzaniu doliczamy czas od tamtej chwili. Odświeża się przy każdej
    // zmianie stanu z hass (bez lokalnego tickera).
    const duration = state.attributes?.media_duration as number | undefined;
    let pct = 0;
    if (active && typeof duration === 'number' && duration > 0) {
      let pos = (state.attributes?.media_position as number | undefined) ?? 0;
      const updatedAt = state.attributes?.media_position_updated_at as
        | string
        | undefined;
      if (playing && updatedAt) {
        pos += (Date.now() - new Date(updatedAt).getTime()) / 1000;
      }
      pct = Math.max(0, Math.min(100, (pos / duration) * 100));
    }

    const volume = state.attributes?.volume_level as number | undefined;
    const s = this._s;
    const stateText = mediaStateText(state.state, s);

    // Co urządzenie umie — bity supported_features (media-features.ts).
    const caps = playerCaps(state.attributes?.supported_features);
    // ⏯ wysyła media_play / media_pause zależnie od stanu (media-features.ts).
    const playSvc = playPauseService(state.state, caps);
    const canSeek = caps.seek && typeof duration === 'number' && duration > 0;
    const canMute = caps.mute;
    const muted = state.attributes?.is_volume_muted === true;
    const isOff = state.state === 'off' || state.state === 'standby';
    const canPower = isOff ? caps.turnOn : caps.turnOff;
    // Głośność tylko u włączonego urządzenia, które ją zna (poziom albo
    // krok). Wyłączony TV często dalej deklaruje bity głośności, ale
    // komenda do niego kończy się błędem.
    const volMode = isOff ? 'none' : volumeMode(caps, volume);
    const showMute = canMute && volMode !== 'none';
    // Krótkofalówka leci przez play_media — bez tego bitu nagranie by
    // przepadło z toastem „akcja nieobsługiwana".
    const showMic = this._canIntercom && caps.playMedia;
    const transportTitle = (label: string, ok: boolean): string =>
      ok ? label : `${label} — ${s.player.unsupported}`;
    const micTitle =
      this._rec === 'error'
        ? this._recError ?? s.intercom.idle
        : this._rec === 'recording'
        ? s.intercom.recording
        : this._rec === 'sending'
        ? s.intercom.sending
        : s.intercom.idle;

    // Netflix/Disney+/Prime na TV i Chromecastach zwykle NIE wystawiają
    // okładki ani tytułu — zostaje tylko app_name. Wtedy: brandowany
    // gradient jako tło i nazwa aplikacji jako tytuł (zamiast "playing").
    const app = state.attributes?.app_name as string | undefined;
    const brand = !picture && active ? appBrandGradient(app ?? artist) : undefined;
    const displayTitle = title ?? app ?? stateText;
    const displaySub = title ? artist : app ? stateText : undefined;

    const bg = picture
      ? `background-image: linear-gradient(to top, rgba(8, 9, 12, 0.92) 25%, rgba(8, 9, 12, 0.35)), url('${picture}');`
      : brand
      ? `background-image: linear-gradient(to top, rgba(8, 9, 12, 0.55) 25%, rgba(8, 9, 12, 0.12)), ${brand};`
      : '';

    return html`
      <div
        class="player-tile ${active ? 'on' : 'off'} ${picture || brand
          ? 'has-art'
          : ''}"
        part="tile"
        style=${bg}
        @click=${(ev: Event) => this._customTap(ev) || this._openMoreInfo(ev)}
      >
        <span
          class="player-tag"
          role="button"
          tabindex="0"
          title="Szczegóły encji"
          @keydown=${(ev: KeyboardEvent) => {
            // To samo co klik w kafel: override akcji z listy, potem more-info.
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.repeat) return;
            if (!this._customTap(ev)) this._openMoreInfo(ev);
          }}
          >${this._displayName(state)}</span
        >
        ${canPower
          ? html`<button
              class="player-btn player-power"
              title=${isOff ? s.player.power_on : s.player.power_off}
              aria-label=${isOff ? s.player.power_on : s.player.power_off}
              @click=${(ev: Event) =>
                this._callService(
                  ev,
                  'media_player',
                  isOff ? 'turn_on' : 'turn_off',
                )}
            >
              <ha-icon .icon=${'mdi:power'}></ha-icon>
            </button>`
          : nothing}
        <span class="player-title">${displayTitle}</span>
        ${displaySub && displaySub !== displayTitle
          ? html`<span class="player-artist">${displaySub}</span>`
          : nothing}
        ${active && pct > 0
          ? html`<span
              class="player-progress ${canSeek ? 'seekable' : ''}"
              title=${canSeek ? s.player.seek : ''}
              @click=${(ev: MouseEvent) => {
                if (!canSeek) return;
                ev.stopPropagation();
                const rect = (
                  ev.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const p = Math.max(
                  0,
                  Math.min(1, (ev.clientX - rect.left) / rect.width),
                );
                void this.hass?.callService('media_player', 'media_seek', {
                  entity_id: this.entity,
                  seek_position: p * duration!,
                });
              }}
              ><i style="width:${pct.toFixed(1)}%"></i
            ></span>`
          : nothing}
        <div
          class="player-controls"
          part="player-controls"
          @click=${(ev: Event) => ev.stopPropagation()}
        >
          <!-- Przyciski transportu renderowane zawsze, nieobsługiwane jako
               disabled: Cast i Android TV zmieniają supported_features per
               aplikacja, a znikające przyciski przesuwałyby cały rząd. -->
          <div class="player-transport" part="player-transport">
            <button
              class="player-btn"
              title=${transportTitle(s.player.prev, caps.prev)}
              aria-label=${transportTitle(s.player.prev, caps.prev)}
              ?disabled=${!caps.prev}
              @click=${(ev: Event) =>
                this._callService(ev, 'media_player', 'media_previous_track')}
            >
              <ha-icon aria-hidden="true" .icon=${'mdi:skip-previous'}></ha-icon>
            </button>
            <button
              class="player-btn play"
              title=${transportTitle(playing ? s.player.pause : s.player.play, Boolean(playSvc))}
              aria-label=${transportTitle(
                playing ? s.player.pause : s.player.play,
                Boolean(playSvc),
              )}
              ?disabled=${!playSvc}
              @click=${(ev: Event) => {
                if (playSvc) this._callService(ev, 'media_player', playSvc);
              }}
            >
              <ha-icon aria-hidden="true" .icon=${playing ? 'mdi:pause' : 'mdi:play'}></ha-icon>
            </button>
            <button
              class="player-btn"
              title=${transportTitle(s.player.next, caps.next)}
              aria-label=${transportTitle(s.player.next, caps.next)}
              ?disabled=${!caps.next}
              @click=${(ev: Event) =>
                this._callService(ev, 'media_player', 'media_next_track')}
            >
              <ha-icon aria-hidden="true" .icon=${'mdi:skip-next'}></ha-icon>
            </button>
          </div>
          ${volMode !== 'none' || showMic
            ? html`<div
                class="player-vol-row ${volMode !== 'none' ? 'has-volume' : ''}"
                part="player-volume-row"
              >
                <!-- Wycisz to przełącznik: stała etykieta + aria-pressed niesie
                     stan. Zmienna etykieta razem z aria-pressed czytała się
                     „Wyłącz wyciszenie, wciśnięty" — dwa sprzeczne opisy
                     jednego stanu. Podpis (title) dalej mówi, co zrobi klik. -->
                ${showMute
                  ? html`<button
                      class="player-btn vol-btn mute ${muted ? 'muted' : ''}"
                      title=${muted ? s.player.unmute : s.player.mute}
                      aria-label=${s.player.mute}
                      aria-pressed=${muted ? 'true' : 'false'}
                      @click=${(ev: Event) =>
                        this._callService(ev, 'media_player', 'volume_mute', {
                          is_volume_muted: !muted,
                        })}
                    >
                      <ha-icon
                        aria-hidden="true"
                        .icon=${muted ? 'mdi:volume-off' : 'mdi:volume-high'}
                      ></ha-icon>
                    </button>`
                  : volMode !== 'none'
                  ? html`<ha-icon
                      class="player-vol-icon"
                      aria-hidden="true"
                      .icon=${'mdi:volume-high'}
                    ></ha-icon>`
                  : nothing}
                ${volMode !== 'none'
                  ? html`<button
                      class="player-btn vol-btn"
                      title=${s.player.vol_down}
                      aria-label=${s.player.vol_down}
                      @pointerdown=${(ev: PointerEvent) => this._volHoldStart(ev, -1)}
                      @pointerup=${this._volHoldEnd}
                      @pointercancel=${this._volHoldEnd}
                      @pointerleave=${this._volHoldEnd}
                      @keydown=${(ev: KeyboardEvent) => this._volKey(ev, -1)}
                      @contextmenu=${(ev: Event) => ev.preventDefault()}
                    >
                      <ha-icon aria-hidden="true" .icon=${'mdi:minus'}></ha-icon>
                    </button>`
                  : nothing}
                ${volMode === 'set' ? this._renderVolumeSlider(volume as number, s) : nothing}
                ${volMode !== 'none'
                  ? html`<button
                      class="player-btn vol-btn"
                      title=${s.player.vol_up}
                      aria-label=${s.player.vol_up}
                      @pointerdown=${(ev: PointerEvent) => this._volHoldStart(ev, 1)}
                      @pointerup=${this._volHoldEnd}
                      @pointercancel=${this._volHoldEnd}
                      @pointerleave=${this._volHoldEnd}
                      @keydown=${(ev: KeyboardEvent) => this._volKey(ev, 1)}
                      @contextmenu=${(ev: Event) => ev.preventDefault()}
                    >
                      <ha-icon aria-hidden="true" .icon=${'mdi:plus'}></ha-icon>
                    </button>`
                  : nothing}
                ${showMic ? this._renderMic(micTitle) : nothing}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  /**
   * ± sterowane wyłącznie pointerdown — z klawiatury (Enter/Spacja) nie
   * działały wcale. Jeden krok na naciśnięcie, bez przytrzymania.
   */
  private _volKey(ev: KeyboardEvent, dir: 1 | -1): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat) return;
    this._volStep(dir);
    this._volPressing = false;
    if (this._volClearTimer !== undefined) window.clearTimeout(this._volClearTimer);
    this._volClearTimer = window.setTimeout(() => {
      this._volClearTimer = undefined;
      this._volPending = undefined;
    }, 4000);
  }

  private _renderMic(title: string): TemplateResult {
    const rec = this._rec;
    // blur kończy nagranie: fokus uciekł w trakcie trzymania Enter/Spacji
    // (Tab, okno w tle), więc keyup tu już nie trafi — bez tego nagranie
    // szłoby do bezpiecznika 30 s.
    return html`<button
      class="player-btn vol-btn mic ${rec ?? ''}"
      title=${title}
      aria-label=${title}
      @pointerdown=${(ev: PointerEvent) => this._intercomStart(ev)}
      @pointerup=${this._intercomStop}
      @pointercancel=${this._intercomStop}
      @keydown=${(ev: KeyboardEvent) => this._micKeyDown(ev)}
      @keyup=${this._micKeyUp}
      @blur=${this._intercomStop}
      @contextmenu=${(ev: Event) => ev.preventDefault()}
    >
      <ha-icon
        aria-hidden="true"
        .icon=${rec === 'sending'
          ? 'mdi:send'
          : rec === 'recording'
          ? 'mdi:microphone'
          : rec === 'error'
          ? 'mdi:microphone-off'
          : 'mdi:microphone-outline'}
      ></ha-icon>
    </button>`;
  }

  private _renderVolumeSlider(volume: number, s: TileStrings): TemplateResult {
    return html`<input
      type="range"
      class="player-volume"
      part="player-volume"
      aria-label=${s.player.volume}
      min="0"
      max="100"
      step="1"
      .value=${String(Math.round((this._volPending ?? volume) * 100))}
      @change=${(ev: Event) => {
        // Suwak idzie tą samą kolejką co ± — ostatnia akcja
        // użytkownika wygrywa. Dawniej czekające „+" leciało
        // po suwaku i nadpisywało jego wartość.
        const v = Math.round(Number((ev.target as HTMLInputElement).value)) / 100;
        this._volStopHold();
        this._volPressing = false;
        this._volPending = v;
        if (this._volClearTimer !== undefined) window.clearTimeout(this._volClearTimer);
        this._volClearTimer = window.setTimeout(() => {
          this._volClearTimer = undefined;
          this._volPending = undefined;
        }, 4000);
        this._volSend(v);
        this._volMaybeRelease();
      }}
    />`;
  }

  private _renderUnavailable(state: HassEntity): TemplateResult {
    return html`
      <button class="tile unav" part="tile" @click=${this._openMoreInfo}>
        <span class="unav-icon">
          <ha-icon
            .icon=${this._icon(
              (state.attributes?.icon as string | undefined) ??
                'mdi:help-circle-outline',
            )}
          ></ha-icon>
        </span>
        <span class="tile-name">${this._displayName(state)}</span>
        <span class="off-pill">${this._s.unavailable}</span>
      </button>
    `;
  }

  private _renderMedia(state: HassEntity): TemplateResult {
    const playing = state.state === 'playing';
    return html`
      <button
        class="tile media ${playing ? 'on' : 'off'}"
        part="tile"
        @click=${(ev: Event) => this._customTap(ev) || this._mediaToggle(ev)}
        @contextmenu=${this._openMoreInfo}
      >
        <ha-icon class="tile-icon" .icon=${this._icon(playing ? 'mdi:pause' : 'mdi:play')}></ha-icon>
        <span class="tile-name">${this._displayName(state)}</span>
        <span class="tile-state">${mediaStateText(state.state, this._s)}</span>
      </button>
    `;
  }

  private _renderScene(state: HassEntity): TemplateResult {
    return html`
      <button
        class="tile scene"
        part="tile"
        @click=${(ev: Event) =>
          this._customTap(ev) || this._callService(ev, 'scene', 'turn_on')}
      >
        <ha-icon class="tile-icon" .icon=${this._icon('mdi:palette')}></ha-icon>
        <span class="tile-name">${this._displayName(state)}</span>
        <span class="tile-state">${this._s.activate}</span>
      </button>
    `;
  }

  private _renderGeneric(state: HassEntity): TemplateResult {
    return html`
      <button
        class="tile"
        part="tile"
        @click=${(ev: Event) => this._customTap(ev) || this._openMoreInfo(ev)}
      >
        <ha-icon class="tile-icon" .icon=${this._icon('mdi:tag')}></ha-icon>
        <span class="tile-name">${this._displayName(state)}</span>
        <span class="tile-state">${entityStateText(this.hass, state)}</span>
      </button>
    `;
  }

  static styles = css`
    :host {
      display: block;
      /* Kafel wypełnia rząd siatki, który .tiles z grid-auto-rows: 1fr
         wyrównuje do najwyższego elementu w sekcji. Bez tego host się
         rozciąga, a kafel w środku zostaje na swojej min-height i pod nim
         zostaje dziura. Poza siatką (layout flex, pojedynczy kafel)
         wysokość rodzica jest auto, więc 100% rozwiązuje się do auto. */
      height: 100%;
    }

    /* Warianty kafelkowe rozciągają się; pigułki (.chips-tile, .icon-tile)
       zostają przy swoim rozmiarze, bo żyją w rządkach flex. */
    .tile,
    .cover-row,
    .bubble-tile,
    .ambient-tile,
    .glight,
    .player-tile {
      height: 100%;
      /* border-box jest tu KRYTYCZNY: bez niego 100% + padding sprawia,
         ze kafel jest wyzszy niz host o 2x padding i wylewa sie na
         nastepny wiersz siatki (zmierzone: 24 px nachodzenia). */
      box-sizing: border-box;
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

    /* Tylko kafel-przycisk: .tile.slider i .tile.missing to <div> — suwak
       w środku kafla dostawał scale(0.98) całego kafla przez cały czas
       przeciągania kciuka. */
    button.tile:active:not(:disabled) {
      transform: scale(0.98);
    }

    .tile.toggle.on {
      background: color-mix(
        in srgb,
        var(--stratum-tile-accent, var(--stratum-lights)) 12%,
        var(--stratum-tile-background)
      );
      border-color: color-mix(
        in srgb,
        var(--stratum-tile-accent, var(--stratum-lights)) 40%,
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
        var(--stratum-tile-accent, var(--stratum-lights)) 22%,
        transparent
      );
      color: var(--stratum-tile-accent, var(--stratum-lights));
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
      background: var(--stratum-tile-accent, var(--stratum-lights));
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
      background: var(--stratum-tile-accent, var(--primary-color));
    }

    .mini-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--stratum-ink-tint);
      box-shadow: 0 1px 3px color-mix(in srgb, var(--stratum-ink-shade) 30%, transparent);
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .mini-toggle.on .mini-toggle-knob {
      transform: translateX(16px);
    }

    /* Zwarta roleta (jak bubble): ikona | nazwa+% | ↑ ■ ↓ bez ramek. */
    .cover-row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 8px 14px 8px 10px;
      border-radius: 14px;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
      color: var(--primary-text-color);
      cursor: pointer;
    }

    .cover-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .cover-body .tile-name {
      grid-area: unset;
    }

    .cover-state {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
    }

    .cover-ctrl {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 18px;
      padding-right: 4px;
    }

    .cover-btn {
      position: relative;
      border: 0;
      background: transparent;
      padding: 6px;
      color: var(--primary-text-color);
      opacity: 0.85;
      cursor: pointer;
      display: inline-flex;
      transition: opacity 0.12s ease, transform 0.08s ease;
    }

    /* ↑ ■ ↓ mają ~32 px — pole trafienia do 44 (gap 18 px daje zapas,
       więc sąsiednie cele się nie nakładają). */
    .cover-btn::after {
      content: '';
      position: absolute;
      inset: -6px;
      border-radius: 999px;
    }

    /* (hover: hover): na dotyku :hover zostaje przyklejony po tapnięciu
       do następnego dotknięcia gdzie indziej — przycisk wyglądał na
       „zaznaczony". To zapytanie o możliwości wskaźnika, nie o rozmiar,
       więc zostaje media query (jak prefers-reduced-motion). */
    @media (hover: hover) {
      .cover-btn:hover {
        opacity: 1;
      }
    }

    /* 0.96, nie 0.88: reguła §3 — krótki feedback, nie podskok ikony. */
    .cover-btn:active {
      transform: scale(0.96);
    }

    .cover-btn ha-icon {
      --mdc-icon-size: 20px;
    }

    .tile.cover {
      cursor: default;
    }

    /* Hover i fokus rozdzielone: wspólna reguła z outline: none kasowała
       obrys fokusa — z klawiatury nie było widać, który kafel jest aktywny
       (CLAUDE.md §3 wskazywał dokładnie to miejsce). Hover tylko na
       kaflach-przyciskach (.tile.slider to <div>, nie udaje przycisku)
       i tylko przy prawdziwym wskaźniku. */
    @media (hover: hover) {
      button.tile:hover:not(:disabled) {
        background: var(--stratum-tile-hover-background);
      }
    }

    /* Wspólny obrys fokusa wszystkich elementów klikalnych kafla.
       Offset ujemny tam, gdzie obrys na zewnątrz wpadałby pod sąsiada
       w gęstej siatce (gap 6–10 px). */
    .tile:focus-visible,
    .cover-btn:focus-visible,
    .ctrl-btn:focus-visible,
    .inline-toggle:focus-visible,
    .chips-tile:focus-visible,
    .bubble-tile:focus-visible,
    .icon-tile:focus-visible,
    .tile-icon-wrap:focus-visible,
    .player-tag:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--primary-color));
      outline-offset: 2px;
    }

    .tile.on {
      border-color: var(--stratum-tile-accent, var(--primary-color));
    }

    .tile-icon {
      grid-area: icon;
      --mdc-icon-size: 22px;
      color: var(--secondary-text-color);
    }

    .tile.on .tile-icon {
      color: var(--stratum-tile-accent, var(--primary-color));
    }

    .tile.toggle.on .tile-icon {
      color: var(--stratum-lights);
    }

    /* Kolory binarnych z motywu (--stratum-alarm / --stratum-ok delegują do
       --stratum-chip-leak-color → --error-color / --success-color, definicje
       w surface-tokens.ts) — Mushroom czy Catppuccin
       przemalowują je razem z resztą dashboardu. */
    .tile.binary.on .tile-icon {
      color: var(--stratum-alarm);
    }

    .tile.binary.off .tile-icon {
      color: var(--stratum-ok);
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
      /* ↑ ■ ↓ stoją w rządku po ~30 px z odstępem 6 px — rośnie sam
         przycisk, bo niewidoczne pole trafienia zachodziłoby na sąsiada. */
      min-height: 44px;
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

    @media (hover: hover) {
      .ctrl-btn:hover {
        background: color-mix(
          in srgb,
          var(--primary-color) 12%,
          var(--secondary-background-color)
        );
        border-color: var(--primary-color);
      }

      /* Kierunek jazdy w kolorach motywu: zielony = otwiera, czerwony =
         zamyka, pomarańczowy = stop. */
      .ctrl-btn.up:hover {
        color: var(--stratum-ok);
        border-color: var(--stratum-ok);
      }
      .ctrl-btn.down:hover {
        color: var(--stratum-alarm);
        border-color: var(--stratum-alarm);
      }
      .ctrl-btn.stop:hover {
        color: var(--stratum-warn);
        border-color: var(--stratum-warn);
      }
    }

    .ctrl-btn:active {
      transform: scale(0.96);
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

    @media (hover: hover) {
      .inline-toggle:hover {
        opacity: 0.8;
      }
    }

    .inline-toggle:active,
    .chips-tile:active:not(.readonly),
    .bubble-tile:active,
    .icon-tile:active {
      transform: scale(0.97);
    }

    .range {
      width: 100%;
      height: 4px;
      accent-color: var(--stratum-lights);
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
      border-color: var(--stratum-tile-chip-accent, var(--primary-color));
      background: color-mix(in srgb, var(--stratum-tile-chip-accent, var(--primary-color)) 18%, transparent);
      color: var(--stratum-tile-chip-accent, var(--primary-color));
    }

    @media (hover: hover) {
      .chips-tile:hover:not(.readonly) {
        background: var(--stratum-tile-hover-background);
      }

      .chips-tile.on:hover:not(.readonly) {
        background: color-mix(in srgb, var(--stratum-tile-chip-accent, var(--primary-color)) 28%, transparent);
      }
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

    /* Hover zmienia tylko tło — dawny translateY(-1px) przesuwał treść
       (§3), a na telefonie kafel zostawał uniesiony po tapnięciu. */
    @media (hover: hover) {
      .bubble-tile:hover {
        background: var(--stratum-tile-hover-background);
      }
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

    /* Glif na wypełnionym kółku: ciemny atrament podbarwiony akcentem, nie
       biel — biała ikona na żółtym kółku światła miała ~1,6:1 (próg dla
       ikon 3:1) i prawie znikała. Akcenty kółek (światła, primary,
       rolety, alarm/ok) są jasne, więc ciemny atrament niesie je wszystkie;
       motyw z ciemnym akcentem nadpisuje --stratum-tile-bubble-ink. */
    .bubble-tile.on .bubble-circle {
      background: var(--stratum-tile-bubble-accent, var(--primary-color));
      color: var(
        --stratum-tile-bubble-ink,
        color-mix(
          in srgb,
          var(--stratum-tile-bubble-accent, var(--primary-color)) 25%,
          var(--stratum-ink-shade)
        )
      );
      border-color: var(--stratum-tile-bubble-accent, var(--primary-color));
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
      --stratum-tile-bubble-accent: var(--stratum-lights);
    }
    :host([data-domain='switch']) .bubble-tile.on,
    :host([data-domain='fan']) .bubble-tile.on,
    :host([data-domain='media_player']) .bubble-tile.on {
      --stratum-tile-bubble-accent: var(--primary-color);
    }
    :host([data-domain='cover']) .bubble-tile.on {
      --stratum-tile-bubble-accent: var(--stratum-chip-windows-color, #42a5f5);
    }
    :host([data-domain='binary_sensor']) .bubble-tile.on {
      --stratum-tile-bubble-accent: var(--stratum-alarm);
    }
    :host([data-domain='binary_sensor']) .bubble-tile.off {
      --stratum-tile-bubble-accent: var(--stratum-ok);
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

    @media (hover: hover) {
      .icon-tile:hover {
        background: var(--stratum-tile-hover-background);
      }
    }

    .icon-tile.on {
      color: var(--stratum-tile-icon-accent, var(--primary-color));
      border-color: var(--stratum-tile-icon-accent, var(--primary-color));
    }

    :host([data-domain='light']) .icon-tile.on {
      --stratum-tile-icon-accent: var(--stratum-lights);
    }
    :host([data-domain='binary_sensor']) .icon-tile.on {
      --stratum-tile-icon-accent: var(--stratum-alarm);
    }
    :host([data-domain='binary_sensor']) .icon-tile.off {
      color: var(--stratum-ok);
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
      border: 1px solid var(--divider-color);
      background: var(--stratum-tile-background);
      /* Bez tranzycji tła: gradient i tak się nie interpoluje (przeskok),
         a box-shadow nie należy do animowanych właściwości (CLAUDE.md §4). */
      color: var(--primary-text-color);
    }

    /* Tło w kolorze światła. Kolor i nasycenie (15–70% wg jasności) daje
       kafel jako zmienne (tile-ambient.ts); color-mix działa dla rgb(),
       hexa i tokenu — dawne doklejanie alfy do rgb() psuło całą regułę.
       Spód to powierzchnia kafla, żeby w jasnym motywie tło nie
       przeświecało przez półprzezroczysty gradient. */
    .ambient-tile.on {
      background:
        linear-gradient(
          135deg,
          color-mix(
            in srgb,
            var(--stratum-ambient-color) var(--stratum-ambient-pct),
            transparent
          ),
          color-mix(in srgb, var(--stratum-ambient-color) 13%, transparent)
        ),
        var(--stratum-tile-background);
      box-shadow: 0 4px 16px color-mix(in srgb, var(--stratum-ink-shade) 25%, transparent);
      border-color: transparent;
    }

    .ambient-icon {
      grid-area: icon;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 0;
      background: color-mix(in srgb, var(--stratum-ink-shade) 25%, transparent);
      color: var(--secondary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.1s ease;
    }

    .ambient-tile.on .ambient-icon {
      background: color-mix(in srgb, var(--stratum-ink-tint) 20%, transparent);
    }

    @media (hover: hover) {
      .ambient-icon:hover {
        filter: brightness(1.15);
      }
    }

    .ambient-icon:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--primary-color));
      outline-offset: 2px;
    }

    .ambient-icon:active {
      transform: scale(0.96);
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
      text-shadow: 0 1px 2px color-mix(in srgb, var(--stratum-ink-shade) 40%, transparent);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ambient-state {
      font-size: 12px;
      opacity: 0.85;
      /* Procent zmienia się w miejscu przy suwaku — bez tabular-nums drga. */
      font-variant-numeric: tabular-nums;
      text-shadow: 0 1px 2px color-mix(in srgb, var(--stratum-ink-shade) 40%, transparent);
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

    /* ===== Player z okładką (media, mode player) ===== */
    .player-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 6px;
      min-height: var(--stratum-player-min-height, 168px);
      border-radius: 16px;
      /* Górne 44 px należy do absolutnych elementów (⏻ 8 + 32 px z lewej,
         plakietka nazwy z prawej). Treść stoi przy dolnej krawędzi
         (flex-end), więc na szerokim kaflu nic się nie zmienia — ale gdy
         sterowanie zawinie się w dwa rzędy na telefonie, tytuł nie wjedzie
         pod ⏻ (dawniej nachodził na niego także w stanie „wyłączony"). */
      padding: 44px 14px 14px;
      background: var(--stratum-tile-background);
      background-size: cover;
      background-position: center;
      border: 1px solid var(--divider-color);
      /* Na okładce tekst jest zawsze jasny — tło to przyciemniona grafika,
         nie powierzchnia motywu. */
      color: var(--stratum-ink-tint);
      cursor: pointer;
      overflow: hidden;
      /* Kontener dla rzędu sterowania: na telefonie kafel ma 300–370 px
         i jeden rząd (⏮ ⏯ ⏭ + głośność + 🎙) się nie mieści. Kontener na
         kaflu, nie na :host — :host dzielą wszystkie tryby kafla, a
         containment rozmiaru mógłby zgnieść kafle o szerokości z treści. */
      container: stratum-player / inline-size;
    }

    .player-tile:not(.has-art) {
      color: var(--primary-text-color);
    }

    .player-tile.off:not(.has-art) {
      min-height: 96px;
    }

    /* Dwie klasy: reguła .player-btn (niżej) ustawia position: relative
       i rozmiar — sama .player-power przegrywała z nią kolejnością. */
    .player-btn.player-power {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 32px;
      height: 32px;
    }
    .player-power ha-icon {
      --mdc-icon-size: 16px;
    }

    .player-progress.seekable {
      cursor: pointer;
      /* Wyższy hitbox przy zachowaniu cienkiego paska. */
      padding: 5px 0;
      background-clip: content-box;
    }

    .player-btn.vol-btn.mic {
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    /* Kolory stanów mikrofonu i wyciszenia — niżej, za regułami :hover.
       Pulsowanie nagrywania = trwa akcja wymagająca uwagi (puść, żeby
       wysłać). Puls to pierścień ::before animowany transform/opacity —
       ::after jest polem trafienia. */
    .player-btn.vol-btn.mic.recording::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 999px;
      box-shadow: 0 0 0 2px var(--error-color);
      animation: stratum-mic-pulse 1.1s ease-out infinite;
      pointer-events: none;
    }
    @keyframes stratum-mic-pulse {
      from {
        transform: scale(1);
        opacity: 0.8;
      }
      to {
        transform: scale(1.5);
        opacity: 0;
      }
    }

    .player-tag {
      position: absolute;
      top: 10px;
      right: 12px;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--stratum-ink-shade) 45%, transparent);
      color: color-mix(in srgb, var(--stratum-ink-tint) 85%, transparent);
      /* Plakietka to wejście klawiatury do more-info (role="button") —
         klik i tak trafia w kafel, który robi to samo. */
      cursor: pointer;
    }

    .player-tile:not(.has-art) .player-tag {
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }

    .player-title {
      font-size: 16px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .player-artist {
      font-size: 12.5px;
      opacity: 0.75;
      margin-top: -4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .player-progress {
      display: block;
      height: 4px;
      border-radius: 4px;
      /* Na okładce: rozjaśnienie ciemnej grafiki. */
      background: color-mix(in srgb, var(--stratum-ink-tint) 22%, transparent);
      overflow: hidden;
    }

    /* Bez okładki tor leży na powierzchni karty — biel była w jasnym
       motywie białym na białym i pasek „wisiał w powietrzu". */
    .player-tile:not(.has-art) .player-progress {
      background: var(--stratum-surface-3);
    }

    .player-progress i {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--stratum-player-accent, var(--primary-color));
    }

    /* Rząd sterowania: transport (⏮ ⏯ ⏭) + głośność (wycisz, −, suwak, +,
       🎙). Pola trafienia 44 px bez nachodzenia: przycisk transportu 40 px
       + odstęp 8, przycisk głośności 32 px + odstęp 12 — środki co ≥ 44 px,
       więc ::after (44 px) sąsiadów się nie zazębiają i „−" nie łapie
       palca przeznaczonego dla „wycisz". Przyciski nie kurczą się
       (flex-shrink: 0) — dawniej ściskały się w owale 21–26 px. */
    .player-controls {
      display: flex;
      align-items: center;
      gap: 8px 12px;
      margin-top: 4px;
      min-width: 0;
    }

    .player-transport {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }

    .player-vol-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1 1 auto;
      min-width: 0;
    }

    /* Telefon (kafel ≤ ~430 px): jeden rząd potrzebuje ~404 px treści
       (136 transport + 12 + 176 przycisków głośności + 80 suwaka), więc
       głośność schodzi do drugiego rzędu na pełną szerokość. Zmierzone:
       popup 360 dp daje kafel 320 px, 412 dp — 372 px; oba się zawijają. */
    @container stratum-player (max-width: 403px) {
      .player-controls {
        flex-wrap: wrap;
      }
      /* Tylko z głośnością — sam 🎙 (np. wyłączony głośnik) mieści się
         obok transportu i nie potrzebuje własnego rzędu. */
      .player-vol-row.has-volume {
        flex: 1 0 100%;
      }
    }

    .player-btn {
      position: relative;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      padding: 0;
      border-radius: 999px;
      border: 0;
      /* Na okładce: półprzezroczyste rozjaśnienie ciemnej grafiki. */
      background: color-mix(in srgb, var(--stratum-ink-tint) 12%, transparent);
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s ease, transform 0.08s ease;
      touch-action: manipulation;
    }

    /* Pole trafienia 44 px niezależnie od rozmiaru wizualnego. */
    .player-btn::after {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 999px;
    }

    .player-tile:not(.has-art) .player-btn {
      background: var(--stratum-surface-2);
    }

    @media (hover: hover) {
      .player-btn:hover:not(:disabled) {
        background: color-mix(in srgb, var(--stratum-ink-tint) 22%, transparent);
      }

      /* Bez okładki przycisk leży na powierzchni karty, nie na grafice —
         biel przestaje być właściwym rozjaśnieniem. */
      .player-tile:not(.has-art) .player-btn:hover:not(:disabled) {
        background: var(--stratum-surface-4);
      }
    }

    .player-btn:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--primary-color));
      outline-offset: 2px;
    }

    .player-btn:active:not(:disabled) {
      transform: scale(0.96);
    }

    /* Funkcja nieobsługiwana przez urządzenie (np. ⏭ na wejściu HDMI) —
       widoczna, ale wyraźnie martwa; powód w podpisie. */
    .player-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    /* Prefiks .player-tile: reguła „bez okładki" wyżej ma wyższą
       specyficzność i bez niego gasiła akcent przycisku ⏯ na szaro. */
    .player-tile .player-btn.play {
      background: var(--stratum-player-accent, var(--primary-color));
      color: var(--text-primary-color);
    }

    @media (hover: hover) {
      .player-tile .player-btn.play:hover:not(:disabled) {
        background: var(--stratum-player-accent, var(--primary-color));
        filter: brightness(1.1);
      }
    }

    /* Stany mikrofonu i wyciszenia. Prefiks .player-tile + miejsce ZA
       regułami :hover: „bez okładki" :hover ma specyficzność (0,5,0) i
       dawniej podmieniała czerwień „mikrofon na żywo" na szarą
       powierzchnię — na telefonie :hover trzyma się pod palcem przez całe
       mówienie, a biała ikona lądowała na jasnoszarym tle. Stan to
       informacja, hover tylko zapowiedź — stan wygrywa. */
    .player-tile .player-btn.vol-btn.mute.muted {
      background: color-mix(in srgb, var(--error-color) 35%, transparent);
    }
    /* Nagrywanie: czerwień = „mikrofon na żywo". */
    .player-tile .player-btn.vol-btn.mic.recording {
      background: var(--error-color);
      color: var(--text-primary-color);
    }
    .player-tile .player-btn.vol-btn.mic.sending {
      background: color-mix(
        in srgb,
        var(--stratum-player-accent, var(--primary-color)) 60%,
        transparent
      );
      color: var(--text-primary-color);
    }
    /* Porażka (brak zgody na mikrofon, 403, timeout): przekreślony mikrofon
       w kolorze błędu na kilka sekund, powód w toaście i w podpisie. */
    .player-tile .player-btn.vol-btn.mic.error {
      background: color-mix(in srgb, var(--error-color) 25%, transparent);
      color: var(--error-color);
    }

    .player-btn.vol-btn {
      width: 32px;
      height: 32px;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Głośność / mute / mikrofon / zasilanie: 32 px wizualnie, 44 pod palcem. */
    .player-btn.vol-btn::after,
    .player-power::after {
      inset: -6px;
    }
    .player-btn.vol-btn ha-icon {
      --mdc-icon-size: 16px;
    }
    .player-btn ha-icon {
      --mdc-icon-size: 20px;
    }

    .player-vol-icon {
      --mdc-icon-size: 16px;
      flex: none;
      opacity: 0.75;
    }

    /* Suwak rozciąga się na resztę rzędu (dawniej stałe 90 px). Wysokość
       32 px to pas dotyku — tor pozostaje cienki, rysuje go przeglądarka. */
    .player-volume {
      flex: 1 1 80px;
      min-width: 64px;
      width: auto;
      height: 32px;
      margin: 0;
      accent-color: var(--stratum-player-accent, var(--primary-color));
      cursor: pointer;
    }

    .player-volume:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--primary-color));
      outline-offset: 2px;
    }

    /* Furtka ruchu dla całego kafla (§4): bez tranzycji i bez skoków
       scale() pod palcem. Stan dalej widać — zmienia się kolor/tło, nie
       pozycja. Gałka mini-przełącznika przeskakuje bez sprężyny. */
    @media (prefers-reduced-motion: reduce) {
      .tile,
      .tile-icon-wrap,
      .progress-bar::after,
      .mini-toggle,
      .mini-toggle-knob,
      .cover-btn,
      .ctrl-btn,
      .chips-tile,
      .bubble-tile,
      .bubble-circle,
      .icon-tile,
      .player-btn,
      .ambient-icon {
        transition: none;
      }
      button.tile:active:not(:disabled),
      .cover-btn:active,
      .ctrl-btn:active,
      .inline-toggle:active,
      .chips-tile:active:not(.readonly),
      .bubble-tile:active,
      .icon-tile:active,
      .player-btn:active:not(:disabled),
      .ambient-icon:active {
        transform: none;
      }
      /* Bez pulsu zostaje stały pierścień — stan nagrywania dalej widać. */
      .player-btn.vol-btn.mic.recording::before {
        animation: none;
      }
    }

    /* ===== Kafel grupy świateł: rail / tint ===== */
    .glight {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      min-height: var(--stratum-glight-min-height, 96px);
      border-radius: var(--stratum-glight-radius, 16px);
      /* Ten sam padding liczy przycięcie napisu (.glight-head-base) —
         dlatego zmienna, nie dwie osobne dwunastki. */
      padding: var(--stratum-glight-pad);
      /* Wyrazniejsza separacja od tla i sasiadow — przy ledwo widocznych
         ramkach sasiednie kafle zlewaly sie w jedna bryle. Powierzchnia
         i ramka z motywu (color-mix), zgodnie z regulami CLAUDE.md. */
      background: var(
        --stratum-tile-background,
        color-mix(in srgb, var(--card-background-color) 93%, var(--primary-text-color))
      );
      border: 1px solid
        color-mix(in srgb, var(--primary-text-color) 14%, transparent);
      color: var(--primary-text-color);
      cursor: pointer;
      overflow: hidden;
      touch-action: pan-y;
      transition: background 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
    }

    .glight:active {
      transform: scale(0.98);
    }

    .glight:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--primary-color));
      outline-offset: -2px;
    }

    /* Wszystko poza fill nad wypełnieniem. */
    .glight > *:not(.glight-fill):not(.glight-ink) {
      position: relative;
      z-index: 1;
    }

    /* Poziome wypełnienie = jasność (jak bubble slider): pełna wysokość,
       solidny blok koloru światła od lewej krawędzi. */
    .glight-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--stratum-glight-pct, 0%);
      background: color-mix(
        in srgb,
        var(--stratum-glight-accent, var(--stratum-lights)) 80%,
        transparent
      );
      transition: width 0.25s ease-out;
      z-index: 0;
    }

    /* Zgaszony kafel nie ma paska — poza chwilą, gdy palec właśnie ciągnie
       suwak w górę z zera, i czasem po puszczeniu, zanim HA potwierdzi
       zapalenie (klasa held) — inaczej pasek znikał i wracał mignięciem. */
    .glight.off:not(.dragging):not(.held) .glight-fill {
      display: none;
    }

    /* W trakcie swipe pasek idzie 1:1 za palcem — tranzycja startowała od
       nowa co klatkę i wypełnienie ciągnęło się za palcem. */
    .glight.dragging .glight-fill,
    .glight.dragging .glight-bar::after {
      transition: none;
    }

    .glight-head {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .glight-name {
      font-size: 14.5px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .glight-state {
      font-size: 11.5px;
      font-weight: 600;
      opacity: 0.8;
      font-variant-numeric: tabular-nums;
    }

    /* Dawny text-shadow (czarna poświata) nie przywracał kontrastu jasnego
       napisu na żółtym pasku, a w jasnym motywie brudził tekst. Kontrast
       niesie teraz osobna warstwa napisu na pasku (.glight-ink). */
    .glight.off .glight-name,
    .glight.off .glight-state {
      color: var(--secondary-text-color);
    }

    /* ── Rail: napis w dwóch warstwach, rozciętych na krawędzi paska ──
       Warstwa .glight-ink leży na całym kaflu z tym samym paddingiem co
       kafel, więc jej nagłówek wypada piksel w piksel na nagłówku
       właściwym. Przycinamy ją do szerokości paska (ten sam
       --stratum-glight-pct co .glight-fill), a nagłówek właściwy — do
       reszty. Obie granice idą z jednej zmiennej i tą samą tranzycją, więc
       krawędź atramentu nie odjeżdża od krawędzi paska ani przy swipe
       (Lit przepisuje zmienne raz na klatkę), ani po puszczeniu. */
    .glight {
      --stratum-glight-pad: 12px;
    }

    .glight > .glight-ink {
      position: absolute;
      inset: 0;
      z-index: 2;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      padding: var(--stratum-glight-pad);
      pointer-events: none;
      clip-path: inset(0 calc(100% - var(--stratum-glight-pct, 0%)) 0 0);
      transition: clip-path 0.25s ease-out;
    }

    /* Nagłówek właściwy: krawędź paska w układzie nagłówka to
       t × (szerokość nagłówka + 2 × padding) − padding. */
    .glight.rail .glight-head-base {
      clip-path: inset(
        0 0 0
          calc(
            var(--stratum-glight-t, 0) * (100% + 2 * var(--stratum-glight-pad)) -
              var(--stratum-glight-pad)
          )
      );
      transition: clip-path 0.25s ease-out;
    }

    .glight.rail.off:not(.dragging):not(.held) .glight-ink {
      display: none;
    }
    .glight.rail.off:not(.dragging):not(.held) .glight-head-base {
      clip-path: none;
    }

    .glight.dragging .glight-ink,
    .glight.dragging .glight-head-base {
      transition: none;
    }

    /* Atrament z koloru światła (stripeInk w JS → klasa ink-*), wzór
       z pasków belki piętra. Specyficzność ponad .glight.off .glight-name,
       bo przy przeciąganiu z zera kafel jest jeszcze „off". */
    .glight.ink-dark .glight-ink {
      color: color-mix(
        in srgb,
        var(--stratum-glight-accent, var(--stratum-lights)) 20%,
        var(--stratum-ink-shade)
      );
    }
    /* Pasek jest kryty w 80% — pod spodem przebija ciemna powierzchnia
       i obniża kontrast. Procent (11,5 px) przy krycie 0.8 schodził
       poniżej 4,5:1, więc na pasku stoi mocniej niż poza nim. */
    .glight-ink .glight-state {
      opacity: 0.92;
    }
    .glight.ink-light .glight-ink {
      color: color-mix(
        in srgb,
        var(--stratum-glight-accent, var(--stratum-lights)) 12%,
        var(--stratum-ink-tint)
      );
    }
    .glight .glight-ink .glight-name,
    .glight .glight-ink .glight-state {
      color: inherit;
    }

    .glight-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8px;
    }

    .glight-bubble {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--stratum-surface-base) 55%, var(--stratum-ink-shade));
    }

    .glight-bubble {
      cursor: pointer;
    }

    @media (hover: hover) {
      .glight-bubble:hover ha-icon {
        filter: brightness(1.3);
      }
    }

    .tile-icon-wrap {
      cursor: pointer;
    }

    .glight-bubble ha-icon {
      --mdc-icon-size: 22px;
      color: var(--secondary-text-color);
    }

    .glight.on .glight-bubble ha-icon {
      color: var(--stratum-glight-accent, var(--stratum-lights));
    }

    /* tint: tło kafla w kolorze światła + pasek jasności na dole */
    .glight.tint {
      padding-bottom: 20px;
    }

    .glight.tint.on {
      background: linear-gradient(
          135deg,
          color-mix(
            in srgb,
            var(--stratum-glight-accent, var(--stratum-lights)) 24%,
            transparent
          ),
          color-mix(
            in srgb,
            var(--stratum-glight-accent, var(--stratum-lights)) 6%,
            transparent
          ) 65%
        ),
        var(--stratum-tile-background, rgba(255, 255, 255, 0.04));
      border-color: color-mix(
        in srgb,
        var(--stratum-glight-accent, var(--stratum-lights)) 35%,
        transparent
      );
    }

    .glight.tint .glight-bubble {
      background: color-mix(in srgb, var(--stratum-ink-shade) 28%, transparent);
    }

    .glight-bar {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 8px;
      height: 4px;
      border-radius: 4px;
      background: var(--stratum-surface-3);
      overflow: hidden;
    }

    .glight-bar::after {
      content: '';
      display: block;
      height: 100%;
      width: var(--stratum-glight-pct, 0%);
      border-radius: 4px;
      background: var(--stratum-glight-accent, var(--stratum-lights));
      transition: width 0.25s ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .glight,
      .glight-fill,
      .glight-bar::after,
      .glight > .glight-ink,
      .glight.rail .glight-head-base {
        transition: none;
      }
      .glight:active {
        transform: none;
      }
    }

    /* Per-domain akcenty w chips mode */
    :host([data-domain='light']) .chips-tile.on {
      --stratum-tile-chip-accent: var(--stratum-lights);
    }
    :host([data-domain='binary_sensor']) .chips-tile.on {
      --stratum-tile-chip-accent: var(--stratum-alarm);
    }
    :host([data-domain='binary_sensor']) .chips-tile.off {
      --stratum-tile-chip-accent: var(--stratum-ok);
      border-color: var(--stratum-tile-chip-accent);
      color: var(--stratum-tile-chip-accent);
    }
  
    /* ====== Encja niedostępna ====== */
    .tile.unav {
      opacity: 0.6;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }
    .tile.unav .unav-icon {
      position: relative;
      display: inline-flex;
      color: var(--secondary-text-color);
    }
    .tile.unav .unav-icon::after {
      content: "";
      position: absolute;
      left: 8%;
      right: 8%;
      top: 50%;
      height: 2px;
      border-radius: 1px;
      background: color-mix(in srgb, var(--secondary-text-color) 85%, transparent);
      transform: rotate(-40deg);
    }
    .tile.unav .tile-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
    .off-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10.5px;
      font-weight: 600;
      color: var(--secondary-text-color);
      background: var(--stratum-surface-3);
      border-radius: 999px;
      padding: 2px 9px;
      flex-shrink: 0;
    }
    .off-pill::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--secondary-text-color) 90%, transparent);
    }
`;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-room-tile': StratumRoomTile;
  }
}
