// Mapowanie semantycznych nazw kolorów (zgodnych z HA/Material) na hex.
//
// Rozpoznaje: nazwę (`amber`, `red`), CSS variable (`var(--...)`),
// hex (`#ffc107`), rgb(), hsl() — w tych trzech przypadkach zwraca bez zmian.

const SEMANTIC: Record<string, string> = {
  amber: '#ffc107',
  red: '#f44336',
  pink: '#e91e63',
  purple: '#9c27b0',
  'deep-purple': '#673ab7',
  indigo: '#3f51b5',
  blue: '#42a5f5',
  'light-blue': '#03a9f4',
  cyan: '#00bcd4',
  teal: '#009688',
  green: '#4caf50',
  'light-green': '#8bc34a',
  lime: '#cddc39',
  yellow: '#ffeb3b',
  orange: '#ff9800',
  'deep-orange': '#ff5722',
  brown: '#795548',
  grey: '#9e9e9e',
  gray: '#9e9e9e',
  'blue-grey': '#607d8b',
  white: '#ffffff',
  black: '#000000',
};

/** Zwraca kolor CSS-gotowy: rozpoznaje semantyczne nazwy, resztę zostawia. */
export function resolveColor(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) {
    return trimmed;
  }
  if (trimmed.startsWith('var(')) return trimmed;
  return SEMANTIC[trimmed.toLowerCase()] ?? trimmed;
}
