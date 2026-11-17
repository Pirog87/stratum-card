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

export type GuardKind = 'room' | 'chip';

export interface GuardEntry {
  kind: GuardKind;
  /** Indeks wpisu historii z Navigation API; null = API niedostępne. */
  index: number | null;
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
 * @param selfBack     pop wywołany naszym history.back() (×, Escape, tło)
 */
export function decidePopState(
  stack: readonly GuardEntry[],
  currentIndex: number | null,
  dialogsAbove: number,
  stateHasDialog: boolean,
  selfBack = false,
): PopDecision {
  if (stack.length === 0) return { pop: 0, dialogsAbove: 0 };
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
    // × zawsze zamyka — nawet gdy ktoś (np. akcja navigate) dopisał wpis
    // nad naszym strażnikiem i cofnięcie wylądowało jeszcze nad nim.
    if (selfBack && pop === 0) pop = 1;
    return { pop, dialogsAbove };
  }

  // Nasze własne cofnięcie zawsze zamyka szczyt — inaczej rozjechany licznik
  // dialogów zablokowałby × (wpis dashboardu też bywa `{dialog, open:false}`).
  if (selfBack) return { pop: 1, dialogsAbove: 0 };

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
