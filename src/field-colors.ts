// Kolory pól sekcji info z configu → CSS vars (doklejane do
// styleOverride wiersza/kafla; kolorują pola + spójnie np. mini-switch
// świateł). Wydzielone ze stratum-card (dług techniczny) — testowalne.

import type { TileDisplayConfig } from './types.js';

export const FIELD_COLOR_VARS: Record<string, string> = {
  lights: '--stratum-chip-lights-color',
  motion: '--stratum-chip-motion-color',
  windows: '--stratum-chip-windows-color',
  doors: '--stratum-chip-doors-color',
  leak: '--stratum-chip-leak-color',
  smoke: '--stratum-chip-smoke-color',
  gas: '--stratum-chip-gas-color',
  problem: '--stratum-chip-problem-color',
  temperature: '--stratum-field-temp-color',
  humidity: '--stratum-field-hum-color',
};

/** Zamienia `field_colors` z configu na inline CSS vars. */
export function fieldColorStyle(cfg?: TileDisplayConfig): string {
  return Object.entries(cfg?.field_colors ?? {})
    .filter(([k, v]) => Boolean(v) && FIELD_COLOR_VARS[k])
    .map(([k, v]) => `${FIELD_COLOR_VARS[k]}:${v};`)
    .join('');
}
