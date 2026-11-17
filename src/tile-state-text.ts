// Tekst stanu na kafelku encji — czyste funkcje, bez Lita (testy w
// tests/tile-state-text.test.ts).
//
// Kafel ogólny i kafel mediów pokazywały surowe `state.state` z HA:
// „21.5" bez „°C", „not_home", „playing" — po angielsku obok polskiego
// playera w tym samym popupie. Kolejność źródeł:
//  1. `hass.formatEntityState` (HA ≥ 2023.9) — tłumaczenia integracji,
//     jednostki, separator dziesiętny z profilu użytkownika. Najlepsze.
//  2. Własny fallback: liczba w locale + `unit_of_measurement`, znane
//     stany ze słownika kafla.
//  3. Surowy stan — nigdy pusty kafel.

import type { HassEntity, HomeAssistant } from './types.js';
import { tileEn, tilePl, type TileStrings } from './localize/tile.js';

/**
 * Słownik dla języka HA. Polski ma pierwszeństwo (CLAUDE.md): brak
 * `language` = PL. Inny język niż polski dostaje angielski — niemiecki
 * użytkownik lepiej zrozumie „idle" niż „bezczynny".
 */
export function tileStrings(language: string | undefined): TileStrings {
  if (!language) return tilePl;
  return language.toLowerCase().startsWith('pl') ? tilePl : tileEn;
}

/** Podstawia `{klucz}` w tekście ze słownika. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/** Stan media_playera słowami (wspólne dla playera i kafla mediów). */
export function mediaStateText(state: string, s: TileStrings): string {
  if (state === 'unavailable') return s.unavailable;
  if (state === 'unknown') return s.unknown;
  return (s.media as Record<string, string>)[state] ?? state;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Jednostki doklejane bez spacji. Polska typografia pisze „45%" i „21°";
 * „21,5 °C" ma spację jak w HA (spacja przed symbolem jednostki SI).
 */
const NO_SPACE_UNITS = new Set(['%', '°']);

/** Liczba w locale z zachowaniem precyzji, którą podała encja. */
export function formatNumberState(raw: string, language: string | undefined): string {
  const decimals = raw.includes('.') ? raw.split('.')[1]!.length : 0;
  const n = Number(raw);
  try {
    return n.toLocaleString(language || 'pl', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    // Nieznany tag języka w starym WebView — RangeError. Zostaje kropka.
    return raw;
  }
}

/** Fallback, gdy HA nie daje `formatEntityState` (stare wersje, stub). */
export function fallbackStateText(
  state: HassEntity,
  s: TileStrings,
  language: string | undefined,
): string {
  const raw = state.state;
  const unit = state.attributes?.unit_of_measurement as string | undefined;
  if (NUMERIC.test(raw)) {
    const num = formatNumberState(raw, language);
    if (!unit) return num;
    return NO_SPACE_UNITS.has(unit) ? `${num}${unit}` : `${num} ${unit}`;
  }
  const known: Record<string, string> = {
    on: s.on,
    off: s.off,
    unavailable: s.unavailable,
    unknown: s.unknown,
    open: s.open,
    closed: s.closed,
    opening: s.opening,
    closing: s.closing,
    home: s.home,
    not_home: s.not_home,
    locked: s.locked,
    unlocked: s.unlocked,
  };
  return known[raw] ?? raw;
}

/** Stan encji słowami — HA, gdy umie; inaczej własny fallback. */
export function entityStateText(
  hass: Pick<HomeAssistant, 'language' | 'formatEntityState'> | undefined,
  state: HassEntity,
): string {
  const s = tileStrings(hass?.language);
  const fmt = hass?.formatEntityState;
  if (typeof fmt === 'function') {
    try {
      const out = fmt(state);
      if (typeof out === 'string' && out !== '') return out;
    } catch {
      // Zepsuty stan / nieznana domena po stronie HA — idziemy fallbackiem.
    }
  }
  return fallbackStateText(state, s, hass?.language);
}

/** device_class „otwieralne" — okno, drzwi, brama: otwarte/zamknięte. */
const OPENING_CLASSES = new Set(['window', 'door', 'garage_door', 'opening']);

/** device_class obecności — ruch, obecność: wykryto/brak. */
const PRESENCE_CLASSES = new Set(['motion', 'occupancy', 'presence', 'moving']);

/**
 * Stan binary_sensora. Dawniej „otwarte/zamknięte" dla każdego — także
 * czujnika ruchu SATEL dodanego do sekcji custom. Okna/drzwi i ruch mają
 * własne słowa (te same co chipy karty, małą literą); reszta klas
 * (dym, wilgoć, bateria…) idzie przez tłumaczenia HA.
 */
export function binaryStateText(
  hass: Pick<HomeAssistant, 'language' | 'formatEntityState'> | undefined,
  state: HassEntity,
): string {
  const s = tileStrings(hass?.language);
  const on = state.state === 'on';
  const dc = state.attributes?.device_class as string | undefined;
  if (dc && OPENING_CLASSES.has(dc)) return on ? s.open : s.closed;
  if (dc && PRESENCE_CLASSES.has(dc)) return on ? s.detected : s.clear;
  return entityStateText(hass, state);
}
