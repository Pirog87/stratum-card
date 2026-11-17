// Nazwa dostępna stadionu ikony w wierszu pokoju (room_icon_tap_action).
//
// Dlaczego osobny moduł: „Kuchnia: akcja ikony" nie mówiło czytnikowi
// ekranu, co się stanie po Enterze — a ikona ma właśnie inną akcję niż
// wiersz, więc użytkownik musi wiedzieć, czym się różnią. Opis wynika
// z typu akcji, więc to czysta funkcja (testowalna bez DOM-u i Lita).
//
// Teksty są tu jeszcze po polsku, w jednym słowniku — faza lokalizacji
// przeniesie `ICON_ACTION_VERBS_PL` do src/localize/ obok wersji EN.

/** Czasownik dla typu akcji; klucze to `action` z TapActionConfig. */
export const ICON_ACTION_VERBS_PL: Readonly<Record<string, string>> = {
  popup: 'pokaż szczegóły pokoju',
  'toggle-lights': 'przełącz światła',
  navigate: 'przejdź do widoku',
  url: 'otwórz link',
  'perform-action': 'uruchom akcję',
  'call-service': 'uruchom akcję',
  'more-info': 'pokaż szczegóły',
  toggle: 'przełącz',
};

/** Deterministyczny default dla typu spoza słownika (YAML bywa dowolny). */
export const ICON_ACTION_FALLBACK_PL = 'akcja ikony';

/**
 * `"Kuchnia: przejdź do widoku"`. Bez nazwy pokoju (wiersz bez `name`)
 * zostaje sam czasownik — lepsze niż „: …" czytane przez TalkBack.
 */
export function iconActionLabel(
  roomName: string | undefined,
  action: string | undefined,
  verbs: Readonly<Record<string, string>> = ICON_ACTION_VERBS_PL,
  fallback: string = ICON_ACTION_FALLBACK_PL,
): string {
  // hasOwnProperty, nie `verbs[action]`: akcja „constructor" z YAML
  // zwróciłaby funkcję z prototypu zamiast fallbacku.
  const verb =
    (action && Object.prototype.hasOwnProperty.call(verbs, action)
      ? verbs[action]
      : undefined) ?? fallback;
  const name = roomName?.trim();
  return name ? `${name}: ${verb}` : verb;
}
