import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cleanDisplayStyle,
  moveField,
  rowStyleDefaults,
  TILE_STYLE_DEFAULTS,
  toggleField,
} from '../src/display-config-clean.js';
import { DEFAULT_FIELDS } from '../src/tile-data.js';
import type { RowPreset, TileDisplayConfig } from '../src/types.js';

describe('toggleField / moveField — start z listy, którą renderuje karta', () => {
  it('włączenie wilgotności na pustym configu zachowuje wszystkie 7 domyślnych', () => {
    expect(toggleField(undefined, 'humidity')).toEqual([
      ...DEFAULT_FIELDS,
      'humidity',
    ]);
  });

  it('wyłączenie obecności nie gubi okien/drzwi/wycieku/problemu', () => {
    const next = toggleField(undefined, 'motion');
    expect(next).toEqual(DEFAULT_FIELDS.filter((f) => f !== 'motion'));
    expect(next).toEqual(
      expect.arrayContaining(['windows', 'doors', 'leak', 'problem']),
    );
  });

  it('jawna lista jest edytowana, nie zastępowana domyślną', () => {
    expect(toggleField(['lights'], 'lights')).toEqual([]);
    expect(toggleField(['lights'], 'smoke')).toEqual(['lights', 'smoke']);
  });

  it('przesunięcie na pustym configu operuje na 7 polach', () => {
    const next = moveField(undefined, 'problem', -1);
    expect(next).toHaveLength(DEFAULT_FIELDS.length);
    expect(next?.slice(-2)).toEqual(['problem', 'leak']);
  });

  it('przesunięcie poza zakres = brak zmiany', () => {
    expect(moveField(undefined, 'temperature', -1)).toBeUndefined();
    expect(moveField(['lights'], 'humidity', 1)).toBeUndefined();
  });
});

describe('cleanDisplayStyle — pola', () => {
  it('pusta lista zostaje (świadomie „bez pól"), nie wraca do 7 domyślnych', () => {
    expect(cleanDisplayStyle({ fields: [] }, false)).toEqual({ fields: [] });
    expect(cleanDisplayStyle({ fields: [] }, true)).toEqual({ fields: [] });
  });

  it('lista identyczna z domyślną jest wycinana (czysty YAML)', () => {
    expect(cleanDisplayStyle({ fields: [...DEFAULT_FIELDS] }, false)).toEqual({});
  });

  it('inna kolejność domyślnych pól zostaje', () => {
    const reordered = [...DEFAULT_FIELDS].reverse();
    expect(cleanDisplayStyle({ fields: reordered }, false).fields).toEqual(reordered);
  });

  it('toggle wł. → wył. tego samego pola wraca do czystego configu', () => {
    const on = cleanDisplayStyle({ fields: toggleField(undefined, 'humidity') }, false);
    const off = cleanDisplayStyle({ fields: toggleField(on.fields, 'humidity') }, false);
    expect(off).toEqual({});
  });
});

describe('cleanDisplayStyle — slider_from_off', () => {
  it('odznaczenie w edytorze przeżywa zapis', () => {
    expect(cleanDisplayStyle({ slider_from_off: 'none' }, false)).toEqual({
      slider_from_off: 'none',
    });
  });

  it('wpis z YAML przeżywa niezwiązaną edycję (włącznik świateł)', () => {
    const yaml: TileDisplayConfig = { slider_from_off: 'none', preset: 'rail' };
    expect(cleanDisplayStyle({ ...yaml, lights_switch: true }, false)).toEqual({
      slider_from_off: 'none',
      preset: 'rail',
      lights_switch: true,
    });
  });

  it("'all' to default — nie zapisujemy; kafel opcję ignoruje", () => {
    expect(cleanDisplayStyle({ slider_from_off: 'all' }, false)).toEqual({});
    expect(cleanDisplayStyle({ slider_from_off: 'none' }, true)).toEqual({});
  });
});

describe('cleanDisplayStyle — wymiary wiersza nie są wycinane', () => {
  it('radius 6 na Fill zostaje (nie wraca do pigułki 999)', () => {
    expect(cleanDisplayStyle({ border_radius: 6 }, false)).toEqual({ border_radius: 6 });
  });

  it('ikona 22 na Fill zostaje (nie wraca do ~34 px)', () => {
    expect(cleanDisplayStyle({ icon_size: 22 }, false)).toEqual({ icon_size: 22 });
  });

  it('wysokość 85 i padding 14 na Rail zostają', () => {
    expect(
      cleanDisplayStyle({ preset: 'rail', min_height: 85, padding: 14 }, false),
    ).toEqual({ preset: 'rail', min_height: 85, padding: 14 });
  });

  it('wartość ustawiona na Fill przeżywa przełączenie na Rail i z powrotem', () => {
    const fill = cleanDisplayStyle({ border_radius: 8 }, false);
    const rail = cleanDisplayStyle({ ...fill, preset: 'rail' }, false);
    const back = cleanDisplayStyle({ ...rail, preset: 'fill' }, false);
    expect(rail.border_radius).toBe(8);
    expect(back).toEqual({ border_radius: 8 });
  });

  it('kafel nadal wycina wartości równe swoim (jedynym) domyślnym', () => {
    // min_height zostaje: jawna wysokość kafla jest stała, a jej brak
    // oznacza wysokość z proporcji — to nie to samo.
    expect(cleanDisplayStyle({ ...TILE_STYLE_DEFAULTS }, true)).toEqual({ min_height: 110 });
    expect(cleanDisplayStyle({ min_height: 110, aspect: '16/9' } as TileDisplayConfig, true)).toMatchObject({ min_height: 110 });
    expect(cleanDisplayStyle({ border_radius: 6, icon_size: 30 }, true)).toEqual({
      border_radius: 6,
      icon_size: 30,
    });
  });
});

describe('cleanDisplayStyle — każda opcja edytora przeżywa sprzątanie', () => {
  // Wartości różne od domyślnych dla każdego klucza, który emituje
  // stratum-display-editor. Nowy klucz bez gałęzi w cleanerze = czerwony test.
  const ROW: TileDisplayConfig = {
    fields: ['humidity', 'lights'],
    accent_color: 'blue',
    accent_mode: 'lights',
    preset: 'cards',
    slider: false,
    slider_from_off: 'none',
    lights_switch: true,
    lights_switch_glow_on: 80,
    lights_switch_glow_off: 10,
    lights_switch_show_off: false,
    field_colors: { lights: 'amber' },
    status_layout: 'two-line',
    narrow_mode: 'compact',
    show_icon: false,
    show_name: false,
    border_radius: 6,
    padding: 14,
    min_height: 85,
    icon_size: 22,
    icon_offset_x: -4,
    icon_bg_offset_x: 3,
    icon_bg_scale: 90,
    icon_style: 'flat',
    hover_effect: 'glow',
    press_scale: 0.95,
  };

  const TILE: TileDisplayConfig = {
    fields: ['temperature'],
    accent_color: 'red',
    field_colors: { temperature: 'red' },
    show_icon: false,
    show_name: false,
    border_radius: 20,
    padding: 16,
    min_height: 140,
    icon_size: 30,
    icon_style: 'none',
    hover_effect: 'subtle',
    press_scale: 0.94,
    aspect: '4/3',
    background_image: 'stratum:salon',
    icon_position: 'center',
  };

  it('wiersz', () => {
    expect(cleanDisplayStyle(ROW, false)).toEqual(ROW);
  });

  it('kafel', () => {
    expect(cleanDisplayStyle(TILE, true)).toEqual(TILE);
  });

  it('accent_mode static bez koloru przeżywa', () => {
    expect(cleanDisplayStyle({ accent_mode: 'static' }, false)).toEqual({
      accent_mode: 'static',
    });
  });

  it('wynik jest stabilny (drugie sprzątanie nic nie zmienia)', () => {
    const once = cleanDisplayStyle(ROW, false);
    expect(cleanDisplayStyle(once, false)).toEqual(once);
  });
});

// Domyślne suwaków muszą być lustrem fallbacków CSS karty — czytamy
// źródło komponentu jako tekst, żeby zmiana w CSS bez zmiany tutaj
// (albo odwrotnie) wywaliła test, zamiast po cichu rozjechać edytor.
describe('rowStyleDefaults / TILE_STYLE_DEFAULTS = fallbacki w CSS karty', () => {
  const rowSrc = readFileSync(
    new URL('../src/stratum-card-room-row.ts', import.meta.url),
    'utf8',
  );
  const tileSrc = readFileSync(
    new URL('../src/stratum-card-room-tile.ts', import.meta.url),
    'utf8',
  );

  /** Treść pierwszego bloku reguły zaczynającego się od `selector {`. */
  function block(src: string, selector: string): string {
    const start = src.indexOf(`${selector} {`);
    expect(start, `brak reguły ${selector}`).toBeGreaterThanOrEqual(0);
    return src.slice(start, src.indexOf('}', start));
  }

  function fallback(css: string, varName: string): number {
    const m = css.match(new RegExp(`var\\(${varName},\\s*(\\d+)px\\)`));
    expect(m, `brak fallbacku ${varName}`).not.toBeNull();
    return Number(m![1]);
  }

  const cases: Array<{ preset: RowPreset; selector: string }> = [
    { preset: 'fill', selector: ".row[data-preset='pill']" },
    { preset: 'pill', selector: ".row[data-preset='pill']" },
    { preset: 'rail', selector: ".row[data-preset='rail']" },
    { preset: 'cards', selector: ".row[data-preset='cards']" },
  ];

  for (const { preset, selector } of cases) {
    it(`preset ${preset}: radius, padding, min-height`, () => {
      const css = block(rowSrc, selector);
      const d = rowStyleDefaults(preset);
      expect(d.border_radius).toBe(fallback(css, '--stratum-room-row-radius'));
      expect(d.padding).toBe(fallback(css, '--stratum-room-row-padding'));
      expect(d.min_height).toBe(fallback(css, '--stratum-room-row-min-height'));
    });
  }

  it('fill/pill: ikona = 0.4 × wysokość wiersza (także ustawionej)', () => {
    expect(rowSrc).toMatch(
      /--stratum-room-row-icon-size,\s*calc\(var\(--stratum-room-row-min-height, 85px\) \* 0\.4\)/,
    );
    expect(rowStyleDefaults('fill').icon_size).toBe(34);
    expect(rowStyleDefaults('pill', 60).icon_size).toBe(24);
    expect(rowStyleDefaults(undefined).border_radius).toBe(999);
  });

  it('rail/cards: ikona z bazowej reguły .icon', () => {
    const css = block(rowSrc, '    .icon');
    const base = fallback(css, '--stratum-room-row-icon-size');
    expect(rowStyleDefaults('rail').icon_size).toBe(base);
    expect(rowStyleDefaults('cards').icon_size).toBe(base);
  });

  it('kafel', () => {
    expect(TILE_STYLE_DEFAULTS.border_radius).toBe(
      fallback(tileSrc, '--stratum-room-tile-radius'),
    );
    expect(TILE_STYLE_DEFAULTS.padding).toBe(
      fallback(tileSrc, '--stratum-room-tile-padding'),
    );
    expect(TILE_STYLE_DEFAULTS.min_height).toBe(
      fallback(tileSrc, '--stratum-room-tile-min-height'),
    );
    expect(TILE_STYLE_DEFAULTS.icon_size).toBe(
      fallback(tileSrc, '--stratum-room-tile-icon-size'),
    );
  });
});
