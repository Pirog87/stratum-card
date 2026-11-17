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

import type { HomeAssistant, StratumRoomCardConfig } from './types.js';
import { groupMemberIds } from './area-entities.js';
import { lightControllerOf } from './light-dimming.js';

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
 * Czy powiadomienie o stanie „w toku" (power-pending) dotyczy któregoś
 * z obserwowanych id. Karta piętra i popup pokoju dostają powiadomienie
 * o KAŻDYM tapnięciu w całym domu; bez tego filtra przełącznik tarasu
 * przerysowywał też Parter i Piętro — dwa pełne rendery kart, których to
 * nie dotyczy, akurat w chwili, gdy użytkownik czeka na reakcję pod palcem.
 *
 * Brak zbioru (karta jeszcze nie policzyła, co obserwuje) = przerysuj — tak
 * jak dotąd; lepiej jeden render za dużo niż przełącznik, który nie drgnie.
 */
export function touchesWatched(
  watched: ReadonlySet<string> | undefined,
  changed: ReadonlySet<string>,
): boolean {
  if (!watched) return true;
  // Iterujemy po mniejszym zbiorze — zmienionych bywa kilka, obserwowanych
  // setki; przy gaszeniu całego piętra bywa odwrotnie.
  const [small, big] = changed.size <= watched.size ? [changed, watched] : [watched, changed];
  for (const id of small) if (big.has(id)) return true;
  return false;
}

/**
 * Domeny, które popup pokoju pokazuje albo liczy: sekcje (światła, rolety,
 * klimat, media, wentylatory, przełączniki, sceny, okna i drzwi), chipy
 * nagłówka i blok alarmów (czujniki binarne). Nowa sekcja albo chip na
 * innej domenie MUSI ją tu dopisać — test `popupRelevantFilter` sprawdza
 * to dla każdego typu sekcji.
 */
const POPUP_DOMAINS: ReadonlySet<string> = new Set([
  'light',
  'binary_sensor',
  'cover',
  'climate',
  'media_player',
  'fan',
  'switch',
  'scene',
]);

/**
 * Które encje strefy w ogóle mogą zmienić to, co pokazuje popup pokoju.
 *
 * Dawniej popup obserwował KAŻDĄ encję strefy. Kuchnia ze spiżarnią to ok.
 * 530 encji, z czego większość to czujniki mocy, energii, napięcia
 * i linkquality z Z2M, raportujące co kilka sekund — każdy raport
 * przebudowywał wszystkie sekcje otwartego popupu (i pasek scen), choć
 * niczego z nich nie widać. Teraz obserwujemy tylko domeny z
 * `POPUP_DOMAINS`, domeny chipów filtrujących z configu oraz te czujniki,
 * które coś czyta: temperaturę i wilgotność (chipy, podsumowanie) i baterię
 * — tylko gdy sekcja podsumowania pokazuje pole `battery_low`.
 *
 * Encje wskazane w configu wchodzą osobno (collectEntityIds), a członkowie
 * grup i scen — przez addGroupMembers. Czujnik bez stanu w chwili budowania
 * zbioru wchodzi zawsze — nie znamy jego klasy (jak w karcie piętra).
 *
 * Pozostałych encji NIE obserwujemy nawet pod kątem dostępności (inaczej
 * niż karta piętra): popup nie ma znacznika „pokój offline", a kafle
 * pokazują wyłącznie encje z domen powyżej.
 */
export function popupRelevantFilter(
  hass: HomeAssistant,
  config: Pick<StratumRoomCardConfig, 'chips' | 'sections'>,
): (id: string) => boolean {
  const extraDomains = new Set<string>();
  for (const chip of config.chips ?? []) {
    if (chip.type !== 'filter') continue;
    // Chip filtrujący bez domeny liczy po całej strefie — wtedy wszystko
    // jest istotne i bramka wraca do dawnego zachowania.
    if (!chip.domain) return () => true;
    extraDomains.add(chip.domain);
  }
  const sensorClasses = new Set(['temperature', 'humidity']);
  if (summaryReadsBattery(config.sections)) sensorClasses.add('battery');
  return (id: string): boolean => {
    const domain = id.slice(0, id.indexOf('.'));
    if (POPUP_DOMAINS.has(domain) || extraDomains.has(domain)) return true;
    if (domain !== 'sensor') return false;
    const st = hass.states?.[id];
    if (!st) return true;
    const dc = st.attributes?.device_class;
    return typeof dc === 'string' && sensorClasses.has(dc);
  };
}

/** Czy któraś sekcja podsumowania pokazuje pole „niska bateria". */
function summaryReadsBattery(sections: StratumRoomCardConfig['sections']): boolean {
  if (!Array.isArray(sections)) return false;
  return sections.some(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      s.type === 'summary' &&
      Array.isArray(s.fields) &&
      s.fields.includes('battery_low'),
  );
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
    // Sterownik WLED segmentu — jego włączenie/zgaszenie zmienia to, co
    // widać na segmencie, choć stan samego segmentu się nie zmienia.
    const controller = lightControllerOf(hass, id);
    if (controller && !ids.has(controller)) ids.add(controller);
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

/**
 * Bramka paska scen: czy nowy `hass` zmienia coś, co pasek pokazuje.
 *
 * Popup i belka podają pasekowi świeży `hass` przy każdej zmianie
 * dowolnej encji. Bez bramki pasek przerysowywał wszystkie kafle przy
 * każdym raporcie temperatury, okna czy światła w pokoju (60 renderów na
 * 60 zmian), choć jego kafle czytają tylko: stan samej sceny (nazwa,
 * `id` do REST, lista członków), stany świateł-członków (gradient
 * z kolorów „na żywo") i użytkownika (bramka admina dla configu z REST).
 *
 * Członków bierzemy z OBU obiektów — scena, której skład się zmienił,
 * i tak ma nowy stan, ale lampa usunięta ze sceny też zmienia gradient.
 * Brak któregoś `hass` (pierwsze podanie) = render: dopiero z `hass`
 * kafle dostają nazwy i kolory.
 */
export function sceneBarHassChanged(
  prev: HomeAssistant | undefined,
  next: HomeAssistant | undefined,
  items: ReadonlyArray<{ entity?: string; separator?: boolean }> | undefined,
): boolean {
  if (!prev || !next) return prev !== next;
  if (prev.user !== next.user) return true;
  if (prev.states === next.states) return false;
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (item.separator || !item.entity) continue;
    ids.add(item.entity);
    for (const h of [prev, next]) {
      for (const m of groupMemberIds(h.states?.[item.entity]) ?? []) ids.add(m);
    }
  }
  return watchedStateChanged(prev, next, ids);
}
