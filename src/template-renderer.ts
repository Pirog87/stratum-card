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
    if (!this._hass?.connection || this._subscriptions.has(template)) return;
    const key = template;
    void this._hass.connection
      .subscribeMessage<TemplateResultMessage>(
        (msg) => {
          if (this._results.get(key) !== msg.result) {
            this._results.set(key, msg.result);
            this._onUpdate();
          }
        },
        { type: 'render_template', template },
      )
      .then((unsub) => {
        this._subscriptions.set(key, unsub);
      })
      .catch(() => {
        // connection może nie być gotowe — zostaw, spróbuje przy kolejnym renderze
      });
  }

  /** Usuwa wszystkie subskrypcje — wołać z disconnectedCallback. */
  destroy(): void {
    for (const unsub of this._subscriptions.values()) {
      try { unsub(); } catch { /* best effort */ }
    }
    this._subscriptions.clear();
    this._results.clear();
  }
}
