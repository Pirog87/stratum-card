// Zegar etykiet „16s / 5min temu".
//
// Etykiety względnego czasu liczą się z `Date.now()` w trakcie renderu i
// same z siebie nigdy się nie odświeżały — tykały tylko dlatego, że HA
// podmieniał `hass` kilka razy na sekundę i karty renderowały się bez
// przerwy. Odkąd render jest bramkowany (`hass-watch.ts`), ten przypadkowy
// napęd znika, więc komponent z etykietą czasu musi mieć własny zegar.
//
// Zegar jest leniwy: `ago()` zgłasza tu wiek, który właśnie wypisał, a
// kontroler po renderze planuje JEDNO przebudzenie na moment, w którym
// najmłodsza etykieta zmieni tekst (co sekundę poniżej minuty, potem co
// minutę). Komponent bez etykiet czasu nie dostaje żadnego timera.

import type { ReactiveController, ReactiveControllerHost } from 'lit';

let youngest = Number.POSITIVE_INFINITY;

/** Wołane przez `ago()` — zapamiętuje najmłodszy wiek z bieżącego renderu. */
export function noteAge(seconds: number): void {
  if (seconds < youngest) youngest = seconds;
}

/**
 * Za ile milisekund etykieta o danym wieku zmieni tekst. Poniżej minuty
 * pokazujemy sekundy, poniżej godziny minuty, dalej godziny i dni — dla
 * tych ostatnich wystarczy budzić się raz na minutę.
 */
export function nextTickMs(ageSeconds: number): number {
  if (ageSeconds < 60) return 1000;
  if (ageSeconds < 3600) {
    const toNextMinute = 60 - (ageSeconds % 60);
    return Math.max(1000, Math.ceil(toNextMinute * 1000) + 50);
  }
  return 60_000;
}

export class AgoTicker implements ReactiveController {
  private _timer?: number;

  constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  /** Przed renderem: zeruj sondę, żeby zebrać tylko etykiety tego hosta. */
  public hostUpdate(): void {
    youngest = Number.POSITIVE_INFINITY;
  }

  /**
   * Po renderze: render Lita jest synchroniczny, a dzieci aktualizują się w
   * osobnych mikrozadaniach, więc między `hostUpdate` a `hostUpdated` sondę
   * mogły ruszyć wyłącznie etykiety tego komponentu.
   */
  public hostUpdated(): void {
    const age = youngest;
    youngest = Number.POSITIVE_INFINITY;
    this._clear();
    if (!Number.isFinite(age)) return;
    this._timer = window.setTimeout(() => {
      this._timer = undefined;
      // Karta w tle (wygaszony ekran, inna zakładka) nie renderuje — po
      // powrocie pierwszy `hass` albo `visibilitychange` i tak ją odświeży.
      if (typeof document !== 'undefined' && document.hidden) {
        this._waitVisible();
        return;
      }
      this._host.requestUpdate();
    }, nextTickMs(age));
  }

  public hostDisconnected(): void {
    this._clear();
    this._stopWaiting();
  }

  private _onVisible = (): void => {
    if (document.hidden) return;
    this._stopWaiting();
    this._host.requestUpdate();
  };

  private _waiting = false;

  private _waitVisible(): void {
    if (this._waiting) return;
    this._waiting = true;
    document.addEventListener('visibilitychange', this._onVisible);
  }

  private _stopWaiting(): void {
    if (!this._waiting) return;
    this._waiting = false;
    document.removeEventListener('visibilitychange', this._onVisible);
  }

  private _clear(): void {
    if (this._timer !== undefined) {
      window.clearTimeout(this._timer);
      this._timer = undefined;
    }
  }
}
