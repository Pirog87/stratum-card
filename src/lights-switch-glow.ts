// Poświata mini-przełącznika świateł w wierszu pokoju (H4).
//
// Dawniej JS składał cały `box-shadow` z literałów rgba(255,224,130) /
// rgba(255,193,7). Użytkownik, który przemalował światła
// (--stratum-chip-lights-color na ciepłą biel albo akcent motywu), dostawał
// przełącznik w swoim kolorze, ale poświatę dalej bursztynową. Teraz kolor
// jest wyłącznie w CSS (tokeny wiersza, color-mix), a stąd idą tylko krycia
// warstw cienia jako procenty — w jedynym miejscu, gdzie intensywność
// z configu (`lights_switch_glow_on/off`) spotyka się ze stanem.

/** Krycia kolejnych warstw cienia przy intensywności 100 (stan on / off). */
const LAYERS_ON = [0.95, 0.6, 0.25] as const;
const LAYERS_OFF = [0.65, 0.35] as const;

/**
 * Zmienne inline dla poświaty: `--lt-g1…--lt-g3` jako procenty do
 * `color-mix(… X%, transparent)`. Pusty string = bez poświaty
 * (intensywność 0 albo brak liczby). Intensywność przycinana do 0–100,
 * jak dotąd.
 */
export function lightsSwitchGlowStyle(on: boolean, glowOn: number, glowOff: number): string {
  const raw = on ? glowOn : glowOff;
  const f = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) / 100 : 0;
  if (f <= 0) return '';
  const layers = on ? LAYERS_ON : LAYERS_OFF;
  return layers.map((a, i) => `--lt-g${i + 1}:${Math.round(a * f * 100)}%`).join(';');
}
