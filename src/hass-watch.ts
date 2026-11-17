// Bramka renderów: czy nowy `hass` zmienia cokolwiek, co komponent pokazuje.
//
// Home Assistant podmienia obiekt `hass` przy KAŻDEJ zmianie stanu
// którejkolwiek encji (na dużej instalacji kilka–kilkanaście razy na
// sekundę). Bez bramki każda karta przelicza wtedy wszystkie wiersze, choć
// zmienił się np. licznik energii w innym budynku. Tu są czyste funkcje
// (bez DOM-u i Lita), którymi komponenty odpowiadają na pytanie „czy to mnie
// dotyczy" w `shouldUpdate`.
//
// Opieramy się na kontrakcie HA: `hass.states[id]` zachowuje tożsamość
// obiektu, dopóki encja się nie zmieni, a `hass.entities/devices/areas/
// floors` — dopóki nie zmieni się rejestr. Porównania to więc `!==` na
// referencjach, nie głębokie porównywanie.

import type { HomeAssistant } from './types.js';
import { groupMemberIds } from './area-entities.js';

/**
 * Klucze `hass`, których zmiana tożsamości zawsze wymusza render: rejestry
 * (skład pokoi, nazwy, ikony), motyw, język i użytkownik (uprawnienia).
 * `states` jest celowo poza listą — sprawdzamy je selektywnie po id.
 */
const STRUCTURAL_KEYS = [
  'entities',
  'devices',
  'areas',
  'floors',
  'themes',
  'selectedTheme',
  'locale',
  'language',
  'user',
  'config',
] as const;

/** Czy zmieniło się coś poza stanami encji (rejestr, motyw, język, user). */
export function structureChanged(
  prev: HomeAssistant,
  next: HomeAssistant,
): boolean {
  const a = prev as unknown as Record<string, unknown>;
  const b = next as unknown as Record<string, unknown>;
  for (const key of STRUCTURAL_KEYS) {
    if (a[key] !== b[key]) return true;
  }
  return false;
}

/**
 * Czy `states` jest puste.
 *
 * UWAGA: to NIE jest O(1). HA buduje `states` na nowo przy każdym zdarzeniu
 * (spread kilku tysięcy kluczy → obiekt w trybie słownikowym), a dla takich
 * obiektów V8 zbiera i sortuje wszystkie klucze, zanim `for…in` zwróci
 * pierwszy (~0,5 ms przy 5 tys. encji, na telefonie kilka ms). Wołać tylko
 * do pierwszego niepustego wyniku — patrz `statesReadyLatch`.
 */
export function statesEmpty(states: HomeAssistant['states'] | undefined): boolean {
  if (!states) return true;
  for (const _id in states) return false;
  return true;
}

/** Czy stan którejkolwiek z obserwowanych encji zmienił tożsamość. */
export function watchedStateChanged(
  prev: HomeAssistant,
  next: HomeAssistant,
  ids: Iterable<string>,
): boolean {
  const a = prev.states;
  const b = next.states;
  if (a === b) return false;
  if (!a || !b) return true;
  for (const id of ids) {
    if (a[id] !== b[id]) return true;
  }
  return false;
}

/**
 * Zatrzask „HA dosłał stany". Po pierwszym niepustym `states` już nigdy
 * nie liczy — HA nie opróżnia stanów po starcie (także po reconnect), a
 * sprawdzanie przy każdej zmianie stanu kosztowało pełne przejście po
 * kluczach w każdej karcie piętra.
 */
export function statesReadyLatch(): (
  states: HomeAssistant['states'] | undefined,
) => boolean {
  let ready = false;
  return (states) => {
    if (ready) return true;
    if (statesEmpty(states)) return false;
    ready = true;
    return true;
  };
}

const ENTITY_ID_RE = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;

/**
 * Zbiera z configu wszystko, co wygląda jak entity_id — rekurencyjnie, po
 * wartościach I po kluczach (`light_auto_entities` ma encje w wartościach
 * mapy, ale przyszłe pola mogą je mieć w kluczach).
 *
 * Świadomie heurystyka zamiast listy pól: config ma kilkadziesiąt miejsc,
 * w których użytkownik może wskazać encję (pola wierszy, chipy, sceny,
 * światła, sekcje, warunki, akcje), i ręczna lista rozjechałaby się przy
 * pierwszym nowym polu — a pominięta encja to chip, który przestaje się
 * odświeżać. Fałszywe trafienie (np. `sensor.temperature` wpisane jako
 * tekst) kosztuje tylko jedno porównanie referencji więcej.
 */
export function collectEntityIds(
  value: unknown,
  out: Set<string> = new Set(),
  depth = 0,
): Set<string> {
  if (depth > 12 || value == null) return out;
  if (typeof value === 'string') {
    if (ENTITY_ID_RE.test(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEntityIds(item, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const key in value as Record<string, unknown>) {
      if (ENTITY_ID_RE.test(key)) out.add(key);
      collectEntityIds((value as Record<string, unknown>)[key], out, depth + 1);
    }
  }
  return out;
}

/**
 * Dokłada do zbioru członków grup świateł (atrybut `entity_id`) — także
 * zagnieżdżonych. Grupa pokazuje stan zbiorczy, ale suwak jasności i paski
 * belki czytają stany członków, a ci potrafią leżeć w innej strefie niż
 * sama grupa.
 */
export function addGroupMembers(
  hass: HomeAssistant,
  ids: Set<string>,
): Set<string> {
  const queue = [...ids];
  let guard = 0;
  while (queue.length > 0 && guard++ < 5000) {
    const id = queue.pop()!;
    const members = groupMemberIds(hass.states?.[id]);
    if (!members) continue;
    for (const m of members) {
      if (typeof m !== 'string' || ids.has(m)) continue;
      ids.add(m);
      queue.push(m);
    }
  }
  return ids;
}
