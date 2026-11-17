// Nazwa dostępna stadionu ikony w wierszu pokoju (room_icon_tap_action).
//
// Dlaczego osobny moduł: „Kuchnia: akcja ikony" nie mówiło czytnikowi
// ekranu, co się stanie po Enterze — a ikona ma właśnie inną akcję niż
// wiersz, więc użytkownik musi wiedzieć, czym się różnią. Opis wynika
// z typu akcji, więc to czysta funkcja (testowalna bez DOM-u i Lita).
// Czasowniki siedzą w słownikach (grupa `icon_action` w src/localize/).

import { lookup, messages, type LangSource } from './localize/localize.js';

/**
 * `"Kuchnia: przejdź do widoku"`. Bez nazwy pokoju (wiersz bez `name`)
 * zostaje sam czasownik — lepsze niż „: …" czytane przez TalkBack.
 * Typ spoza słownika (YAML bywa dowolny) dostaje deterministyczny default.
 */
export function iconActionLabel(
  roomName: string | undefined,
  action: string | undefined,
  lang?: LangSource,
): string {
  const m = messages(lang).icon_action;
  // lookup sprawdza hasOwnProperty: akcja „constructor" z YAML zwróciłaby
  // funkcję z prototypu zamiast fallbacku.
  const verb = lookup(m.verbs, action) ?? m.fallback;
  const name = roomName?.trim();
  return name ? `${name}: ${verb}` : verb;
}
