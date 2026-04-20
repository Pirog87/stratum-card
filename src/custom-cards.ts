// Discovery zainstalowanych custom cards (HACS) + heurystyka domyślnego configu
// per karta.
//
// HA utrzymuje `window.customCards` — listę obiektów `{type, name, description?,
// preview?}`. Każda karta z HACS rejestruje się tam sama przy ładowaniu.

import type { RoomSectionType } from './types.js';

interface CustomCardEntry {
  type: string;
  name?: string;
  description?: string;
  preview?: boolean;
}

interface CustomCardsWindow extends Window {
  customCards?: CustomCardEntry[];
}

/** Własne card types które skipujemy (żeby nie pokazywać Stratum jako opcji). */
const SKIP = new Set(['stratum-card', 'stratum-room-card']);

/**
 * Karty uniwersalne — obsługują dowolny entity, pokazujemy je zawsze
 * (niezależnie od typu sekcji).
 */
const UNIVERSAL_CARDS = new Set<string>([
  'button-card',
  'bubble-card',
  'mushroom-entity-card',
  'mushroom-template-card',
  'mushroom-title-card',
  'mushroom-chips-card',
]);

/**
 * Patterny które uważamy za specyficzne dla danego typu sekcji. Karta
 * pasuje do sekcji gdy jej `type` zawiera którąkolwiek frazę (regex).
 * Karty uniwersalne z `UNIVERSAL_CARDS` przechodzą zawsze obok patterns.
 */
const DOMAIN_PATTERNS: Partial<Record<RoomSectionType, RegExp[]>> = {
  lights: [/light/i],
  covers: [/cover/i, /blind/i],
  windows: [/window/i, /binary[-_]?sensor/i, /status/i],
  doors: [/door/i, /binary[-_]?sensor/i, /lock/i],
  climate: [/climate/i, /thermostat/i, /heater/i, /hvac/i],
  media: [/media[-_]?player/i, /media[-_]?control/i, /spotify/i, /music/i, /player/i],
  fans: [/fan/i],
  switches: [/switch/i, /outlet/i, /plug/i, /relay/i],
  scenes: [/scene/i, /script/i],
  summary: [],
  custom: [],
};

/**
 * Zwraca listę zainstalowanych custom cards (pełną, bez filtra) w formacie
 * `{value, label}` do dropdown.
 */
export function getCustomCardOptions(): Array<{ value: string; label: string }> {
  const w = window as CustomCardsWindow;
  const list = w.customCards ?? [];
  return list
    .filter((c) => c.type && !SKIP.has(c.type))
    .map((c) => ({
      value: `custom:${c.type}`,
      label: c.name ?? c.type,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Filtruje listę custom cards do tych pasujących do typu sekcji.
 * Reguła: karta uniwersalna (button-card, bubble-card, mushroom-entity/
 * template/chips/title) przechodzi zawsze; pozostałe muszą trafić w któryś
 * z patternów z `DOMAIN_PATTERNS[sectionType]`.
 */
export function getCustomCardOptionsForSection(
  sectionType: RoomSectionType,
): Array<{ value: string; label: string }> {
  const all = getCustomCardOptions();
  const patterns = DOMAIN_PATTERNS[sectionType] ?? [];
  return all.filter((card) => {
    const bare = card.value.replace(/^custom:/, '').toLowerCase();
    if (UNIVERSAL_CARDS.has(bare)) return true;
    return patterns.some((re) => re.test(bare));
  });
}

/**
 * Buduje minimalny config karty custom dla jednej encji. Pokrywa popularne
 * karty w ekosystemie HACS z wymaganymi domyślnymi polami.
 */
export function buildDefaultCustomConfig(
  cardType: string,
  entityId: string,
): Record<string, unknown> {
  // `cardType` przychodzi w formie 'custom:xxx' lub 'xxx' — zachowujemy to co jest.
  const type = cardType.startsWith('custom:') ? cardType : `custom:${cardType}`;
  const bare = type.replace(/^custom:/, '');

  // Bubble Card — wymaga `card_type`. `button` jest bezpiecznym defaultem.
  if (bare === 'bubble-card') {
    return { type, card_type: 'button', entity: entityId };
  }

  // Button Card — wymaga `entity`.
  if (bare === 'button-card') {
    return { type, entity: entityId };
  }

  // Mushroom — entity wystarczy.
  if (bare.startsWith('mushroom-')) {
    return { type, entity: entityId };
  }

  // Fallback — większość kart obsługuje `entity` jako pole root.
  return { type, entity: entityId };
}
