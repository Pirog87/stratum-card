// Escape dla warstw Stratum (popup pokoju, lista chipa) — jeden słuchacz,
// reaguje tylko najwyższa warstwa.
//
// Dawniej każda warstwa wieszała własny keydown na `document`. Przy liście
// chipa otwartej nad popupem pokoju Escape zamykał oba naraz (stopPropagation
// na document nie zatrzymuje innych słuchaczy tego samego węzła), a Escape
// w more-info HA zamykał more-info i do tego popup Stratum pod spodem.
// Teraz warstwy rejestrują się na wspólnym stosie (singleton modułu — jeden
// bundle, więc wspólny dla wszystkich kart na widoku), a Escape trafia
// wyłącznie do szczytu stosu.

export type EscapeHandler = () => void;

/** Minimalny kształt zdarzenia potrzebny do decyzji — testowalny bez DOM. */
export interface EscapeEventLike {
  key: string;
  defaultPrevented: boolean;
  /** `localName` kolejnych węzłów z `composedPath()`. */
  pathNames: readonly string[];
}

/**
 * Czy zdarzenie przyszło z wnętrza cudzego dialogu (more-info HA,
 * ha-dialog, ha-md-dialog, ha-wa-dialog, natywny <dialog>). Nasze popupy
 * to zwykłe elementy z role="dialog" — żaden nie ma takiej nazwy tagu,
 * więc nie łapiemy się sami.
 */
export function isFromForeignDialog(pathNames: readonly string[]): boolean {
  return pathNames.some((n) => n === 'dialog' || n.endsWith('-dialog'));
}

/** Czy Escape ma trafić do warstw Stratum. */
export function shouldHandleEscape(ev: EscapeEventLike): boolean {
  if (ev.key !== 'Escape') return false;
  // Ktoś już obsłużył (np. pole tekstowe czyści wpis) — nie dublujemy.
  if (ev.defaultPrevented) return false;
  return !isFromForeignDialog(ev.pathNames);
}

export class EscapeLayers {
  private _stack: { handler: EscapeHandler }[] = [];

  public get size(): number {
    return this._stack.length;
  }

  /** Dokłada warstwę na szczyt. Zwraca funkcję zdejmującą tę warstwę. */
  public push(handler: EscapeHandler): () => void {
    const layer = { handler };
    this._stack.push(layer);
    return () => {
      // Zdejmujemy po tożsamości, nie ze szczytu — warstwa pod spodem może
      // zniknąć pierwsza (np. disconnect karty przy otwartej liście).
      const i = this._stack.indexOf(layer);
      if (i >= 0) this._stack.splice(i, 1);
    };
  }

  /** Wywołuje handler najwyższej warstwy. Zwraca true, gdy obsłużono. */
  public handle(ev: EscapeEventLike): boolean {
    if (this._stack.length === 0 || !shouldHandleEscape(ev)) return false;
    this._stack[this._stack.length - 1].handler();
    return true;
  }
}

const layers = new EscapeLayers();

const onKeydown = (ev: KeyboardEvent): void => {
  if (ev.key !== 'Escape') return;
  const pathNames = ev
    .composedPath()
    .map((n) => (n as Element).localName)
    .filter((n): n is string => typeof n === 'string');
  if (layers.handle({ key: ev.key, defaultPrevented: ev.defaultPrevented, pathNames })) {
    ev.stopPropagation();
  }
};

/**
 * Rejestruje warstwę Stratum dla Escape. Słuchacz na `document` istnieje
 * tylko, gdy jest co najmniej jedna warstwa.
 */
export function pushEscapeLayer(handler: EscapeHandler): () => void {
  if (layers.size === 0) document.addEventListener('keydown', onKeydown);
  const release = layers.push(handler);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
    if (layers.size === 0) document.removeEventListener('keydown', onKeydown);
  };
}
