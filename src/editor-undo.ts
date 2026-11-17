// „Cofnij" po usunięciu elementu listy w edytorze (chipy, sekcje).
//
// Dlaczego cofanie, a nie dialog „Na pewno?": na telefonie kosz stoi tuż
// obok ołówka i chybienie zdarza się często — potwierdzenie przy każdym
// zamierzonym usunięciu męczy, a cofnięcie kosztuje jeden tap tylko wtedy,
// gdy faktycznie się pomyliliśmy. Wcześniej jedynym ratunkiem było
// anulowanie całego dialogu edycji karty.
//
// Kontroler trzyma tylko OSTATNIE usunięcie: kolejne zastępuje poprzednie.

import { html, nothing, type ReactiveController, type ReactiveControllerHost, type TemplateResult } from 'lit';
import { localize, type LangSource } from './localize/localize.js';

/** Czas na cofnięcie — dość długi, żeby zdążyć przeczytać i trafić palcem. */
const UNDO_TIMEOUT_MS = 8000;

interface PendingUndo {
  label: string;
  undo: () => void;
}

export class EditorUndoController implements ReactiveController {
  private _pending?: PendingUndo;
  private _timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  get pending(): PendingUndo | undefined {
    return this._pending;
  }

  /** Proponuje cofnięcie (np. po usunięciu „Światła"). */
  offer(label: string, undo: () => void): void {
    this._clearTimer();
    this._pending = { label, undo };
    this._timer = setTimeout(() => this.dismiss(), UNDO_TIMEOUT_MS);
    this._host.requestUpdate();
  }

  run(): void {
    const p = this._pending;
    this.dismiss();
    p?.undo();
  }

  dismiss(): void {
    this._clearTimer();
    if (!this._pending) return;
    this._pending = undefined;
    this._host.requestUpdate();
  }

  hostDisconnected(): void {
    // Edytor zamknięty — cofnięcie do nieistniejącego widoku nie ma sensu,
    // a wiszący timer trzymałby referencję do hosta.
    this._clearTimer();
    this._pending = undefined;
  }

  private _clearTimer(): void {
    if (this._timer !== undefined) clearTimeout(this._timer);
    this._timer = undefined;
  }
}

/**
 * Pasek „Usunięto X · Cofnij". Region `role="status"` renderujemy ZAWSZE
 * (pusty nie zajmuje miejsca) — czytniki ekranu ogłaszają zmianę treści
 * istniejącego regionu, a regionu wstawionego razem z treścią często nie.
 * Fokus zostaje tam, gdzie był. Style: `.stratum-undo-bar` w
 * editor-shared-styles.
 */
export function renderUndoBar(ctrl: EditorUndoController, lang?: LangSource): TemplateResult {
  const p = ctrl.pending;
  return html`<div role="status">
    ${p
      ? html`<div class="stratum-undo-bar">
          <ha-icon .icon=${'mdi:delete-outline'} aria-hidden="true"></ha-icon>
          <span class="stratum-undo-text"
            >${localize(lang, 'undo.removed', { label: p.label })}</span
          >
          <button type="button" class="stratum-undo-btn" @click=${() => ctrl.run()}>
            <ha-icon .icon=${'mdi:undo'} aria-hidden="true"></ha-icon>
            ${localize(lang, 'undo.undo')}
          </button>
        </div>`
      : nothing}
  </div>`;
}
