// Live rendering Jinja2 template przez HA WebSocket.
//
// Subscribe-model: HA wysyła `render_template` z aktualnym wynikiem za każdym
// razem gdy któryś z listenowanych bytów się zmieni. Cachujemy wynik per
// template string + entity context; unsubscribe przy odmontowaniu.

import type { HomeAssistant } from './types.js';

interface TemplateResultMessage {
  result: string;
}

export class TemplateRenderer {
  private _hass?: HomeAssistant;
  private _subscriptions = new Map<string, () => void>();
  private _results = new Map<string, string>();
  private _onUpdate: () => void;
  private _pending = new Set<string>();
  private _gen = 0;
  private _retryTimer?: ReturnType<typeof setTimeout>;

  constructor(onUpdate: () => void) {
    this._onUpdate = onUpdate;
  }

  setHass(hass: HomeAssistant | undefined): void {
    this._hass = hass;
  }

  /** Zwraca ostatni wyrenderowany wynik (pusty string jeśli jeszcze nie ma). */
  get(template: string): string {
    return this._results.get(template) ?? '';
  }

  /**
   * Dodaje subskrypcję, jeśli jeszcze nie ma dla tego template-u. Można wołać
   * przy każdym renderze — idempotentne.
   */
  subscribe(template: string): void {
    if (
      !this._hass?.connection ||
      this._subscriptions.has(template) ||
      this._pending.has(template)
    ) {
      return;
    }
    const key = template;
    // Karta potrafi wrócić do DOM po `destroy()` (HA przepina elementy), więc
    // zamiast flagi „zniszczony" porównujemy numer pokolenia.
    const gen = this._gen;
    // Zanim HA potwierdzi subskrypcję mija chwila; bez tego znacznika każdy
    // render w tym oknie otwierał kolejną, a nadpisane uchwyty wyciekały.
    this._pending.add(key);
    void this._hass.connection
      .subscribeMessage<TemplateResultMessage>(
        (msg) => {
          if (gen !== this._gen) return;
          if (this._results.get(key) !== msg.result) {
            this._results.set(key, msg.result);
            this._onUpdate();
          }
        },
        { type: 'render_template', template },
      )
      .then((unsub) => {
        if (gen !== this._gen) {
          // Karta zniknęła, zanim przyszło potwierdzenie — zwolnij od razu.
          try { unsub(); } catch { /* best effort */ }
          return;
        }
        this._pending.delete(key);
        this._subscriptions.set(key, unsub);
      })
      .catch(() => {
        if (gen !== this._gen) return;
        this._pending.delete(key);
        // Połączenie mogło nie być gotowe. Dawniej „spróbuje przy kolejnym
        // renderze" działało samo, bo karta renderowała się bez przerwy;
        // z bramką renderu musimy o ponowienie poprosić jawnie.
        this._retryTimer ??= setTimeout(() => {
          this._retryTimer = undefined;
          this._onUpdate();
        }, 3000);
      });
  }

  /** Usuwa wszystkie subskrypcje — wołać z disconnectedCallback. */
  destroy(): void {
    this._gen++;
    if (this._retryTimer !== undefined) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    for (const unsub of this._subscriptions.values()) {
      try { unsub(); } catch { /* best effort */ }
    }
    this._subscriptions.clear();
    this._pending.clear();
    this._results.clear();
  }
}
