// Jasność kafla grupy świateł (rail/tint) z klawiatury — czysta logika,
// testy w `tests/glight-keys.test.ts`.
//
// Kafel to role="button": Enter/Spacja przełączają, a strzałki ←/→
// zmieniają jasność tym samym kontrolerem co swipe (LightSwipe), więc
// proporcje członków grupy i progi zapalania/gaszenia są identyczne jak
// pod palcem. ↑/↓ zostają przeglądarce — przewijają popup; przechwycenie
// ich na każdym kafelku zamieniłoby listę w pułapkę dla klawiatury.

/** Krok jednej strzałki (punkty procentowe). */
export const GLIGHT_KEY_STEP = 10;

/**
 * Tyle ciszy po ostatniej strzałce = koniec „gestu" i komenda końcowa.
 * Seria strzałek to jeden gest (fale na żywo + jeden finał), a nie
 * kilkanaście osobnych komend w kolejce Zigbee.
 */
export const GLIGHT_KEY_COMMIT_MS = 450;

/**
 * Nowy poziom po strzałce albo undefined, gdy klawisz nas nie dotyczy.
 * Wartość wskakuje na siatkę kroku (38% → 40%, nie 48%) — tak jak suwak
 * z krokiem, i kolejne naciśnięcia dają okrągłe liczby.
 */
export function glightKeyLevel(
  level: number,
  key: string,
  step: number = GLIGHT_KEY_STEP,
): number | undefined {
  const cur = Math.max(0, Math.min(100, Number.isFinite(level) ? level : 0));
  let next: number;
  if (key === 'ArrowRight') next = Math.floor(cur / step) * step + step;
  else if (key === 'ArrowLeft') next = Math.ceil(cur / step) * step - step;
  else return undefined;
  return Math.max(0, Math.min(100, next));
}
