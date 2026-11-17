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
  // Ścieżka zdarzenia idzie od elementu najgłębszego na zewnątrz. Dialog
  // jest „obcy" tylko wtedy, gdy leży GŁĘBIEJ niż warstwa Stratum (more-info
  // otwarte nad popupem). Gdy cała karta siedzi w dialogu — podgląd edytora
  // HA, popup browser_mod — dialog jest dalej niż element Stratum i Escape
  // ma zamykać nasz popup, a nie przepadać.
  for (const n of pathNames) {
    if (n.startsWith('stratum-')) return false;
    if (isDialogName(n)) return true;
  }
  return false;
}

/**
 * Czy karta siedzi w cudzym dialogu (podgląd edytora HA, popup
 * browser_mod): dialog leży na ścieżce DALEJ niż element Stratum.
 */
export function isHostedInDialog(pathNames: readonly string[]): boolean {
  const i = pathNames.findIndex((n) => n.startsWith('stratum-'));
  if (i < 0) return false;
  return pathNames.slice(i + 1).some(isDialogName);
}

/**
 * Gdzie łapiemy Escape.
 *
 * - `capture` (na document): karta w dialogu-gospodarzu i fokus w warstwie
 *   Stratum. Dialog HA łapie Escape sam — mwc ha-dialog słuchaczem keydown
 *   na document (zarejestrowanym wcześniej niż nasz, więc w bubble byłby
 *   pierwszy), a dialogi na natywnym <dialog> (ha-md-dialog, ha-wa-dialog)
 *   domyślną akcją klawisza. W bubble Escape zamykał nasz popup ORAZ cały
 *   dialog-gospodarz. W capture jesteśmy przed nimi, a stopPropagation +
 *   preventDefault zatrzymują oba mechanizmy. Capture wolno tu, bo fokus
 *   jest w NASZYM drzewie — nie zabieramy klawisza cudzemu polu.
 *   To samo, gdy fokus jest „nigdzie" (body): nie ma pola, które mogłoby
 *   chcieć Escape, a popup Stratum jest najwyższą warstwą.
 * - `host` (bubble na samym elemencie dialogu-gospodarza): karta w dialogu,
 *   fokus poza Stratum, na innym elemencie gospodarza (popup nie ma pułapki
 *   fokusu, Tab wychodzi do formularza edytora). Capture zabierałby Escape
 *   combo-boxowi, pickerowi czy wyszukiwarce edytora kodu — zamykał się
 *   popup zamiast ich listy. W bubble na gospodarzu pole dostaje klawisz
 *   pierwsze (stopPropagation albo defaultPrevented = obsłużone, nie
 *   ruszamy), a my nadal jesteśmy przed słuchaczem mwc na document
 *   i przed domyślną akcją natywnego <dialog>.
 * - `bubble` (na document): zwykły dashboard, jak dotąd.
 *
 * `pathNames` to ścieżka z wyciętymi gospodarzami, `hosted` — czy karta
 * najwyższej warstwy ma dialog-gospodarza.
 */
export function escapePhase(
  pathNames: readonly string[],
  hosted = false,
): 'capture' | 'host' | 'bubble' {
  if (pathNames.some((n) => n.startsWith('stratum-'))) {
    return hosted || isHostedInDialog(pathNames) ? 'capture' : 'bubble';
  }
  if (!hosted) return 'bubble';
  return pathNames.length === 0 || pathNames[0] === 'body' || pathNames[0] === 'html'
    ? 'capture'
    : 'host';
}

/** Nazwa tagu dialogu (HA, mwc, natywny <dialog>). */
export function isDialogName(name: string): boolean {
  return name === 'dialog' || name.endsWith('-dialog');
}

/** Czy Escape ma trafić do warstw Stratum. */
export function shouldHandleEscape(ev: EscapeEventLike): boolean {
  if (ev.key !== 'Escape') return false;
  // Ktoś już obsłużył (np. pole tekstowe czyści wpis) — nie dublujemy.
  if (ev.defaultPrevented) return false;
  return !isFromForeignDialog(ev.pathNames);
}

export class EscapeLayers<H = unknown> {
  private _stack: { handler: EscapeHandler; host?: H }[] = [];

  public get size(): number {
    return this._stack.length;
  }

  /** Element, który otworzył najwyższą warstwę (undefined = brak). */
  public get topHost(): H | undefined {
    return this._stack[this._stack.length - 1]?.host;
  }

  /** Dokłada warstwę na szczyt. Zwraca funkcję zdejmującą tę warstwę. */
  public push(handler: EscapeHandler, host?: H): () => void {
    const layer = { handler, host };
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

const layers = new EscapeLayers<Element>();

/**
 * Dialogi, w których siedzi element (przodkowie w drzewie złożonym — przez
 * sloty i granice shadow DOM). To dialogi-GOSPODARZE karty, nie obce.
 */
function hostDialogsOf(el: Element | undefined): Set<EventTarget> {
  const found = new Set<EventTarget>();
  let node: Node | null | undefined = el;
  while (node) {
    if (node instanceof Element && isDialogName(node.localName)) found.add(node);
    node =
      (node instanceof Element && node.assignedSlot) ||
      node.parentNode ||
      (node instanceof ShadowRoot ? node.host : null);
  }
  return found;
}

const makeKeydown =
  (phase: 'capture' | 'host' | 'bubble') =>
  (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    // Fokus mógł wyjść z popupu na inny element dialogu-gospodarza (przycisk
    // w podglądzie edytora) — wtedy na ścieżce nie ma węzła stratum-*
    // i isHostedInDialog nic nie widzi. Dlatego gospodarzy bierzemy z
    // drzewa karty, która otworzyła warstwę, i wycinamy ich ze ścieżki:
    // nie są „obcym dialogiem nad popupem". Bez tego Escape zamykał cały
    // dialog-gospodarz, a popup Stratum i jego strażnik historii zostawały.
    const hosts = hostDialogsOf(layers.topHost);
    const pathNames = ev
      .composedPath()
      .filter((n) => !hosts.has(n))
      .map((n) => (n as Element).localName)
      .filter((n): n is string => typeof n === 'string');
    if (escapePhase(pathNames, hosts.size > 0) !== phase) return;
    // Słuchacz gospodarza mógł zostać po warstwie spod spodu z innej karty —
    // reagujemy tylko na gospodarzach karty najwyższej warstwy.
    if (phase === 'host' && (!ev.currentTarget || !hosts.has(ev.currentTarget))) return;
    if (layers.handle({ key: ev.key, defaultPrevented: ev.defaultPrevented, pathNames })) {
      ev.stopPropagation();
      // Natywny <dialog> nad kartą nie dostaje wtedy „cancel".
      ev.preventDefault();
    }
  };
const onKeydownCapture = makeKeydown('capture');
const onKeydownHost = makeKeydown('host');
const onKeydown = makeKeydown('bubble');

// Słuchacze bubble na dialogach-gospodarzach, liczone referencjami — dwie
// warstwy z tej samej karty (popup + lista chipa) dzielą gospodarza.
const hostListeners = new Map<EventTarget, number>();

function retainHosts(dialogs: Set<EventTarget>): void {
  for (const d of dialogs) {
    const n = hostListeners.get(d) ?? 0;
    if (n === 0) d.addEventListener('keydown', onKeydownHost as EventListener);
    hostListeners.set(d, n + 1);
  }
}

function releaseHosts(dialogs: Set<EventTarget>): void {
  for (const d of dialogs) {
    const n = hostListeners.get(d) ?? 0;
    if (n <= 1) {
      d.removeEventListener('keydown', onKeydownHost as EventListener);
      hostListeners.delete(d);
    } else {
      hostListeners.set(d, n - 1);
    }
  }
}

/**
 * Rejestruje warstwę Stratum dla Escape. Słuchacze na `document` istnieją
 * tylko, gdy jest co najmniej jedna warstwa; słuchacze na dialogach-
 * gospodarzach — tylko, gdy warstwę otworzyła karta siedząca w dialogu.
 */
export function pushEscapeLayer(handler: EscapeHandler, host?: Element): () => void {
  if (layers.size === 0) {
    document.addEventListener('keydown', onKeydownCapture, true);
    document.addEventListener('keydown', onKeydown);
  }
  // Gospodarzy liczymy raz, przy otwarciu: karta nie przenosi się między
  // dialogami przy otwartym popupie, a disconnect i tak zdejmuje warstwę.
  const dialogs = hostDialogsOf(host);
  retainHosts(dialogs);
  const release = layers.push(handler, host);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
    releaseHosts(dialogs);
    if (layers.size === 0) {
      document.removeEventListener('keydown', onKeydownCapture, true);
      document.removeEventListener('keydown', onKeydown);
    }
  };
}
