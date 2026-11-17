// Czysta logika edytora sekcji — co wolno danemu typowi sekcji (tryby,
// domeny encji) i co zostaje z sekcji po zmianie jej typu. Wydzielone ze
// stratum-sections-editor, żeby dało się przetestować w Vitest.

import type { RoomSectionConfig, RoomSectionType } from './types.js';
import { SECTION_PRESETS } from './section-presets.js';

/** Opcje trybu wyświetlania dostępne per typ sekcji. */
export const MODE_OPTIONS_BY_TYPE: Partial<
  Record<RoomSectionType, Array<{ value: string; label: string }>>
> = {
  lights: [
    { value: 'rail', label: 'Rail (pasek jasności z lewej + swipe)' },
    { value: 'tint', label: 'Tint (tło w kolorze światła + swipe)' },
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'slider', label: 'Slider (brightness)' },
    { value: 'ambient', label: 'Ambient (kolor + jasność w tle)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  covers: [
    { value: 'tile', label: 'Tile (kafel z przyciskami)' },
    { value: 'slider', label: 'Slider (pozycja)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (open/close)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  switches: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  fans: [
    { value: 'tile', label: 'Tile (kafel z toggle)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  media: [
    { value: 'player', label: 'Player (okładka + sterowanie, reszta zwinięta)' },
    { value: 'tile', label: 'Tile (play/pause)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (play/pause)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  windows: [
    { value: 'tile', label: 'Tile (kafel ze statusem)' },
    { value: 'chips', label: 'Chips (status readonly)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  doors: [
    { value: 'tile', label: 'Tile (kafel ze statusem)' },
    { value: 'chips', label: 'Chips (status readonly)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  scenes: [
    { value: 'tile', label: 'Tile (przycisk aktywuj)' },
    { value: 'bubble', label: 'Bubble (duża ikona w kółku)' },
    { value: 'chips', label: 'Chips (przycisk aktywuj)' },
    { value: 'icon', label: 'Icon (sama ikona)' },
  ],
  summary: [
    { value: 'cards', label: 'Cards (kafle z labelem + value)' },
    { value: 'chips', label: 'Chips (kompaktowy pasek)' },
  ],
};

/** Domeny encji, które może pokazywać sekcja danego typu. */
export function entityDomainsForType(type: RoomSectionType): string[] {
  switch (type) {
    case 'lights':
      return ['light'];
    case 'covers':
      return ['cover'];
    case 'windows':
    case 'doors':
      return ['binary_sensor'];
    case 'climate':
      return ['climate'];
    case 'media':
      return ['media_player'];
    case 'fans':
      return ['fan'];
    case 'switches':
      return ['switch'];
    case 'scenes':
      return ['scene', 'script'];
    case 'summary':
    case 'custom':
      return [];
    default:
      // Nieznany typ (literówka w YAML) — żadnych domen zamiast undefined.
      return [];
  }
}

/**
 * Wbudowane (nie `custom:*`) tryby, które ma sens zachować dla typu:
 * lista z dropdownu plus tryby presetów (climate ma preset `tile`, choć
 * nie ma własnej listy).
 */
export function builtinModesForType(type: RoomSectionType): Set<string> {
  const modes = new Set((MODE_OPTIONS_BY_TYPE[type] ?? []).map((o) => o.value));
  for (const p of SECTION_PRESETS) {
    const m = p.config.mode;
    if (p.config.type === type && m && !m.startsWith('custom:')) modes.add(m);
  }
  return modes;
}

/**
 * Klucze, które znaczą coś tylko dla jednego typu sekcji (patrz komentarze
 * „Tylko `media`" itd. w RoomSectionConfig). Po zmianie typu przenosimy je
 * wyłącznie, gdy nowy typ jest ich właścicielem.
 */
const TYPE_ONLY_KEYS: Partial<Record<RoomSectionType, ReadonlyArray<keyof RoomSectionConfig>>> = {
  covers: ['master', 'positions'],
  media: [
    'entity',
    'media_style',
    'volume_step',
    'hide_when_off',
    'group_button',
    'source_button',
    'shortcuts',
    'intercom',
  ],
  lights: ['tile_min_width', 'tile_height'],
  summary: ['fields'],
  custom: ['card'],
};

/**
 * Sekcja po zmianie typu w edytorze.
 *
 * ha-form oddaje cały obiekt z podmienionym tylko `type`, a zwykły merge
 * zostawiał stary tryb i encje: sekcja Światła (rail, dwie lampy)
 * przestawiona na Rolety rysowała lampy jako kafle rolet, a prawdziwe
 * rolety pokoju znikały (karta bierze `entities` bez filtra domeny).
 *
 * Budujemy więc sekcję od nowa i przenosimy tylko to, co nowy typ
 * rozumie:
 * - `title`, `icon` — świadomy wybór usera, niezależny od typu;
 * - `hidden: true` — ukrycie nie powinno się „odkręcić" przy zmianie typu;
 * - `entities` — tylko z domen nowego typu (puste = auto z pomieszczenia);
 * - `mode` — tylko wbudowany i dozwolony dla nowego typu. Tryby
 *   `custom:*` odpadają razem z `card_template`: szablony kart są
 *   per-typ (bubble-card `button` dla świateł ≠ `cover` dla rolet);
 * - `columns` — gdy nowy typ ma siatkę kafli (nie summary/custom);
 * - pola „tylko dla typu X" — gdy nowy typ to X.
 */
export function retypeSection(
  prev: RoomSectionConfig,
  type: RoomSectionType,
): RoomSectionConfig {
  if (prev.type === type) return { ...prev };
  const next: RoomSectionConfig = { type };
  if (prev.title) next.title = prev.title;
  if (prev.icon) next.icon = prev.icon;
  if (prev.hidden === true) next.hidden = true;

  const domains = entityDomainsForType(type);
  const entities = (prev.entities ?? []).filter((id) =>
    domains.includes(String(id).split('.')[0] ?? ''),
  );
  if (entities.length > 0) next.entities = entities;

  if (prev.mode && builtinModesForType(type).has(prev.mode)) next.mode = prev.mode;

  if (prev.columns !== undefined && type !== 'summary' && type !== 'custom') {
    next.columns = prev.columns;
  }

  const target = next as unknown as Record<string, unknown>;
  const source = prev as unknown as Record<string, unknown>;
  for (const key of TYPE_ONLY_KEYS[type] ?? []) {
    if (source[key] !== undefined) target[key] = source[key];
  }
  return next;
}
