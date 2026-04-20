// Gotowe szablony sekcji dla popup pokoju.
//
// Każdy preset = jedna sekcja z pre-skonfigurowanym `type`, `mode` i
// `card_template`. Klik w presecie dodaje taką sekcję do listy.
//
// Grupowanie: „Wbudowane" (natywne Stratum tile/slider/ambient),
// „Mushroom" (card packi z HACS), „Bubble" (bubble-card warianty),
// „Inne" (summary, custom YAML).
//
// Availability: presety Mushroom/Bubble są markowane jako `unavailable`
// gdy paczka nie jest zainstalowana w HACS (sprawdzamy `window.customCards`).

import type { RoomSectionConfig } from './types.js';

export type PresetCategory = 'builtin' | 'mushroom' | 'bubble' | 'other';

export interface SectionPreset {
  /** Unikalne ID presetu. */
  id: string;
  /** Czytelna nazwa (label). */
  label: string;
  /** Krótki opis pod labelem. */
  hint: string;
  /** Ikona avatara presetu (MDI). */
  avatar: string;
  /** Kategoria — do grupowania w UI. */
  category: PresetCategory;
  /**
   * Konkretna karta HACS wymagana do działania. Gdy podana a karta nie
   * jest zainstalowana, preset jest markowany jako `unavailable`.
   * Format jak w `window.customCards[].type` (bez `custom:`).
   */
  requires?: string;
  /** Konfiguracja sekcji dodawana do listy. */
  config: RoomSectionConfig;
}

export const SECTION_PRESETS: SectionPreset[] = [
  // ======================================================================
  // WBUDOWANE (natywne Stratum tile'y)
  // ======================================================================
  {
    id: 'builtin_lights_tile',
    label: 'Światła — Tile',
    hint: 'Wbudowany tile z toggle + rgb tint + brightness bar',
    avatar: 'mdi:lightbulb-on',
    category: 'builtin',
    config: { type: 'lights', mode: 'tile' },
  },
  {
    id: 'builtin_lights_slider',
    label: 'Światła — Slider',
    hint: 'Wbudowany tile z suwakiem jasności',
    avatar: 'mdi:lightbulb-on-outline',
    category: 'builtin',
    config: { type: 'lights', mode: 'slider' },
  },
  {
    id: 'builtin_lights_ambient',
    label: 'Światła — Ambient',
    hint: 'Tło kafla w kolorze żarówki (rgb_color)',
    avatar: 'mdi:spotlight-beam',
    category: 'builtin',
    config: { type: 'lights', mode: 'ambient' },
  },
  {
    id: 'builtin_covers_tile',
    label: 'Rolety — Tile',
    hint: 'Wbudowany tile z ↑/⏹/↓ + position bar',
    avatar: 'mdi:blinds',
    category: 'builtin',
    config: { type: 'covers', mode: 'tile' },
  },
  {
    id: 'builtin_covers_slider',
    label: 'Rolety — Slider',
    hint: 'Tile z suwakiem pozycji',
    avatar: 'mdi:blinds-horizontal',
    category: 'builtin',
    config: { type: 'covers', mode: 'slider' },
  },
  {
    id: 'builtin_scenes_tile',
    label: 'Sceny',
    hint: 'Tile z przyciskiem „Aktywuj"',
    avatar: 'mdi:palette',
    category: 'builtin',
    config: { type: 'scenes', mode: 'tile' },
  },
  {
    id: 'builtin_windows_chips',
    label: 'Okna — Chips',
    hint: 'Kompaktowe chipy ze statusem otwarte/zamknięte',
    avatar: 'mdi:window-open-variant',
    category: 'builtin',
    config: { type: 'windows', mode: 'chips' },
  },
  {
    id: 'builtin_doors_chips',
    label: 'Drzwi — Chips',
    hint: 'Kompaktowe chipy ze statusem',
    avatar: 'mdi:door-open',
    category: 'builtin',
    config: { type: 'doors', mode: 'chips' },
  },
  {
    id: 'builtin_switches_tile',
    label: 'Przełączniki',
    hint: 'Tile z toggle on/off',
    avatar: 'mdi:toggle-switch',
    category: 'builtin',
    config: { type: 'switches', mode: 'tile' },
  },
  {
    id: 'builtin_climate_tile',
    label: 'Klimat',
    hint: 'Tile z obecną temperaturą i setpointem',
    avatar: 'mdi:thermostat',
    category: 'builtin',
    config: { type: 'climate', mode: 'tile' },
  },
  {
    id: 'builtin_media_tile',
    label: 'Media',
    hint: 'Tile z play/pause',
    avatar: 'mdi:music',
    category: 'builtin',
    config: { type: 'media', mode: 'tile' },
  },
  {
    id: 'builtin_fans_tile',
    label: 'Wentylatory',
    hint: 'Tile z toggle',
    avatar: 'mdi:fan',
    category: 'builtin',
    config: { type: 'fans', mode: 'tile' },
  },

  // ======================================================================
  // MUSHROOM (HACS — mushroom-cards)
  // ======================================================================
  {
    id: 'mushroom_light',
    label: 'Mushroom Light',
    hint: 'fill_container + use_light_color + brightness slider',
    avatar: 'mdi:mushroom',
    category: 'mushroom',
    requires: 'mushroom-light-card',
    config: {
      type: 'lights',
      mode: 'custom:mushroom-light-card',
      card_template: {
        fill_container: true,
        use_light_color: true,
        show_brightness_control: true,
        show_color_control: true,
        collapsible_controls: true,
      },
    },
  },
  {
    id: 'mushroom_cover',
    label: 'Mushroom Cover',
    hint: 'position control + open/stop/close buttons',
    avatar: 'mdi:mushroom',
    category: 'mushroom',
    requires: 'mushroom-cover-card',
    config: {
      type: 'covers',
      mode: 'custom:mushroom-cover-card',
      card_template: {
        fill_container: true,
        show_position_control: true,
        show_buttons_control: true,
        collapsible_controls: true,
      },
    },
  },
  {
    id: 'mushroom_climate',
    label: 'Mushroom Climate',
    hint: 'HVAC modes + setpoint control',
    avatar: 'mdi:mushroom',
    category: 'mushroom',
    requires: 'mushroom-climate-card',
    config: {
      type: 'climate',
      mode: 'custom:mushroom-climate-card',
      card_template: {
        fill_container: true,
        hvac_modes: ['off', 'heat', 'auto'],
        show_temperature_control: true,
        collapsible_controls: true,
      },
    },
  },
  {
    id: 'mushroom_media',
    label: 'Mushroom Media',
    hint: 'media controls + volume slider',
    avatar: 'mdi:mushroom',
    category: 'mushroom',
    requires: 'mushroom-media-player-card',
    config: {
      type: 'media',
      mode: 'custom:mushroom-media-player-card',
      card_template: {
        fill_container: true,
        use_media_info: true,
        show_volume_level: true,
        media_controls: ['play_pause_stop', 'previous', 'next'],
        volume_controls: ['volume_mute', 'volume_set'],
        collapsible_controls: true,
      },
    },
  },
  {
    id: 'mushroom_fan',
    label: 'Mushroom Fan',
    hint: 'percentage + oscillate control',
    avatar: 'mdi:mushroom',
    category: 'mushroom',
    requires: 'mushroom-fan-card',
    config: {
      type: 'fans',
      mode: 'custom:mushroom-fan-card',
      card_template: {
        fill_container: true,
        show_percentage_control: true,
        show_oscillate_control: true,
        collapsible_controls: true,
      },
    },
  },
  {
    id: 'mushroom_entity',
    label: 'Mushroom Entity',
    hint: 'Uniwersalny — dla switches / scenes / binary',
    avatar: 'mdi:mushroom',
    category: 'mushroom',
    requires: 'mushroom-entity-card',
    config: {
      type: 'switches',
      mode: 'custom:mushroom-entity-card',
      card_template: { fill_container: true },
    },
  },

  // ======================================================================
  // BUBBLE (HACS — Bubble Card)
  // ======================================================================
  {
    id: 'bubble_lights',
    label: 'Bubble Lights',
    hint: 'card_type: button, button_type: slider',
    avatar: 'mdi:circle-double',
    category: 'bubble',
    requires: 'bubble-card',
    config: {
      type: 'lights',
      mode: 'custom:bubble-card',
      card_template: {
        card_type: 'button',
        button_type: 'slider',
        show_state: true,
        show_icon: true,
      },
    },
  },
  {
    id: 'bubble_covers',
    label: 'Bubble Covers',
    hint: 'card_type: cover z buttons',
    avatar: 'mdi:circle-double',
    category: 'bubble',
    requires: 'bubble-card',
    config: {
      type: 'covers',
      mode: 'custom:bubble-card',
      card_template: {
        card_type: 'cover',
        show_buttons: true,
        show_state: true,
      },
    },
  },
  {
    id: 'bubble_climate',
    label: 'Bubble Climate',
    hint: 'card_type: climate',
    avatar: 'mdi:circle-double',
    category: 'bubble',
    requires: 'bubble-card',
    config: {
      type: 'climate',
      mode: 'custom:bubble-card',
      card_template: {
        card_type: 'climate',
        show_state: true,
      },
    },
  },
  {
    id: 'bubble_media',
    label: 'Bubble Media',
    hint: 'card_type: media-player',
    avatar: 'mdi:circle-double',
    category: 'bubble',
    requires: 'bubble-card',
    config: {
      type: 'media',
      mode: 'custom:bubble-card',
      card_template: {
        card_type: 'media-player',
        show_state: true,
      },
    },
  },

  // ======================================================================
  // INNE
  // ======================================================================
  {
    id: 'summary',
    label: 'Podsumowanie',
    hint: 'Motion/temp/humidity/lights — w kartach albo chipach',
    avatar: 'mdi:view-dashboard-variant',
    category: 'other',
    config: {
      type: 'summary',
      fields: [
        'motion',
        'temperature',
        'humidity',
        'lights_on',
        'windows_open',
        'doors_open',
      ],
    },
  },
  {
    id: 'custom_yaml',
    label: 'Custom YAML',
    hint: 'Dowolna karta HA/HACS — pełny YAML',
    avatar: 'mdi:code-braces',
    category: 'other',
    config: { type: 'custom' },
  },
];

/** Labele kategorii do wyświetlenia w UI. */
export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  builtin: 'Wbudowane (Stratum)',
  mushroom: 'Mushroom (HACS)',
  bubble: 'Bubble Card (HACS)',
  other: 'Inne',
};

/** Sprawdza czy karta HACS jest zainstalowana (window.customCards). */
export function isCardInstalled(cardType: string): boolean {
  const w = window as Window & {
    customCards?: Array<{ type: string }>;
  };
  const list = w.customCards ?? [];
  return list.some((c) => c.type === cardType);
}

/** Zwraca presety filtrowane do tych które mają zainstalowaną kartę (lub nie wymagają). */
export function availablePresets(): SectionPreset[] {
  return SECTION_PRESETS.filter(
    (p) => !p.requires || isCardInstalled(p.requires),
  );
}
