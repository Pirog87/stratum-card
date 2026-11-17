// Jeden wiersz pomieszczenia w body rozwiniętej karty.
//
// Cztery presety kształtu (`display_config.preset`):
//  - fill (default) — pigułka z wypełnieniem = średnia jasność świateł
//  - pill           — pigułka z ringiem aktywności
//  - rail           — płaska lista z paskiem akcentu z lewej (dawny wygląd)
//  - cards          — miękkie karty z gradient-tintem
//
// Statusy: stały porządek (temp → wilgotność → światła → ruch → okna →
// drzwi → alarmy), limit 4 widocznych + „+n". Alarmy mają najwyższy
// priorytet i nie są ucinane przed zwykłymi polami; gdy stoi odznaka ⚠ N,
// to ona je zastępuje i zajmuje slot limitu (reguły w row-fields.ts).

import {
  LitElement,
  html,
  css,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { RowDisplayConfig, RowPreset, TileField } from './types.js';
import { resolveColor } from './colors.js';
import { lightsSwitchGlowStyle } from './lights-switch-glow.js';
import { DEFAULT_FIELDS, type ConditionOverride } from './tile-data.js';
import {
  ALARM_ICONS,
  badgeCap,
  capByPriority,
  rowNarrowLevel,
  singleLineCap,
  topAlarmField,
  withoutBadgeFields,
} from './row-fields.js';
import { iconActionLabel } from './icon-action-label.js';

// Kolejność wyświetlania pól = kolejność listy `fields` w configu
// (od v1.85 zmienialna strzałkami w edytorze).

/** Faza gestu jasności zgłaszana karcie. */
export type RowBrightnessPhase = 'start' | 'move' | 'end' | 'cancel';

/**
 * `detail` zdarzenia `row-brightness`. Pola poniżej `pct` wypełnia KARTA w
 * trakcie obsługi zdarzenia (dispatch jest synchroniczny) — tak wiersz
 * dostaje poziom startowy i wynik gestu bez osobnego kanału.
 */
export interface RowBrightnessDetail {
  area_id: string;
  phase: RowBrightnessPhase;
  /** Pozycja suwaka 0..100 (ułamkowa). */
  pct: number;
  /** start: poziom, od którego liczy karta; end: poziom docelowy. */
  level?: number;
  /** start: `false` = gest nic nie zrobi (ciemny pokój, tryb `none`). */
  active?: boolean;
  /** end: co karta zrobiła. */
  outcome?: 'set' | 'off' | 'noop';
}

/** Maksymalna liczba widocznych statusów zanim pojawi się „+n". */
const MAX_VISIBLE_FIELDS = 4;

/** Pola trafiające do sublinii pod nazwą (fill/pill, layout dwuliniowy). */
const SUB_FIELDS: TileField[] = ['temperature', 'humidity', 'motion'];

/** Limit pól po prawej stronie w layoutcie dwuliniowym. */
const MAX_RIGHT_FIELDS = 3;

@customElement('stratum-card-room-row')
export class StratumCardRoomRow extends LitElement {
  @property({ type: String }) public name = '';

  @property({ type: String }) public icon = 'mdi:floor-plan';

  @property({ type: String, attribute: 'area-id' }) public areaId = '';

  @property({ type: Number, attribute: 'lights-on' }) public lightsOn = 0;

  @property({ type: Boolean, attribute: 'motion' }) public motion = false;

  /** Sformatowana temperatura do wyświetlenia (np. "22.4 °C"). Opcjonalne. */
  @property({ type: String }) public temperature?: string;

  /** Sformatowana wilgotność (np. "54.2 %"). */
  @property({ type: String }) public humidity?: string;

  /** Liczba otwartych okien. */
  @property({ type: Number, attribute: 'windows-open' }) public windowsOpen = 0;

  /** Liczba otwartych drzwi. */
  @property({ type: Number, attribute: 'doors-open' }) public doorsOpen = 0;

  /** Liczba aktywnych czujek wycieku. */
  @property({ type: Number, attribute: 'leak-active' }) public leakActive = 0;

  /** Liczba aktywnych czujek dymu. */
  @property({ type: Number, attribute: 'smoke-active' }) public smokeActive = 0;

  /** Liczba aktywnych czujek gazu/CO. */
  @property({ type: Number, attribute: 'gas-active' }) public gasActive = 0;

  /** Liczba aktywnych „problem" binary_sensors. */
  @property({ type: Number, attribute: 'problem-active' }) public problemActive = 0;

  /** Globalna konfiguracja wyglądu (fields, accent_color, preset, show_icon…). */
  @property({ attribute: false }) public displayConfig?: RowDisplayConfig;

  /** Per-pokój CSS override. */
  @property({ type: String, attribute: 'style-override' }) public styleOverride?: string;

  /** Overrides wyliczone z `display_config.conditions`. */
  @property({ attribute: false }) public conditionOverride?: ConditionOverride;

  /** Dynamiczny accent z aktywnego światła (accent_mode=lights). */
  @property({ type: String, attribute: 'lights-accent' }) public lightsAccent?: string;

  /** Jasność pierwszego światła (0-1) — do intensywności akcentu. */
  @property({ type: Number, attribute: 'lights-brightness' }) public lightsBrightness?: number;

  /** Średnia jasność włączonych świateł (0-1) — napędza preset fill. */
  @property({ type: Number, attribute: 'lights-avg-brightness' })
  public lightsAvgBrightness?: number;

  /** Czy wiersz ma reagować na klik (pokazać cursor:pointer + hover). */
  @property({ type: Boolean, reflect: true }) public clickable = false;

  /** Czy pokój ma jakiekolwiek światła — warunek działania suwaka gestem. */
  @property({ type: Boolean, attribute: 'has-lights' }) public hasLights = false;

  /** Ikona świateł jako mini-switch (H4): tap = toggle świateł pokoju. */
  @property({ type: Boolean, attribute: 'lights-switch' })
  public lightsSwitch = false;

  /** Intensywność poświaty switcha, 0–100 (osobno stan on/off). */
  @property({ type: Number, attribute: 'lights-glow-on' })
  public lightsGlowOn = 100;

  @property({ type: Number, attribute: 'lights-glow-off' })
  public lightsGlowOff = 30;

  /** Czy switch widoczny też gdy w pokoju nic nie świeci. */
  @property({ type: Boolean, attribute: 'lights-switch-show-off' })
  public lightsSwitchShowOff = true;

  /** Liczba aktywnych encji alarmowych — badge ⚠ N przy alercie (A1). */
  @property({ type: Number, attribute: 'alarms-count' })
  public alarmsCount = 0;

  /**
   * Czy ikona ma własną, niezależną akcję kliknięcia. Gdy true — klik
   * w stadion ikony emituje `icon-tap` (nie bąbelkuje do akcji wiersza).
   */
  @property({ type: Boolean, attribute: 'icon-tappable', reflect: true })
  public iconTappable = false;

  /**
   * Typ akcji ikony (`action` z room_icon_tap_action) — tylko do nazwy
   * dostępnej stadionu, żeby czytnik mówił, co zrobi Enter.
   */
  @property({ attribute: false }) public iconAction?: string;

  /** Całe pomieszczenie niedostępne (wszystkie encje unavailable). */
  @property({ type: Boolean }) public offline = false;

  /**
   * Poziom (%) nadpisujący wypełnienie: pozycja palca w trakcie gestu, a po
   * puszczeniu — wartość docelowa trzymana do czasu, aż HA ją potwierdzi.
   *
   * Celowo NIE jest `@state`: ruch palca to 60+ zdarzeń na sekundę, a pełny
   * render Lita na każde z nich (kilkadziesiąt bindingów wiersza) był
   * jednym ze źródeł przycięć. Wypełnienie piszemy prosto do zmiennej CSS,
   * raz na klatkę (`_paintFill`).
   */
  private _fillOverride?: number;

  /** Wartość trzymana po puszczeniu palca + bezpiecznik czasowy. */
  private _hold?: { pct: number; timer: number };

  private _raf?: number;

  /** Ostatnio wpisana wartość zmiennej wypełnienia i element, do którego trafiła. */
  private _paintedFill?: string;
  private _paintedEl?: Element;

  /**
   * Poziom ciasnoty wiersza (0 = normalnie, 1 = ≤360 px, 2 = ≤310 px) —
   * mierzony ResizeObserverem na hoście. Reakcję wybiera `narrow_mode`.
   */
  @state() private _narrow: 0 | 1 | 2 = 0;

  /**
   * Pasmo 361–450 px — tu odznaka alarmu + 3 pola dusiły nazwę pokoju.
   * Osobna flaga, nie kolejny poziom `_narrow`: ma znaczenie tylko przy
   * alarmie (`singleLineCap`). ResizeObserver, a nie container query, bo
   * od tego zależy LICZBA renderowanych pól (wyjątek z CLAUDE.md).
   */
  @state() private _tight = false;

  private _narrowRo?: ResizeObserver;

  public connectedCallback(): void {
    super.connectedCallback();
    this._narrowRo = new ResizeObserver((entries) => {
      const { level, tight } = rowNarrowLevel(entries[0]?.contentRect.width ?? 0);
      if (level !== this._narrow) this._narrow = level;
      if (tight !== this._tight) this._tight = tight;
    });
    this._narrowRo.observe(this);
  }

  public disconnectedCallback(): void {
    this._narrowRo?.disconnect();
    this._narrowRo = undefined;
    if (this._raf !== undefined) {
      cancelAnimationFrame(this._raf);
      this._raf = undefined;
    }
    this._clearHold();
    this._fillOverride = undefined;
    this._drag = undefined;
    this.toggleAttribute('dragging', false);
    super.disconnectedCallback();
  }

  protected willUpdate(changed: PropertyValues): void {
    // Atrybut dla CSS: `touch-action` i brak zaznaczania tekstu wszędzie
    // tam, gdzie suwak działa (wszystkie presety, nie tylko fill/pill).
    if (changed.has('displayConfig') || changed.has('hasLights')) {
      this.toggleAttribute('slider', this._sliderEnabled);
    }
    // Po puszczeniu palca trzymamy wartość docelową, dopóki stany z HA do
    // niej nie dojdą (żarówki Zigbee raportują po kolei przez 1–3 s).
    if (
      this._hold &&
      !this._drag?.sliding &&
      (changed.has('lightsAvgBrightness') || changed.has('lightsOn'))
    ) {
      if (Math.abs(this._restPct() - this._hold.pct) <= 2) {
        this._clearHold();
        this._fillOverride = undefined;
      }
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._paintFill();
  }

  /** Stan aktywnego gestu przeciągania. */
  private _drag?: {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    width: number;
    sliding: boolean;
    /** Pozycja suwaka 0..100 — przyrostowo, patrz `_onPointerMove`. */
    t: number;
    /**
     * Gest rozpoznany, ale karta odpowiedziała „nic do zrobienia" (ciemny
     * pokój, `slider_from_off: none`). Trzymamy go do puszczenia palca —
     * inaczej mysz po przeciągnięciu generowała click i otwierała popup
     * albo (akcja `toggle-lights`) zapalała cały pokój.
     */
    inert?: boolean;
  };

  /**
   * Chwila zakończenia przeciągnięcia — tłumi click, który mysz generuje
   * tuż po puszczeniu. Dawniej była tu flaga zdejmowana dopiero przez
   * następny click; na dotyku po przeciągnięciu click nie powstaje, więc
   * flaga zostawała i połykała NASTĘPNE, prawdziwe dotknięcie wiersza.
   */
  private _dragEndedAt = -1e9;

  private _clickSuppressed(): boolean {
    return performance.now() - this._dragEndedAt < 350;
  }

  private _onClick = (): void => {
    if (this._clickSuppressed()) return;
    if (!this.clickable) return;
    this.dispatchEvent(
      new CustomEvent('row-tap', {
        detail: { area_id: this.areaId, area_name: this.name },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _onIconClick = (ev: Event): void => {
    if (!this.iconTappable) return; // klik bąbelkuje do akcji wiersza
    ev.stopPropagation();
    if (this._clickSuppressed()) return;
    this._emitIconTap();
  };

  /**
   * Osobna akcja ikony (room_icon_tap_action — np. ikona → popup, wiersz →
   * światła) była dostępna tylko palcem: stadion ikony nie miał fokusa ani
   * obsługi klawiszy. Enter/Spacja na nim robią to samo, co tapnięcie.
   * Wiersz nie przechwyci tych klawiszy — jego `_onKey` reaguje tylko na
   * zdarzenia z samego wiersza; preventDefault blokuje przewinięcie strony
   * Spacją.
   */
  private _onIconKey = (ev: KeyboardEvent): void => {
    if (!this.iconTappable) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    ev.stopPropagation();
    this._emitIconTap();
  };

  private _emitIconTap(): void {
    this.dispatchEvent(
      new CustomEvent('icon-tap', {
        detail: { area_id: this.areaId, area_name: this.name },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Czy suwak gestem jest włączony dla tej konfiguracji. */
  private get _sliderEnabled(): boolean {
    const cfg = this.displayConfig ?? {};
    if (cfg.slider === false) return false;
    return this.hasLights;
  }

  /** Poziom ze stanów HA (0..100), bez nadpisań gestu. */
  private _restPct(): number {
    return typeof this.lightsAvgBrightness === 'number'
      ? this.lightsAvgBrightness * 100
      : 0;
  }

  /** Poziom, który ma pokazać wypełnienie w tej chwili. */
  private _fillPct(): number {
    return this._fillOverride ?? this._restPct();
  }

  /**
   * Wpisuje wypełnienie prosto do zmiennej CSS na elemencie `.fill`.
   * Zmienna żyje poza szablonem Lita — inaczej render w trakcie gestu
   * (np. echo stanu z HA) i zapis z klatki animacji nadpisywałyby się
   * nawzajem. Wołane po każdym renderze i z rAF w trakcie ruchu.
   */
  private _paintFill(): void {
    const el = this.renderRoot.querySelector('.fill') as HTMLElement | null;
    if (!el) {
      this._paintedEl = undefined;
      return;
    }
    const value = `${Math.max(0, Math.min(100, this._fillPct())).toFixed(2)}%`;
    if (el === this._paintedEl && value === this._paintedFill) return;
    el.style.setProperty('--stratum-room-row-fill', value);
    this._paintedEl = el;
    this._paintedFill = value;
  }

  private _schedulePaint(): void {
    if (this._raf !== undefined) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = undefined;
      this._paintFill();
      const d = this._drag;
      // Jedno zdarzenie do karty na klatkę, nie na każdy pointermove.
      if (d?.sliding) this._emitBrightness('move', d.t);
    });
  }

  private _clearHold(): void {
    if (!this._hold) return;
    window.clearTimeout(this._hold.timer);
    this._hold = undefined;
  }

  /** Oddaje wypełnienie realnym stanom z HA (z istniejącą tranzycją 0.3 s). */
  private _releaseFill(): void {
    this._clearHold();
    this._fillOverride = undefined;
    this._paintFill();
  }

  private _onPointerDown = (ev: PointerEvent): void => {
    if (!this._sliderEnabled) return;
    // Tylko primary pointer (lewy przycisk / pierwszy palec) — drugi palec
    // nadpisywał punkt startu i wypełnienie skakało.
    if (ev.button !== 0 || ev.isPrimary === false) return;
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

  private _onPointerMove = (ev: PointerEvent): void => {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    // Mysz puszczona poza wierszem: bez tego późniejszy sam ruch kursora
    // nad wierszem potrafił zacząć „przeciąganie" bez wciśniętego przycisku.
    if (ev.pointerType === 'mouse' && ev.buttons === 0) {
      // Przycisk puszczony tam, gdzie nie dostaliśmy pointerup (menu
      // kontekstowe, poza oknem). To nie zatwierdzenie — anulujemy, inaczej
      // wypełnienie zostawało zamrożone, a karta z otwartym gestem.
      this._abandonDrag(d);
      return;
    }
    if (d.inert) return;
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
      const row = ev.currentTarget as HTMLElement;
      // Karta zamraża zestaw świecących świateł i odsyła poziom startowy
      // (synchronicznie, przez `detail`) — ten sam, od którego policzy
      // proporcje, więc palec, wypełnienie i żarówki mają jedną bazę.
      const start = this._emitBrightness('start', this._fillPct());
      if (start.active === false) {
        // Ciemny pokój i nic do przywrócenia (`slider_from_off: none`).
        d.inert = true;
        row.setPointerCapture(ev.pointerId);
        return;
      }
      d.sliding = true;
      d.width = Math.max(1, row.getBoundingClientRect().width);
      d.t = typeof start.level === 'number' ? start.level : this._fillPct();
      // Kotwica w punkcie rozpoznania gestu: bez skoku o te 12 px progu.
      d.lastX = ev.clientX;
      row.setPointerCapture(ev.pointerId);
      this._clearHold();
      this._fillOverride = d.t;
      this.toggleAttribute('dragging', true);
    }
    // Przyrostowo i z przycięciem na każdym kroku — po wyjechaniu palcem
    // poza koniec zakresu powrót reaguje od pierwszego piksela (dawniej
    // trzeba było najpierw „odrobić" cały nadmiarowy dystans).
    d.t = Math.max(0, Math.min(100, d.t + ((ev.clientX - d.lastX) / d.width) * 100));
    d.lastX = ev.clientX;
    this._fillOverride = d.t;
    this._schedulePaint();
  };

  private _onPointerUp = (ev: PointerEvent): void => {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this._drag = undefined;
    if (d.inert) {
      // Przeciągnięcie bez skutku to nadal przeciągnięcie, nie dotknięcie.
      ev.stopPropagation();
      this._dragEndedAt = performance.now();
      return;
    }
    if (!d.sliding) return;
    ev.stopPropagation();
    this._dragEndedAt = performance.now();
    this.toggleAttribute('dragging', false);
    const end = this._emitBrightness('end', d.t);
    // Trzymamy wartość docelową, aż HA ją potwierdzi (patrz `willUpdate`).
    // Sztywne 1,5 s było za krótkie dla kilkunastu żarówek Zigbee: pasek
    // odskakiwał do starej średniej i dopiero potem pełzł na miejsce.
    const target = typeof end.level === 'number' ? end.level : d.t;
    if (end.outcome === 'noop') {
      // Nic nie poszło do HA — pasek uczciwie wraca do stanu faktycznego.
      this._releaseFill();
      return;
    }
    this._clearHold();
    this._fillOverride = target;
    this._hold = {
      pct: target,
      timer: window.setTimeout(() => this._releaseFill(), 6000),
    };
    this._paintFill();
  };

  /**
   * System przerwał gest (przeglądarka przejęła dotyk, gest krawędziowy).
   * To nie jest zatwierdzenie — dawniej `pointercancel` szedł tą samą drogą
   * co puszczenie palca i potrafił np. zgasić cały pokój.
   */
  private _onPointerCancel = (ev: PointerEvent): void => {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this._abandonDrag(d);
  };

  /**
   * Utrata przechwycenia wskaźnika — siatka bezpieczeństwa, gdy pointerup
   * nie dotarł. Liczy się WYŁĄCZNIE utrata przez sam wiersz: na dotyku
   * przeglądarka niejawnie przechwytuje palec elementem pod nim (np. nazwą
   * pokoju), a nasze `setPointerCapture` na wierszu odbiera mu je. Zdarzenie
   * `lostpointercapture` dziecka bąbelkuje tutaj — brane za przerwanie
   * kończyło każdy gest w chwili startu (v1.107.0: suwak na telefonie nie
   * reagował, a przytrzymany palec kończył się systemowym long-pressem).
   */
  private _onLostCapture = (ev: PointerEvent): void => {
    if (ev.target !== ev.currentTarget) return;
    this._onPointerCancel(ev);
  };

  /** Porzucenie gestu bez zatwierdzenia (cancel, utracony capture, mysz). */
  private _abandonDrag(d: NonNullable<StratumCardRoomRow['_drag']>): void {
    this._drag = undefined;
    if (d.inert) {
      this._dragEndedAt = performance.now();
      return;
    }
    if (!d.sliding) return;
    this._dragEndedAt = performance.now();
    this.toggleAttribute('dragging', false);
    this._emitBrightness('cancel', d.t);
    this._releaseFill();
  }

  /**
   * Zdarzenie do karty. `detail` jest też kanałem zwrotnym: karta wpisuje
   * do niego synchronicznie poziom startowy / wynik gestu.
   */
  private _emitBrightness(
    phase: RowBrightnessPhase,
    pct: number,
  ): RowBrightnessDetail {
    const detail: RowBrightnessDetail = { area_id: this.areaId, phase, pct };
    this.dispatchEvent(
      new CustomEvent('row-brightness', {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
    return detail;
  }

  private _onAlarmBadge = (ev: Event): void => {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('row-alarms', { bubbles: true, composed: true }),
    );
  };

  private _onLightsSwitch = (ev: Event): void => {
    // Nie odpalaj akcji wiersza (popup) — to dedykowany przełącznik.
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('row-lights-toggle', { bubbles: true, composed: true }),
    );
  };

  private _onKey = (ev: KeyboardEvent): void => {
    if (!this.clickable) return;
    // Enter/Spacja na odznace alarmu albo przełączniku świateł bąbelkuje
    // tutaj; preventDefault kasował wtedy kliknięcie przycisku, a wiersz
    // otwierał popup zamiast listy alarmów / przełączenia świateł.
    if (ev.target !== ev.currentTarget) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this._onClick();
    }
  };

  /** Czy pole ma niepustą wartość do pokazania. */
  private _fieldHasValue(f: TileField): boolean {
    switch (f) {
      case 'temperature':
        return Boolean(this.temperature);
      case 'humidity':
        return Boolean(this.humidity);
      case 'lights':
        // Switch widoczny też przy zgaszonym pokoju (chyba że user
        // wyłączył opcją lights_switch_show_off).
        return this.lightsSwitch
          ? this.hasLights && (this.lightsOn > 0 || this.lightsSwitchShowOff)
          : this.lightsOn > 0;
      case 'motion':
        return this.motion;
      case 'windows':
        return this.windowsOpen > 0;
      case 'doors':
        return this.doorsOpen > 0;
      case 'leak':
        return this.leakActive > 0;
      case 'smoke':
        return this.smokeActive > 0;
      case 'gas':
        return this.gasActive > 0;
      case 'problem':
        return this.problemActive > 0;
      default:
        return false;
    }
  }

  /**
   * Pola do pokazania: max 4 wg priorytetu, w KOLEJNOŚCI z configu
   * (kolejność listy `fields` = kolejność na wierszu) + licznik ukrytych.
   */
  private _visibleFields(
    configured: TileField[],
    cap: number = MAX_VISIBLE_FIELDS,
    badge = false,
  ): {
    shown: TileField[];
    hiddenCount: number;
  } {
    // Odznaka ⚠ N zastępuje pola alarmowe i liczy się jako jeden slot
    // limitu (uzasadnienie w row-fields.ts).
    const withValue = withoutBadgeFields(
      configured.filter((f) => this._fieldHasValue(f)),
      badge,
    );
    return capByPriority(withValue, badgeCap(cap, badge), MAX_VISIBLE_FIELDS);
  }

  /**
   * Layout dwuliniowy (fill/pill): rozdziela pola na sublinię pod nazwą
   * (temp/wilgotność/motion) i prawą stronę (światła + liczniki + alarmy).
   */
  private _splitFields(
    configured: TileField[],
    rightCap: number = MAX_RIGHT_FIELDS,
    badge = false,
  ): {
    sub: TileField[];
    right: TileField[];
    hiddenCount: number;
  } {
    const withValue = configured.filter((f) => this._fieldHasValue(f));
    // Kolejność wewnątrz obu grup = kolejność listy `fields` z configu.
    const sub = withValue.filter((f) => SUB_FIELDS.includes(f));
    // Odznaka stoi po prawej razem z tymi polami — ta sama reguła co w
    // jednej linii: zastępuje pola alarmowe i zajmuje slot.
    const rightCandidates = withoutBadgeFields(
      withValue.filter((f) => !SUB_FIELDS.includes(f)),
      badge,
    );
    const right = capByPriority(rightCandidates, badgeCap(rightCap, badge), MAX_RIGHT_FIELDS);
    return { sub, right: right.shown, hiddenCount: right.hiddenCount };
  }

  /** Czy jakikolwiek alarm jest aktywny (smoke/gas/leak/problem). */
  private get _alarmActive(): boolean {
    return (
      this.smokeActive > 0 ||
      this.gasActive > 0 ||
      this.leakActive > 0 ||
      this.problemActive > 0
    );
  }

  protected render(): TemplateResult {
    const cfg = this.displayConfig ?? {};
    const preset: RowPreset = cfg.preset ?? 'fill';
    const fields = cfg.fields ?? DEFAULT_FIELDS;
    const showIcon = cfg.show_icon !== false;
    const showName = cfg.show_name !== false;
    const ovr = this.conditionOverride;
    const stateActive = this.lightsOn > 0 || this.motion;
    const lightsActive = Boolean(this.lightsAccent);
    const effectiveActive = stateActive || Boolean(ovr?.accent_color) || lightsActive;
    const alarmed = this._alarmActive;
    const accent =
      resolveColor(ovr?.accent_color) ??
      this.lightsAccent ??
      resolveColor(cfg.accent_color);
    const effectiveIcon = ovr?.icon ?? this.icon;
    const iconColorOvr = resolveColor(ovr?.icon_color);
    const rowAnim = ovr?.animation;
    const iconAnim = ovr?.icon_animation;
    const textColorOvr = resolveColor(ovr?.text_color);
    const opacityOvr = typeof ovr?.opacity === 'number' ? ovr.opacity : undefined;
    const iconScaleOvr =
      typeof ovr?.icon_size_scale === 'number' ? ovr.icon_size_scale : undefined;
    const borderColorOvr = resolveColor(ovr?.border_color);
    const borderWidthOvr =
      typeof ovr?.border_width === 'number' ? `${ovr.border_width}px` : undefined;
    const bgColorOvr = resolveColor(ovr?.background_color);

    const hoverEffect = cfg.hover_effect ?? 'subtle';
    const pressScale = typeof cfg.press_scale === 'number' ? cfg.press_scale : 0.98;


    // Reakcja na wąskie ekrany wg narrow_mode (default: zwijanie pól).
    const narrowMode = cfg.narrow_mode ?? 'fields';
    const nl = narrowMode === 'off' ? 0 : this._narrow;

    const cssVars: string[] = [
      effectiveActive && accent
        ? `--stratum-room-row-active-color: ${accent};`
        : '',
      typeof cfg.border_radius === 'number'
        ? `--stratum-room-row-radius: ${cfg.border_radius}px;`
        : '',
      typeof cfg.padding === 'number'
        ? `--stratum-room-row-padding: ${cfg.padding}px;`
        : '',
      (() => {
        // Kompakt na wąskich ekranach: skalujemy min-height (stadion ikony
        // i rozmiar ikony liczą się z tej zmiennej, więc kurczą się razem).
        if (nl > 0 && narrowMode === 'compact') {
          const base =
            cfg.min_height ?? (preset === 'rail' ? 48 : preset === 'cards' ? 54 : 85);
          const f = nl === 2 ? 0.68 : 0.78;
          return `--stratum-room-row-min-height: ${Math.round(base * f)}px;`;
        }
        return typeof cfg.min_height === 'number'
          ? `--stratum-room-row-min-height: ${cfg.min_height}px;`
          : '';
      })(),
      typeof cfg.icon_size === 'number'
        ? `--stratum-room-row-icon-size: ${cfg.icon_size}px;`
        : '',
      typeof cfg.icon_offset_x === 'number' && cfg.icon_offset_x !== 0
        ? `--stratum-room-row-icon-offset: ${cfg.icon_offset_x}px;`
        : '',
      typeof cfg.icon_bg_offset_x === 'number' && cfg.icon_bg_offset_x !== 0
        ? `--stratum-room-row-iconbg-offset: ${cfg.icon_bg_offset_x}px;`
        : '',
      typeof cfg.icon_bg_scale === 'number' && cfg.icon_bg_scale !== 100
        ? `--stratum-room-row-iconbg-scale: ${cfg.icon_bg_scale / 100};`
        : '',
      `--stratum-room-row-press-scale: ${pressScale};`,
      borderColorOvr
        ? `border: ${borderWidthOvr ?? '1px'} solid ${borderColorOvr};`
        : borderWidthOvr
        ? `border-width: ${borderWidthOvr};`
        : '',
      bgColorOvr ? `background-color: ${bgColorOvr};` : '',
      iconColorOvr ? `--stratum-card-room-icon-color: ${iconColorOvr};` : '',
      textColorOvr ? `color: ${textColorOvr};` : '',
      opacityOvr !== undefined ? `opacity: ${opacityOvr};` : '',
      iconScaleOvr !== undefined ? `--stratum-room-row-icon-scale: ${iconScaleOvr};` : '',
      this.styleOverride ?? '',
    ];
    const styles = cssVars.filter(Boolean).join(' ');

    // Default: jedna linia, wszystkie statusy po prawej. Layout dwuliniowy
    // (nazwa + sublinia) dostępny przez status_layout: 'two-line' albo
    // automatycznie na wąskich ekranach (narrow_mode: 'two-line').
    // rail/cards = zawsze klasyczna jedna linia.
    const twoLine =
      (preset === 'fill' || preset === 'pill') &&
      (cfg.status_layout === 'two-line' ||
        (narrowMode === 'two-line' && nl > 0));
    // Wąski dwuliniowy: nazwa duża u góry, pod nią JEDEN rządek wszystkich
    // statusów w kolejności z configu — CSS ucina naturalnie te z końca,
    // które się nie mieszczą. Po prawej zostaje tylko włącznik świateł.
    const narrowTwo = twoLine && nl > 0;
    // Odznaka ⚠ N w rządku po prawej (w wąskim dwuliniowym siedzi pod nazwą).
    const badge = alarmed && this.alarmsCount > 0 && !narrowTwo;
    // Przy alarmie pola zwijają się o poziom wcześniej, ale tylko w paśmie,
    // gdzie odznaka dusi nazwę (≤450 px) — uzasadnienie i pomiar w
    // row-fields.ts (`singleLineCap`). Szeroki wiersz zostaje przy odznace
    // + 3 polach.
    const cap = singleLineCap(narrowMode, nl, this._tight, badge);
    const rightCap = nl === 2 && narrowMode === 'two-line' ? 2 : undefined;
    // Najciaśniej (≤310 px) z odznaką: „+n" ustępuje nazwie. To czysta
    // informacja (pełna lista jest w popupie), a włącznik i odznaka działają.
    const hideMore = badge && nl === 2;
    const single = twoLine ? undefined : this._visibleFields(fields, cap, badge);
    let split = twoLine ? this._splitFields(fields, rightCap, badge) : undefined;
    if (narrowTwo) {
      const withValue = fields.filter((f) => this._fieldHasValue(f));
      split = {
        // Odznaka prowadzi rządek — pola alarmowe za nią byłyby dublem.
        sub: withoutBadgeFields(
          withValue.filter((f) => f !== 'lights'),
          alarmed && this.alarmsCount > 0,
        ),
        right: withValue.filter((f) => f === 'lights'),
        hiddenCount: 0,
      };
    }
    const narrowClass = narrowTwo
      ? 'narrow-two'
      : nl > 0 && narrowMode === 'compact'
      ? `narrow-c${nl}`
      : '';

    return html`
      <div
        class="row ${effectiveActive ? 'active' : ''} ${this.lightsOn > 0 ||
        lightsActive
          ? 'lights-on'
          : ''} ${this.motion ? 'motion-on' : ''} ${alarmed ? 'alerted' : ''} ${rowAnim
          ? `anim-${rowAnim}`
          : ''} ${narrowClass} ${this.offline ? 'offline' : ''}"
        part="room"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        data-preset=${preset}
        data-hover=${hoverEffect}
        style=${styles}
        @click=${this._onClick}
        @keydown=${this._onKey}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerCancel}
        @lostpointercapture=${this._onLostCapture}
      >
        ${preset === 'fill'
          ? html`<span class="fill" aria-hidden="true"></span>`
          : nothing}
        ${preset === 'rail' ? html`<span class="bar" aria-hidden="true"></span>` : nothing}
        ${showIcon
          ? html`<span
              class="iconwrap"
              role=${this.iconTappable ? 'button' : nothing}
              tabindex=${this.iconTappable ? '0' : nothing}
              aria-label=${this.iconTappable
                ? iconActionLabel(this.name, this.iconAction)
                : nothing}
              @click=${this._onIconClick}
              @keydown=${this._onIconKey}
            >
              <ha-icon
                class="icon ${iconAnim ? `icon-anim-${iconAnim}` : ''}"
                aria-hidden="true"
                .icon=${effectiveIcon}
              ></ha-icon>
            </span>`
          : nothing}
        ${twoLine
          ? html`<span class="body">
              ${showName
                ? html`<span class="name">${this.name}</span>`
                : nothing}
              ${split!.sub.length > 0 ||
              (narrowTwo && alarmed && this.alarmsCount > 0)
                ? html`<span class="sub ${narrowTwo ? 'flow' : ''}">
                    ${narrowTwo && alarmed && this.alarmsCount > 0
                      ? this._renderAlarmBadge()
                      : nothing}
                    ${narrowTwo
                      ? split!.sub.map((f) => this._renderField(f))
                      : split!.sub.map((f, i) =>
                          i === 0
                            ? this._renderSubField(f)
                            : html`<span class="dot">·</span>${this._renderSubField(f)}`,
                        )}
                  </span>`
                : nothing}
            </span>`
          : showName
          ? html`<span class="name">${this.name}</span>`
          : html`<span class="name-spacer"></span>`}
        <div class="info">
          ${this.offline
            ? html`<span class="off-pill">offline</span>`
            : nothing}
          ${badge ? this._renderAlarmBadge() : nothing}
          ${(twoLine ? split!.right : single!.shown).map((f) => this._renderField(f))}
          ${!hideMore && (twoLine ? split!.hiddenCount : single!.hiddenCount) > 0
            ? html`<span
                class="field more"
                title="${twoLine ? split!.hiddenCount : single!.hiddenCount} więcej"
                >+${twoLine ? split!.hiddenCount : single!.hiddenCount}</span
              >`
            : nothing}
        </div>
      </div>
    `;
  }

  /**
   * Odznaka ⚠ N — klik otwiera listę sprawców. Ikona = najważniejszy aktywny
   * alarm (woda, dym…): pola alarmowe znikają z rządka, gdy odznaka stoi,
   * więc rodzaj alarmu musi nieść sama odznaka.
   */
  private _renderAlarmBadge(): TemplateResult {
    const top = topAlarmField({
      smoke: this.smokeActive,
      gas: this.gasActive,
      leak: this.leakActive,
      problem: this.problemActive,
    });
    const icon = (top && ALARM_ICONS[top]) ?? 'mdi:alert';
    return html`<button
      class="alarm-badge"
      part="alarm-badge"
      title="Pokaż aktywne alarmy"
      aria-label="Aktywne alarmy: ${this.alarmsCount}. Pokaż listę"
      @click=${this._onAlarmBadge}
      @pointerdown=${(pev: Event) => pev.stopPropagation()}
    >
      <ha-icon .icon=${icon} aria-hidden="true"></ha-icon>
      ${this.alarmsCount}
    </button>`;
  }

  /** Pola sublinii — kompaktowe, wyciszone (temp/wilgotność tekstem, motion ikoną). */

  private _renderSubField(f: TileField): TemplateResult | typeof nothing {
    switch (f) {
      case 'temperature':
        return html`<span class="sub-item">${this.temperature}</span>`;
      case 'humidity':
        return html`<span class="sub-item">${this.humidity}</span>`;
      case 'motion':
        return html`<span class="sub-item motion-sub">
          <ha-icon .icon=${'mdi:motion-sensor'}></ha-icon>
        </span>`;
      default:
        return nothing;
    }
  }

  private _renderField(f: TileField): TemplateResult | typeof nothing {
    switch (f) {
      case 'temperature':
        return html`<span class="field temp">${this.temperature}</span>`;
      case 'humidity':
        return html`<span class="field hum">
          <ha-icon .icon=${'mdi:water-percent'}></ha-icon>
          ${this.humidity}
        </span>`;
      case 'motion':
        return html`<ha-icon
          class="field motion"
          .icon=${'mdi:motion-sensor'}
          title="Ktoś jest w pomieszczeniu"
        ></ha-icon>`;
      case 'lights': {
        if (!this.lightsSwitch) {
          return html`<span class="field lights">
            <ha-icon .icon=${'mdi:lightbulb-on'}></ha-icon>
            ${this.lightsOn}
          </span>`;
        }
        // H4: mini-switch z czystą gałką; licznik na torze, poświata
        // w obu stanach — intensywność z configu. Inline idą tylko krycia
        // warstw (--lt-g1…3), kolor poświaty jest w CSS z tokenu świateł
        // (lights-switch-glow.ts).
        const on = this.lightsOn > 0;
        const glow = lightsSwitchGlowStyle(on, this.lightsGlowOn, this.lightsGlowOff);
        return html`<button
          class="field lights-toggle ${on ? 'on' : ''} ${glow ? 'glow' : ''}"
          style=${glow}
          role="switch"
          aria-checked=${on}
          title=${on
            ? 'Wyłącz wszystkie światła w pomieszczeniu'
            : 'Włącz wszystkie światła w pomieszczeniu'}
          @click=${this._onLightsSwitch}
          @pointerdown=${(pev: Event) => pev.stopPropagation()}
        >
          ${on ? html`<span class="lt-count">${this.lightsOn}</span>` : nothing}
          <span class="lt-knob"></span>
        </button>`;
      }
      case 'windows':
        return html`<span class="field windows">
          <ha-icon .icon=${'mdi:window-open-variant'}></ha-icon>
          ${this.windowsOpen}
        </span>`;
      case 'doors':
        return html`<span class="field doors">
          <ha-icon .icon=${'mdi:door-open'}></ha-icon>
          ${this.doorsOpen}
        </span>`;
      case 'leak':
        return html`<span class="field leak">
          <ha-icon .icon=${'mdi:water-alert'}></ha-icon>
          ${this.leakActive}
        </span>`;
      case 'smoke':
        return html`<span class="field smoke">
          <ha-icon .icon=${'mdi:smoke-detector-variant'}></ha-icon>
          ${this.smokeActive}
        </span>`;
      case 'gas':
        return html`<span class="field gas">
          <ha-icon .icon=${'mdi:gas-cylinder'}></ha-icon>
          ${this.gasActive}
        </span>`;
      case 'problem':
        return html`<span class="field problem">
          <ha-icon .icon=${'mdi:alert-circle-outline'}></ha-icon>
          ${this.problemActive}
        </span>`;
      default:
        return nothing;
    }
  }

  static styles = css`
    :host {
      display: block;
      /* Warstwa tokenów wiersza — jedyne miejsce na hex (instalacja bez
         motywu, bez --error-color). Publiczny pokrętłem pozostaje
         --stratum-chip-leak-color; ten alias tylko zbiera łańcuch fallbacku,
         żeby reguły alarmu nie powtarzały go (i hexa) w każdym miejscu. */
      --stratum-alarm: var(--stratum-chip-leak-color, var(--error-color, #f44336));
      /* Kolor przełącznika świateł (tor, poświata, licznik) — alias o tym
         samym celu co --stratum-alarm. Definiowany tu, na wierszu, a nie
         brany z --stratum-lights karty: nadpisanie
         --stratum-chip-lights-color w card-mod na ha-card musi dojść także
         do poświaty, a token karty rozwiązuje się wyżej, na :host karty. */
      --stratum-row-lights: var(--stratum-chip-lights-color, #ffc107);
      /* Rdzeń poświaty: kolor świateł rozjaśniony w stronę bieli (dawne
         rgba(255,224,130) przy domyślnym bursztynie). */
      --stratum-row-lights-core: color-mix(
        in srgb,
        var(--stratum-row-lights) 55%,
        var(--stratum-ink-tint, #fff)
      );
      /* Licznik na zapalonym torze: ten sam odcień przyciemniony w stronę
         czerni (dawne #2a1c05). Przy domyślnym bursztynie ~8:1. */
      --stratum-row-lights-ink: color-mix(
        in srgb,
        var(--stratum-row-lights) 25%,
        var(--stratum-ink-shade, #000)
      );
    }

    /* ====== BAZA wspólna dla presetów ====== */
    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: var(--stratum-room-row-min-height, 52px);
      transition: background 0.15s ease, border-color 0.15s ease,
        transform 0.12s ease, box-shadow 0.15s ease;
      overflow: hidden;
    }

    .row > *:not(.fill):not(.bar) {
      position: relative;
      z-index: 1;
    }

    :host([clickable]) .row {
      cursor: pointer;
    }

    /* :active wiersza stoi niżej, za regułami hover — patrz „press". */

    :host([icon-tappable]) .iconwrap {
      cursor: pointer;
      /* scale, nie transform: transform stadionu niesie już przesunięcie
         z configu (iconbg-offset), a osobna właściwość składa się z nim
         zamiast je nadpisywać. */
      transition: background 0.15s ease, color 0.15s ease, scale 0.1s ease;
    }

    @media (hover: hover) {
      :host([icon-tappable]) .iconwrap:hover .icon {
        filter: brightness(1.25);
      }
    }

    /* Obrys do środka: wiersz ma overflow: hidden, a stadion ikony stoi
       przy jego krawędzi — obrys na zewnątrz byłby ucięty. */
    :host([icon-tappable]) .iconwrap:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color));
      outline-offset: -2px;
    }

    :host([icon-tappable]) .iconwrap:active {
      scale: 0.94;
    }

    :host([clickable]) .row:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color));
      outline-offset: -2px;
    }

    .iconwrap {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
      transform: translateX(var(--stratum-room-row-iconbg-offset, 0px));
    }

    .icon {
      --mdc-icon-size: var(--stratum-room-row-icon-size, 20px);
      color: var(--stratum-card-room-icon-color, var(--secondary-text-color));
      transform: translateX(var(--stratum-room-row-icon-offset, 0px))
        scale(var(--stratum-room-row-icon-scale, 1));
      transform-origin: center center;
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .name-spacer {
      flex: 1;
    }

    .info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      color: var(--secondary-text-color);
      font-size: 12.5px;
      font-variant-numeric: tabular-nums;
    }

    /* ====== PRESET: fill (default) + pill ====== */
    .row[data-preset='fill'],
    .row[data-preset='pill'] {
      border-radius: var(--stratum-room-row-radius, 999px);
      background: var(--stratum-room-row-bg, rgba(255, 255, 255, 0.045));
      /* Padding tylko z prawej — stadion ikony jest flush z lewą/dolną
         krawędzią. Suwak „Wewnętrzny padding" steruje tą wartością. */
      padding: 0 var(--stratum-room-row-padding, 14px) 0 0;
      min-height: var(--stratum-room-row-min-height, 85px);
      touch-action: pan-y;
    }

    /* Spłaszczony stadion zakotwiczony na dole (jak bubble 100×80/r40):
       wysokość = 4/5 wiersza, szerokość 1.35× wysokości stadionu,
       dolna krawędź flush z dołem pigułki. Górna ćwiartka wiersza
       zostaje „lekka" — fill i nazwa oddychają.
       Tło zawsze neutralne i nieprzezroczyste — fill biegnie od lewej
       krawędzi wiersza i „oblewa" stadion (jak w bubble-card). */
    .row[data-preset='fill'] .iconwrap,
    .row[data-preset='pill'] .iconwrap {
      align-self: flex-end;
      height: calc(
        var(--stratum-room-row-min-height, 85px) * 0.8 *
          var(--stratum-room-row-iconbg-scale, 1)
      );
      width: calc(
        var(--stratum-room-row-min-height, 85px) * 1.08 *
          var(--stratum-room-row-iconbg-scale, 1)
      );
      border-radius: 999px;
      overflow: hidden;
      background: var(--stratum-room-row-iconbg, var(--stratum-surface-well));
    }

    .row[data-preset='fill'] .icon,
    .row[data-preset='pill'] .icon {
      /* Ikona = połowa wysokości stadionu (0.4× wiersza), chyba że user
         ustawił icon_size explicit — wtedy inline var wygrywa. */
      --mdc-icon-size: var(
        --stratum-room-row-icon-size,
        calc(var(--stratum-room-row-min-height, 85px) * 0.4)
      );
    }

    .row[data-preset='fill'] .body .name,
    .row[data-preset='pill'] .body .name,
    .row[data-preset='fill'] > .name,
    .row[data-preset='pill'] > .name {
      font-size: 18px;
      font-weight: 600;
    }

    .row[data-preset='fill'] .info,
    .row[data-preset='pill'] .info {
      font-size: 13px;
    }

    /* Ikony statusów schodzą 25 → 18 px: przy nazwie 18/600 glif ikony
       przestaje być większy niż wysokość wersalika nazwy. Wiersz nadal
       czyta się przez ikony, ale to nazwa prowadzi wzrok. */
    .row[data-preset='fill'] .info .field ha-icon,
    .row[data-preset='pill'] .info .field ha-icon {
      --mdc-icon-size: 18px;
    }

    /* ====== Layout dwuliniowy (fill/pill) ====== */
    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      justify-content: center;
    }

    .body .name {
      flex: none;
    }

    .sub {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
    }

    .sub-item {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }

    .sub .dot {
      opacity: 0.5;
    }

    .sub .motion-sub ha-icon {
      --mdc-icon-size: 14px;
      color: var(--stratum-chip-motion-color, #4caf50);
    }

    /* Tło stadionu NIE przejmuje koloru świateł — zostaje neutralne
       (jak w bubble-card). Kolor sygnalizuje sama ikona + warstwa fill. */
    /* Ikona koloruje się WYŁĄCZNIE gdy świeci światło — kolorem świateł.
       Sama obecność (motion) nie barwi ikony. */
    .row[data-preset='fill'].lights-on .icon,
    .row[data-preset='pill'].lights-on .icon {
      color: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }

    .row[data-preset='fill'].alerted .iconwrap,
    .row[data-preset='pill'].alerted .iconwrap {
      background: color-mix(in srgb, var(--stratum-alarm) 18%, transparent);
    }
    .row[data-preset='fill'].alerted .icon,
    .row[data-preset='pill'].alerted .icon {
      color: var(--stratum-alarm);
    }

    /* fill: warstwa wypełnienia = średnia jasność świateł.
       Zdecydowany blok koloru (jak bubble slider), nie mgławica —
       jednolite 20% + jaśniejszy „cap" na prawej krawędzi jako
       wskaźnik poziomu. */
    .fill {
      position: absolute;
      inset: 0;
      width: var(--stratum-room-row-fill, 0%);
      border-radius: inherit;
      background: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 20%,
        transparent
      );
      box-shadow: inset -2px 0 0
        color-mix(
          in srgb,
          var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 55%,
          transparent
        );
      transition: width 0.3s ease-out;
      pointer-events: none;
    }

    /* W trakcie przeciągania pasek idzie 1:1 za palcem. Z tranzycją 0.3 s
       każda klatka startowała animację od nowa i wypełnienie ciągnęło się
       za palcem jak na gumce. Po puszczeniu tranzycja wraca i wygładza
       ewentualną korektę do stanu z HA. */
    :host([dragging]) .fill {
      transition: none;
    }

    /* Suwak działa we wszystkich presetach — przeglądarka ma zostawić nam
       gest poziomy (pan-y), inaczej przejmuje dotyk i przerywa przeciąganie.
       Bez zaznaczania tekstu, bo przeciąganie myszą zaznaczało nazwę pokoju. */
    :host([slider]) .row {
      touch-action: pan-y;
      -webkit-user-select: none;
      user-select: none;
      /* Bez systemowego menu przytrzymania (iOS) w trakcie przeciągania. */
      -webkit-touch-callout: none;
    }

    /* pill: ring aktywności zamiast wypełnienia */
    .row[data-preset='pill'].active {
      box-shadow: inset 0 0 0 1.5px
        color-mix(in srgb, var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 40%, transparent);
    }
    .row[data-preset='fill'].alerted,
    .row[data-preset='pill'].alerted {
      box-shadow: inset 0 0 0 1.5px
        color-mix(in srgb, var(--stratum-alarm) 50%, transparent);
    }

    /* ====== PRESET: rail (dawny wygląd, zwarty) ====== */
    .row[data-preset='rail'] {
      padding: var(--stratum-room-row-padding, 6px) 8px
        var(--stratum-room-row-padding, 6px) 14px;
      min-height: var(--stratum-room-row-min-height, 48px);
      border-radius: var(--stratum-room-row-radius, 8px);
    }

    .bar {
      position: absolute;
      left: 2px;
      top: 20%;
      bottom: 20%;
      width: 3px;
      border-radius: 3px;
      background: transparent;
      transition: background 0.15s ease;
    }

    .row[data-preset='rail'].active .bar {
      background: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }
    .row[data-preset='rail'].alerted .bar {
      background: var(--stratum-alarm);
    }

    .row[data-preset='rail'] .iconwrap {
      width: calc(34px * var(--stratum-room-row-iconbg-scale, 1));
      height: calc(34px * var(--stratum-room-row-iconbg-scale, 1));
      border-radius: 10px;
      background: var(--stratum-room-row-iconbg, var(--stratum-surface-2));
    }
    .row[data-preset='rail'].lights-on .icon {
      color: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }
    .row[data-preset='rail'].alerted .icon {
      color: var(--stratum-alarm);
    }

    /* ====== PRESET: cards ====== */
    .row[data-preset='cards'] {
      border-radius: var(--stratum-room-row-radius, 14px);
      background: var(--stratum-room-row-bg, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.07));
      padding: var(--stratum-room-row-padding, 8px) 14px;
      min-height: var(--stratum-room-row-min-height, 54px);
    }

    .row[data-preset='cards'].active {
      background: linear-gradient(
          120deg,
          color-mix(in srgb, var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 10%, transparent),
          transparent 55%
        ),
        var(--stratum-room-row-bg, rgba(255, 255, 255, 0.04));
      border-color: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 28%,
        transparent
      );
    }
    .row[data-preset='cards'].alerted {
      border-color: color-mix(in srgb, var(--stratum-alarm) 40%, transparent);
    }

    .row[data-preset='cards'] .iconwrap {
      width: calc(36px * var(--stratum-room-row-iconbg-scale, 1));
      height: calc(36px * var(--stratum-room-row-iconbg-scale, 1));
      border-radius: 11px;
      background: var(--stratum-room-row-iconbg, var(--stratum-surface-2));
    }
    .row[data-preset='cards'].active .iconwrap {
      background: color-mix(
        in srgb,
        var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107)) 16%,
        transparent
      );
    }
    .row[data-preset='cards'].lights-on .icon {
      color: var(--stratum-room-row-active-color, var(--stratum-chip-lights-color, #ffc107));
    }
    .row[data-preset='cards'].alerted .icon {
      color: var(--stratum-alarm);
    }

    /* ====== Wąski dwuliniowy: nazwa u góry, rządek statusów pod nią.
       flex-wrap + max-height + duży row-gap = pola z końca kolejności,
       które się nie mieszczą, wypadają do niewidocznej drugiej linii. */
    .row.narrow-two .body {
      gap: 4px;
      padding: 10px 0;
    }
    .row.narrow-two .sub.flow {
      flex-wrap: wrap;
      column-gap: 9px;
      row-gap: 40px;
      max-height: 26px;
      overflow: hidden;
    }
    .row.narrow-two .sub.flow .field {
      flex-shrink: 0;
      font-size: 12px;
    }
    .row.narrow-two .sub.flow .field ha-icon {
      --mdc-icon-size: 17px;
    }
    .row.narrow-two .sub.flow .alarm-badge {
      flex-shrink: 0;
      padding: 1px 7px;
      font-size: 11px;
    }
    .row.narrow-two .info {
      gap: 8px;
    }

    /* ====== Kompakt na wąskich ekranach (narrow_mode: 'compact') ====== */
    .row.narrow-c1,
    .row.narrow-c2 {
      gap: 7px;
    }
    .row.narrow-c1 .name { font-size: 13px; }
    .row.narrow-c2 .name { font-size: 12.5px; }
    .row.narrow-c1 .info { gap: 6px; font-size: 11.5px; }
    .row.narrow-c2 .info { gap: 5px; font-size: 11px; }
    .row.narrow-c1 .lights-toggle,
    .row.narrow-c2 .lights-toggle {
      transform: scale(0.85);
      transform-origin: right center;
    }
    .row.narrow-c1[data-preset='fill'],
    .row.narrow-c1[data-preset='pill'],
    .row.narrow-c2[data-preset='fill'],
    .row.narrow-c2[data-preset='pill'] {
      padding-right: calc(var(--stratum-room-row-padding, 14px) * 0.6);
    }

    /* ====== Pomieszczenie offline (wszystkie encje unavailable) ====== */
    .row.offline {
      opacity: 0.55;
    }
    .row.offline .iconwrap {
      position: relative;
    }
    .row.offline .iconwrap::after {
      content: "";
      position: absolute;
      left: 24%;
      right: 24%;
      top: 50%;
      height: 2px;
      border-radius: 1px;
      background: rgba(160, 163, 170, 0.85);
      transform: rotate(-40deg);
    }
    .row.offline .info > *:not(.off-pill) {
      display: none;
    }
    .off-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: var(--secondary-text-color);
      background: var(--stratum-surface-3);
      border-radius: 999px;
      padding: 3px 10px;
    }
    .off-pill::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(128, 132, 140, 0.9);
    }

    /* ====== hover ======
       Tylko przy prawdziwym kursorze. Na dotyku :hover zostaje na ostatnio
       tkniętym wierszu, aż palec dotknie czegoś innego — po zamknięciu
       popupu wiersz wisiał podświetlony (a przy „lift" uniesiony z cieniem).
       (hover: hover) pyta o urządzenie, nie o rozmiar — dlatego media
       query, jak prefers-reduced-motion. */
    @media (hover: hover) {
      :host([clickable]) .row[data-hover='subtle']:hover {
        background-color: var(--stratum-card-room-hover, var(--stratum-surface-2));
      }
      :host([clickable]) .row[data-hover='lift']:hover {
        transform: translateY(-1px);
        /* Cień z tokenu „w stronę czerni" (jak stadion i chipy listy),
           nie z literału — motyw może go przemalować. Wiersz żyje zawsze
           w stratum-card albo stratum-room-card, które token definiują. */
        box-shadow: 0 3px 10px color-mix(in srgb, var(--stratum-ink-shade) 14%, transparent);
      }
      :host([clickable]) .row[data-hover='glow']:hover {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 50%, transparent);
      }
    }

    /* ====== press ======
       Za hoverem i z tą samą specyficznością ([data-hover]): wcześniej
       :active stało wyżej i było słabsze niż „lift" — wciśnięty wiersz
       dostawał uniesienie zamiast pomniejszenia, a feedback dotyku znikał. */
    :host([clickable]) .row:active,
    :host([clickable]) .row[data-hover]:active {
      transform: scale(var(--stratum-room-row-press-scale, 0.98));
    }
    /* Wciśnięcie przełącznika, odznaki albo ikony z własną akcją to
       feedback TEJ kontrolki — cały wiersz nie może się wtedy kurczyć, bo
       wygląda, jakby palec trafił w popup. Osobna reguła: przeglądarka bez
       :has() odrzuci tylko ją, a zwykły feedback wiersza zostanie. */
    :host([clickable]) .row[data-hover]:active:has(
        .lights-toggle:active,
        .alarm-badge:active,
        .iconwrap[role='button']:active
      ) {
      transform: none;
    }

    /* ====== Animacje (z reguł warunkowych) ====== */
    .row.anim-pulse { animation: stratum-row-pulse 1.6s ease-in-out infinite; }
    .row.anim-blink { animation: stratum-row-blink 1.4s ease-in-out infinite; }
    .row.anim-shake { animation: stratum-row-shake 0.6s ease-in-out infinite; }
    .row.anim-glow { animation: stratum-row-glow 2.4s ease-in-out infinite; }
    .row.anim-bounce { animation: stratum-row-bounce 1.4s ease-in-out infinite; }

    @keyframes stratum-row-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 45%, transparent);
      }
      50% {
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 0%, transparent);
      }
    }
    @keyframes stratum-row-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes stratum-row-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }
    @keyframes stratum-row-glow {
      0%, 100% { box-shadow: 0 0 4px color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 40%, transparent); }
      50% { box-shadow: 0 0 10px color-mix(in srgb, var(--stratum-room-row-active-color, #ffc107) 60%, transparent); }
    }
    @keyframes stratum-row-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
    }

    .icon.icon-anim-spin { animation: stratum-icon-spin 3s linear infinite; }
    .icon.icon-anim-pulse { animation: stratum-icon-pulse 1.4s ease-in-out infinite; }
    .icon.icon-anim-blink { animation: stratum-row-blink 1.4s ease-in-out infinite; }
    .icon.icon-anim-shake { animation: stratum-row-shake 0.6s ease-in-out infinite; }
    .icon.icon-anim-bounce { animation: stratum-row-bounce 1.2s ease-in-out infinite; }
    .icon.icon-anim-glow { filter: drop-shadow(0 0 4px currentColor); }

    @keyframes stratum-icon-spin {
      from { transform: rotate(0deg) scale(var(--stratum-room-row-icon-scale, 1)); }
      to { transform: rotate(360deg) scale(var(--stratum-room-row-icon-scale, 1)); }
    }
    @keyframes stratum-icon-pulse {
      0%, 100% { transform: scale(var(--stratum-room-row-icon-scale, 1)); }
      50% { transform: scale(calc(var(--stratum-room-row-icon-scale, 1) * 1.2)); }
    }

    @media (prefers-reduced-motion: reduce) {
      .row { transition: none; }
      .fill { transition: none; }
      .row.anim-pulse, .row.anim-blink, .row.anim-shake, .row.anim-glow, .row.anim-bounce,
      .icon.icon-anim-spin, .icon.icon-anim-pulse, .icon.icon-anim-blink,
      .icon.icon-anim-shake, .icon.icon-anim-bounce { animation: none; }
      /* [data-hover] — ta sama specyficzność co reguły hover/press wyżej;
         samo .row:hover przegrywało z „lift" i wiersz dalej skakał. */
      :host([clickable]) .row:hover,
      :host([clickable]) .row:active,
      :host([clickable]) .row[data-hover]:hover,
      :host([clickable]) .row[data-hover]:active { transform: none; }
      :host([icon-tappable]) .iconwrap { transition: none; }
      :host([icon-tappable]) .iconwrap:active { scale: none; }
    }

    /* ====== Pola statusów ====== */
    .field {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .field ha-icon {
      --mdc-icon-size: 18px;
    }

    /* A1: pulsujący badge alarmu — klik otwiera listę sprawców. */
    .alarm-badge {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1.5px solid
        color-mix(in srgb, var(--stratum-alarm) 65%, transparent);
      background: color-mix(in srgb, var(--stratum-alarm) 18%, transparent);
      color: var(--stratum-alarm);
      font: inherit;
      font-size: 12.5px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.12s ease, transform 0.1s ease;
    }
    /* Bez lepkiego hovera na dotyku — jak hover wiersza. */
    @media (hover: hover) {
      .alarm-badge:hover:not(:disabled) {
        background: color-mix(in srgb, var(--stratum-alarm) 28%, transparent);
      }
    }
    .alarm-badge:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color));
      outline-offset: 2px;
    }
    .alarm-badge:active {
      transform: scale(0.96);
    }
    /* Poświata pulsu na osobnej warstwie — animujemy tylko opacity
       (kompozytor), nie box-shadow (przerysowanie w każdej klatce przez cały
       czas trwania alarmu). Patrz też odznaka na belce piętra. */
    .alarm-badge::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      box-shadow: 0 0 8px 3px
        color-mix(in srgb, var(--stratum-alarm) 25%, transparent);
      opacity: 0;
      animation: stratum-alarm-pulse 1.6s ease-in-out infinite;
    }
    .alarm-badge ha-icon {
      --mdc-icon-size: 15px;
    }
    /* Jak wyżej — badge ma ~26 px wysokości i sąsiaduje z przełącznikiem
       świateł; dwa małe cele obok siebie przy krawędzi ekranu. */
    .alarm-badge::after {
      content: '';
      position: absolute;
      inset: -9px -2px;
      border-radius: 999px;
    }
    @keyframes stratum-alarm-pulse {
      0%,
      100% {
        opacity: 0;
      }
      50% {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .alarm-badge::before {
        animation: none;
      }
      .alarm-badge {
        transition: none;
      }
      .alarm-badge:active {
        transform: none;
      }
    }

    /* H4: mini-switch świateł z licznikiem w torze; poświata inline
       (intensywność on/off z configu). */
    .lights-toggle {
      position: relative;
      width: 46px;
      height: 25px;
      border-radius: 999px;
      border: 0;
      padding: 0;
      cursor: pointer;
      background: var(--stratum-surface-4);
      transition: background 0.15s ease, box-shadow 0.2s ease, transform 0.1s ease;
      flex-shrink: 0;
    }
    /* Komplet stanów przełącznika: bez obrysu fokusa klawiatura nie
       widziała, że stoi na przełączniku, a nie na wierszu — a to dwie
       różne akcje (światła vs popup). */
    @media (hover: hover) {
      .lights-toggle:hover {
        filter: brightness(1.08);
      }
    }
    .lights-toggle:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color));
      outline-offset: 2px;
    }
    .lights-toggle:active {
      transform: scale(0.96);
    }
    @media (prefers-reduced-motion: reduce) {
      .lights-toggle {
        transition: none;
      }
      .lights-toggle:active {
        transform: none;
      }
    }
    /* Pole trafienia 48 × 44 bez zmiany wyglądu: sam przełącznik zostaje
       46 × 25, niewidoczny pseudo-element dobiera resztę do progu
       WCAG 2.2 / Apple HIG. Kontrolka leży przy krawędzi ekranu, gdzie
       kciuk jest najmniej precyzyjny, a chybienie otwiera popup. */
    .lights-toggle::after {
      content: '';
      position: absolute;
      inset: -9.5px -1px;
      border-radius: 999px;
    }
    .lights-toggle.on {
      background: var(--stratum-row-lights);
    }
    /* Poświata: krycia warstw z inline --lt-g1…3 (intensywność z configu),
       kolor z tokenów wiersza — przemalowane światła świecą swoim kolorem. */
    .lights-toggle.glow {
      box-shadow:
        0 0 5px 1px color-mix(in srgb, var(--stratum-row-lights-core) var(--lt-g1), transparent),
        0 0 14px 5px color-mix(in srgb, var(--stratum-row-lights) var(--lt-g2), transparent);
    }
    .lights-toggle.on.glow {
      box-shadow:
        0 0 5px 1px color-mix(in srgb, var(--stratum-row-lights-core) var(--lt-g1), transparent),
        0 0 16px 5px color-mix(in srgb, var(--stratum-row-lights) var(--lt-g2), transparent),
        0 0 30px 10px color-mix(in srgb, var(--stratum-row-lights) var(--lt-g3), transparent);
    }
    .lights-toggle .lt-knob {
      position: absolute;
      top: 2.5px;
      left: 2.5px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .lights-toggle.on .lt-knob {
      transform: translateX(21px);
    }
    .lights-toggle .lt-count {
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 12px;
      font-weight: 800;
      color: var(--stratum-row-lights-ink);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .temp {
      font-variant-numeric: tabular-nums;
    }

    .hum {
      color: var(--stratum-field-hum-color, var(--secondary-text-color));
      font-variant-numeric: tabular-nums;
    }

    .temp {
      color: var(--stratum-field-temp-color, inherit);
    }

    .motion {
      --mdc-icon-size: 18px;
      color: var(--stratum-chip-motion-color, #4caf50);
    }

    .lights { color: var(--stratum-chip-lights-color, #ffc107); font-weight: 600; }
    .windows { color: var(--stratum-chip-windows-color, #42a5f5); font-weight: 600; }
    .doors { color: var(--stratum-chip-doors-color, #ba68c8); font-weight: 600; }
    .leak { color: var(--stratum-alarm); font-weight: 600; }
    .smoke { color: var(--stratum-chip-smoke-color, #e53935); font-weight: 600; }
    .gas { color: var(--stratum-chip-gas-color, #ff5722); font-weight: 600; }
    .problem { color: var(--stratum-chip-problem-color, #ff9800); font-weight: 600; }

    .more {
      color: var(--secondary-text-color);
      font-weight: 600;
      background: var(--stratum-surface-2);
      border-radius: 999px;
      padding: 1px 7px;
      font-size: 11px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-room-row': StratumCardRoomRow;
  }
}
