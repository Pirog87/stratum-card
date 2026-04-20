// Discovery zainstalowanych custom cards (HACS) + heurystyka domyślnego configu
// per karta.
//
// HA utrzymuje `window.customCards` — listę obiektów `{type, name, description?,
// preview?}`. Każda karta z HACS rejestruje się tam sama przy ładowaniu.

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
 * Zwraca listę zainstalowanych custom cards do pokazania w dropdown trybów.
 * Pozycje mają format `{value: 'custom:xxx', label: 'xxx'}`.
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
