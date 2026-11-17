// Czyste przekształcenia configu wyglądu wiersza/kafla (`row_config` /
// `tile_config`) używane przez edytor wizualny. Wydzielone z komponentów
// Lit, bo to właśnie tu config ginął po cichu: sprzątacz gubił klucze,
// które karta czyta, a suwaki pokazywały wartości z innego presetu.
// Testy w tests/display-config-clean.test.ts.

import type { RowPreset, TileDisplayConfig, TileField } from './types.js';
import { DEFAULT_FIELDS, effectiveFields } from './tile-data.js';

/** Wymiary, które suwaki edytora pokazują, gdy klucz nie jest ustawiony. */
export interface StyleDefaults {
  border_radius: number;
  padding: number;
  min_height: number;
  icon_size: number;
}

/**
 * Domyślne wymiary wiersza per preset — lustro fallbacków w CSS
 * `stratum-card-room-row.ts` (`var(--stratum-room-row-*, <fallback>)`).
 * Jedno źródło dla wartości pokazywanej przez suwak, żeby Fill nie
 * udawał 14 px przy faktycznej pigułce 999 px, a Rail 85 px przy 48 px.
 *
 * Ikona fill/pill nie ma stałej — CSS liczy ją z wysokości wiersza
 * (`calc(min-height * 0.4)`), więc przy ustawionym `min_height` też
 * liczymy z niego, inaczej suwak rozjechałby się z kartą po zmianie
 * wysokości.
 */
export function rowStyleDefaults(
  preset: RowPreset | undefined,
  minHeight?: number,
): StyleDefaults {
  switch (preset) {
    case 'rail':
      return { border_radius: 8, padding: 6, min_height: 48, icon_size: 20 };
    case 'cards':
      return { border_radius: 14, padding: 8, min_height: 54, icon_size: 20 };
    case 'pill':
    case 'fill':
    default: {
      const h = typeof minHeight === 'number' ? minHeight : 85;
      return {
        border_radius: 999,
        padding: 14,
        min_height: 85,
        icon_size: Math.round(h * 0.4),
      };
    }
  }
}

/** Domyślne wymiary kafla — lustro fallbacków w `stratum-card-room-tile.ts`. */
export const TILE_STYLE_DEFAULTS: StyleDefaults = {
  border_radius: 14,
  padding: 12,
  min_height: 110,
  icon_size: 22,
};

/**
 * Lista pól po włączeniu/wyłączeniu jednego. Startujemy z listy, którą
 * karta faktycznie renderuje (DEFAULT_FIELDS z tile-data), a nie z
 * osobnej, krótszej kopii — inaczej pierwsze kliknięcie po cichu
 * wyrzucało okna, drzwi, wyciek i problem z każdego wiersza.
 */
export function toggleField(
  fields: TileField[] | undefined,
  field: TileField,
): TileField[] {
  const current = effectiveFields({ fields });
  return current.includes(field)
    ? current.filter((f) => f !== field)
    : [...current, field];
}

/** Przesuwa pole o jedną pozycję; poza zakresem zwraca `undefined` (bez zmiany). */
export function moveField(
  fields: TileField[] | undefined,
  field: TileField,
  dir: -1 | 1,
): TileField[] | undefined {
  const current = [...effectiveFields({ fields })];
  const i = current.indexOf(field);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= current.length) return undefined;
  [current[i], current[j]] = [current[j]!, current[i]!];
  return current;
}

function sameList(a: readonly TileField[], b: readonly TileField[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Oczyszcza config z wartości domyślnych przed zapisem do YAML.
 * Zasada: wolno zgubić tylko klucz, którego brak karta interpretuje
 * identycznie. Każdy klucz, który karta czyta, a który tu nie ma
 * gałęzi, przepada przy KAŻDEJ edycji w panelu — stąd test, że każda
 * opcja edytora przeżywa sprzątanie.
 */
export function cleanDisplayStyle(
  raw: TileDisplayConfig,
  isTile: boolean,
): TileDisplayConfig {
  const out: TileDisplayConfig = {};
  // Pusta lista to świadomy wybór „bez pól" — karta mapuje [] na nic.
  // Gdybyśmy ją wycinali, karta wracałaby do 7 domyślnych, a ostatnie
  // kliknięcie w edytorze wyglądałoby jak brak reakcji. Wycinamy tylko
  // listę identyczną z domyślną (ta sama treść i kolejność).
  if (raw.fields !== undefined && !sameList(raw.fields, DEFAULT_FIELDS)) {
    out.fields = [...raw.fields];
  }
  if (raw.accent_color && raw.accent_color.trim() !== '') {
    out.accent_color = raw.accent_color;
  }
  // accent_mode: default = 'lights' (bez koloru) / 'static' (z kolorem).
  // Zapisujemy tylko odstępstwa od tej reguły.
  if (raw.accent_mode === 'static' && !raw.accent_color) {
    out.accent_mode = 'static';
  } else if (raw.accent_mode === 'lights' && raw.accent_color) {
    out.accent_mode = 'lights';
  }
  // Preset wiersza — 'fill' jest defaultem, zapisujemy tylko inne.
  if (!isTile && raw.preset && raw.preset !== 'fill') out.preset = raw.preset;
  // Suwak gestem — default true, zapisujemy tylko wyłączenie.
  if (!isTile && raw.slider === false) out.slider = false;
  // Suwak po ciemnym pokoju — default 'all' (zapala), zapisujemy tylko
  // 'none'. Bez tej linii odznaczenie w edytorze nic nie dawało, a ręczny
  // wpis w YAML znikał przy pierwszej niezwiązanej edycji wiersza.
  if (!isTile && raw.slider_from_off === 'none') out.slider_from_off = 'none';
  // Mini-switch świateł (H4) — default false, zapisujemy tylko włączenie.
  if (!isTile && raw.lights_switch === true) out.lights_switch = true;
  if (
    !isTile &&
    typeof raw.lights_switch_glow_on === 'number' &&
    raw.lights_switch_glow_on !== 100
  ) {
    out.lights_switch_glow_on = raw.lights_switch_glow_on;
  }
  if (
    !isTile &&
    typeof raw.lights_switch_glow_off === 'number' &&
    raw.lights_switch_glow_off !== 30
  ) {
    out.lights_switch_glow_off = raw.lights_switch_glow_off;
  }
  if (!isTile && raw.lights_switch_show_off === false) {
    out.lights_switch_show_off = false;
  }
  // Kolory pól sekcji info — zapisujemy niepustą mapę (row i tile).
  if (raw.field_colors && Object.keys(raw.field_colors).length > 0) {
    out.field_colors = raw.field_colors;
  }
  // Układ statusów — default 'right', zapisujemy tylko 'two-line'.
  if (!isTile && raw.status_layout === 'two-line') {
    out.status_layout = 'two-line';
  }
  // Wąskie ekrany — default 'fields', zapisujemy tylko inne tryby.
  if (!isTile && raw.narrow_mode && raw.narrow_mode !== 'fields') {
    out.narrow_mode = raw.narrow_mode;
  }
  if (raw.show_icon === false) out.show_icon = false;
  if (raw.show_name === false) out.show_name = false;

  // Wymiary. Kafel ma jeden zestaw domyślnych (bez presetów), więc
  // wartość równa domyślnej wygląda identycznie — można ją wyciąć.
  // Wiersz NIE: domyślne zależą od presetu, a sprzątanie względem
  // bieżącego presetu gubiłoby wartość przy przełączeniu (np. radius 8
  // ustawiony na Fill zniknąłby na Rail i nie wrócił po powrocie).
  // Edytor zapisuje te klucze tylko po ruchu suwaka, a „domyślnie"
  // kasuje je jawnie — więc liczba w configu wiersza jest zawsze zamierzona.
  const dims = ['border_radius', 'padding', 'min_height', 'icon_size'] as const;
  for (const key of dims) {
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (isTile && v === TILE_STYLE_DEFAULTS[key]) continue;
    out[key] = v;
  }

  // Przesunięcia/skala ikonki wiersza — zapisujemy tylko odstępstwa od 0/100
  // (te domyślne nie zależą od presetu, karta sama pomija 0 i 100).
  if (!isTile && typeof raw.icon_offset_x === 'number' && raw.icon_offset_x !== 0) {
    out.icon_offset_x = raw.icon_offset_x;
  }
  if (!isTile && typeof raw.icon_bg_offset_x === 'number' && raw.icon_bg_offset_x !== 0) {
    out.icon_bg_offset_x = raw.icon_bg_offset_x;
  }
  if (!isTile && typeof raw.icon_bg_scale === 'number' && raw.icon_bg_scale !== 100) {
    out.icon_bg_scale = raw.icon_bg_scale;
  }
  if (raw.icon_style && raw.icon_style !== 'bubble') {
    out.icon_style = raw.icon_style;
  }
  const defaultHover = isTile ? 'lift' : 'subtle';
  if (raw.hover_effect && raw.hover_effect !== defaultHover) {
    out.hover_effect = raw.hover_effect;
  }
  if (typeof raw.press_scale === 'number' && raw.press_scale !== 0.98) {
    out.press_scale = raw.press_scale;
  }
  // Tile-only fields
  if (isTile) {
    if (raw.aspect && raw.aspect.trim() !== '' && raw.aspect !== '1/1') {
      out.aspect = raw.aspect;
    }
    if (raw.background_image && raw.background_image.trim() !== '') {
      out.background_image = raw.background_image;
    }
    if (raw.icon_position && raw.icon_position !== 'top-left') {
      out.icon_position = raw.icon_position;
    }
  }
  return out;
}
