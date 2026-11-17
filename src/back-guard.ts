// Strażnik przycisku „wstecz" dla popupów Stratum — czysta logika decyzji.
//
// Popup pokoju i lista chipa wypychają po wpisie historii, żeby Android
// „wstecz" zamykał popup zamiast opuszczać widok (jak natywne dialogi HA).
// Kłopot: HA robi z historią to samo. Otwarcie more-info to replaceState
// (nadpisuje NASZ wpis) + pushState({dialog, open:true}), a zamknięcie (×,
// Escape, wstecz) to history.back(). Dawny handler reagował na każdy
// popstate, więc zamknięcie more-info zamykało też listę pod spodem —
// psuło to główny scenariusz „sprawdź, popraw, wróć".
//
// Stąd decyzja po POZYCJI w historii, nie po stanie wpisu:
// - Navigation API (Chromium, Android WebView, nowe Safari/Firefox) daje
//   indeks bieżącego wpisu. replaceState HA indeksu nie zmienia, więc pop
//   z more-info ląduje dokładnie na indeksie naszego strażnika i jest
//   ignorowany; prawdziwe „wstecz" schodzi poniżej i zamyka popup.
// - Bez Navigation API liczymy dialogi HA otwarte NAD naszym popupem
//   (zdarzenia hass-more-info / show-dialog wychodzące z karty). Pop
//   z ustawionym `state.dialog`, dopóki licznik > 0, należy do dialogu HA.
//   Nigdy nie ignorujemy popa tylko dlatego, że stan ma `dialog` — HA
//   zostawia `{dialog, open:false}` na wpisie dashboardu po każdym more-info
//   i taka heurystyka blokowałaby zwykłe „wstecz" do końca sesji.

// 'room-chip' to lista chipa otwarta przez kartę pokoju WEWNĄTRZ popupu
// pokoju. Karta pokoju nie zna historii — prosi kartę piętra o strażnika
// zdarzeniem i podaje własne zamknięcie (`close`). Bez tego „wstecz" przy
// otwartej liście zdejmowało strażnika popupu i zamykało cały popup,
// choć Escape zamykał tylko listę.
export type GuardKind = 'room' | 'chip' | 'room-chip';

export interface GuardEntry {
  kind: GuardKind;
  /** Indeks wpisu historii z Navigation API; null = API niedostępne. */
  index: number | null;
  /** Zamknięcie warstwy, której stanu karta piętra nie trzyma ('room-chip'). */
  close?: () => void;
}

/** Stan wpisu historii, który wypycha strażnik. */
export const GUARD_STATE = { stratum: true } as const;

/** Czy wpis historii to nasz strażnik (popup Stratum na szczycie). */
export function isGuardState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { stratum?: unknown }).stratum === true
  );
}

/**
 * Czy wpis historii to zamknięty dialog HA (`{dialog, open:false}`). HA
 * nadpisuje tak bieżący wpis przy KAŻDYM otwarciu more-info — także wpis
 * naszego strażnika, gdy more-info otwarto z wnętrza popupu.
 */
function isClosedDialogState(state: unknown): boolean {
  return stateHasDialog(state) && (state as { open?: unknown }).open === false;
}

/**
 * Czy bieżący wpis historii to strażnik żywego popupu Stratum.
 *
 * Decydujemy ze stanu kart, nie z `history.state`: HA przy otwarciu
 * more-info robi replaceState({dialog, open:false}) na bieżącym wpisie,
 * więc po pierwszym more-info z popupu wpis strażnika nie wyglądał już
 * na strażnika i navigate wracało do pushState — martwy krok w historii.
 * - Z Navigation API: któryś żywy strażnik ma indeks bieżącego wpisu
 *   (replaceState indeksu nie zmienia).
 * - Bez API: jest żywy strażnik, a wpis to nasz stan albo ślad more-info
 *   po zamknięciu. Navigate z wnętrza popupu odpala się tylko, gdy popup
 *   jest na wierzchu — dialog HA nad nim zasłoniłby kafel.
 *
 * @param live         strażnicy otwartych popupów ze wszystkich kart
 * @param currentIndex indeks bieżącego wpisu (null bez Navigation API)
 * @param state        `history.state`
 */
export function isGuardOnTop(
  live: readonly GuardEntry[],
  currentIndex: number | null,
  state: unknown,
): boolean {
  if (live.length === 0) return false;
  if (currentIndex !== null && live.some((g) => g.index !== null)) {
    return live.some((g) => g.index === currentIndex);
  }
  return isGuardState(state) || isClosedDialogState(state);
}

/**
 * Czy navigate opuszcza bieżący widok — inna ścieżka (pathname). Sam hash
 * (`#salon` — pop-up Bubble Card) albo sama query zostają na widoku.
 * Nieparsowalny adres traktujemy jak pozostanie (bezpieczny push).
 */
export function leavesView(fromHref: string, toPath: string): boolean {
  try {
    return new URL(toPath, fromHref).pathname !== new URL(fromHref).pathname;
  } catch {
    return false;
  }
}

/**
 * Akcja navigate NA INNY WIDOK przy strażniku na szczycie historii
 * NADPISUJE jego wpis zamiast dokładać nowy. Przejście na inny widok
 * odpina kartę (popup znika razem z nią), a osierocony wpis strażnika
 * zostawał pod nowym widokiem: pierwsze „wstecz" wracało na ten sam adres
 * i wyglądało, jakby nic się nie stało — trzeba było wciskać drugi raz.
 * Po nadpisaniu jedno „wstecz" wraca na widok, z którego otwarto popup.
 *
 * Navigate w obrębie widoku (hash, query) zawsze dokłada wpis: to zwykle
 * KOLEJNA warstwa nad popupem (pop-up Bubble Card na `#salon`). Gdyby
 * nadpisać strażnika, pierwsze „wstecz" zamknęłoby obie warstwy naraz,
 * a drugie wyrzuciło z widoku. Z pushem „wstecz" zdejmuje je po kolei.
 */
export function navigateMode(ctx: {
  guardOnTop: boolean;
  fromHref: string;
  toPath: string;
}): 'push' | 'replace' {
  return ctx.guardOnTop && leavesView(ctx.fromHref, ctx.toPath) ? 'replace' : 'push';
}

/** Indeks bieżącego wpisu historii albo null bez Navigation API. */
export function currentHistoryIndex(): number | null {
  const nav = (
    globalThis as unknown as {
      navigation?: { currentEntry?: { index: number } | null };
    }
  ).navigation;
  const idx = nav?.currentEntry?.index;
  return typeof idx === 'number' && idx >= 0 ? idx : null;
}

// Rejestr żywych strażników — singleton modułu (jeden bundle, wspólny dla
// wszystkich kart na widoku). Akcja navigate (tap-action.ts) nie wie, z
// której karty przyszła, a musi wiedzieć, czy szczyt historii to strażnik.
// Karta rejestruje źródło przy pierwszym strażniku i wyrejestrowuje przy
// ostatnim / odpięciu — rejestr nie trzyma kopii, więc się nie rozjedzie.
const guardSources = new Set<() => readonly GuardEntry[]>();

/** Rejestruje źródło strażników karty. Zwraca wyrejestrowanie. */
export function registerGuardSource(source: () => readonly GuardEntry[]): () => void {
  guardSources.add(source);
  return () => {
    guardSources.delete(source);
  };
}

/** Strażnicy wszystkich zarejestrowanych kart. */
export function liveGuards(): GuardEntry[] {
  const all: GuardEntry[] = [];
  for (const source of guardSources) all.push(...source());
  return all;
}

/** Warstwy zagnieżdżone: dziecko → rodzic, z którym się zamyka. */
const NESTED_IN: Partial<Record<GuardKind, GuardKind>> = { 'room-chip': 'room' };

export type ConsumePlan =
  /** history.go(-steps) — popstate zamknie warstwę (i jej dzieci nad nią). */
  | { kind: 'back'; steps: number }
  /** Strażnik nie na szczycie — tylko wyjąć ze stosu, historii nie ruszać. */
  | { kind: 'drop'; at: number }
  | { kind: 'none' };

/**
 * Programowe zamknięcie (×, Escape, tło) warstwy `kind`. Cofamy historię,
 * gdy nad strażnikiem leżą wyłącznie jego dzieci — × popupu przy otwartej
 * liście karty pokoju cofa o dwa wpisy i zamyka obie warstwy. Dawniej
 * strażnik popupu nie był na szczycie, więc wypadał ze stosu bez cofnięcia
 * i w historii zostawały martwe wpisy („wstecz" bez widocznego efektu).
 * Gdy nad strażnikiem leży coś obcego, cofnięcie zamknęłoby nie tę
 * warstwę — wtedy tylko „drop" (zostaje wpis, mniejsze zło).
 */
export function planConsume(stack: readonly GuardEntry[], kind: GuardKind): ConsumePlan {
  let at = -1;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].kind === kind) {
      at = i;
      break;
    }
  }
  if (at < 0) return { kind: 'none' };
  const above = stack.slice(at + 1);
  if (above.every((g) => NESTED_IN[g.kind] === kind)) {
    return { kind: 'back', steps: stack.length - at };
  }
  return { kind: 'drop', at };
}

export interface PopDecision {
  /** Ile strażników ze szczytu stosu zdjąć (i zamknąć ich popupy). */
  pop: number;
  /** Nowa wartość licznika dialogów HA nad popupem (tryb zapasowy). */
  dialogsAbove: number;
}

/**
 * Rozstrzyga, które popupy zamyka dany popstate.
 *
 * @param stack        strażnicy od najstarszego do najnowszego
 * @param currentIndex indeks bieżącego wpisu po popie (null bez Navigation API)
 * @param dialogsAbove ile dialogów HA otwarto nad popupem (tryb zapasowy)
 * @param stateHasDialog czy `event.state` ma pole `dialog` (wpis HA)
 * @param selfBack     pop wywołany naszym cofnięciem (×, Escape, tło): ile
 *                     strażników zdejmuje (true = 1; false/0 = pop obcy)
 */
export function decidePopState(
  stack: readonly GuardEntry[],
  currentIndex: number | null,
  dialogsAbove: number,
  stateHasDialog: boolean,
  selfBack: number | boolean = false,
): PopDecision {
  if (stack.length === 0) return { pop: 0, dialogsAbove: 0 };
  const own = Math.min(stack.length, Number(selfBack));
  const top = stack[stack.length - 1];

  if (currentIndex !== null && top.index !== null) {
    // Zdejmujemy z góry wszystko, co leży powyżej bieżącej pozycji —
    // history.go(-2) albo szybkie podwójne „wstecz" zamyka oba poziomy.
    // Pop na indeks równy strażnikowi (powrót z more-info) nic nie zamyka.
    let pop = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      const idx = stack[i].index;
      if (idx === null || idx <= currentIndex) break;
      pop++;
    }
    // × zawsze zamyka (tyle warstw, o ile cofnęliśmy) — nawet gdy ktoś
    // dopisał wpis nad naszym strażnikiem i cofnięcie wylądowało nad nim.
    if (pop < own) pop = own;
    return { pop, dialogsAbove };
  }

  // Nasze własne cofnięcie zawsze zamyka szczyt — inaczej rozjechany licznik
  // dialogów zablokowałby × (wpis dashboardu też bywa `{dialog, open:false}`).
  if (own > 0) return { pop: own, dialogsAbove: 0 };

  if (dialogsAbove > 0 && stateHasDialog) {
    // Zamknięcie dialogu HA otwartego nad naszym popupem — popup zostaje.
    return { pop: 0, dialogsAbove: dialogsAbove - 1 };
  }
  // Licznik > 0 przy popie bez `dialog` znaczy, że dialog HA zamknął się
  // bez history.back() i licznik się rozjechał — zerujemy, żeby następne
  // „wstecz" nie zostało zjedzone.
  return { pop: 1, dialogsAbove: 0 };
}

/** Czy `history.state` / `event.state` to wpis dialogu HA. */
export function stateHasDialog(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    Boolean((state as { dialog?: unknown }).dialog)
  );
}
