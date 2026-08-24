// Brandowane tła playera dla aplikacji, które nie wystawiają okładek
// (Netflix, Disney+, Prime Video…). Integracje TV/Cast często dostają
// od tych aplikacji wyłącznie `app_name` — zamiast pustego ciemnego
// kafla dajemy gradient w kolorach marki. Czysty moduł — testowalny.

const BRANDS: Array<{ match: RegExp; from: string; to: string }> = [
  { match: /netflix/i, from: '#b20710', to: '#3d0508' },
  { match: /disney/i, from: '#1a3ccc', to: '#0a1a4f' },
  { match: /prime|amazon/i, from: '#0f79af', to: '#012b3f' },
  { match: /spotify/i, from: '#169c46', to: '#0c3d20' },
  { match: /youtube/i, from: '#c00000', to: '#3d0000' },
  { match: /hbo|\bmax\b/i, from: '#681ee3', to: '#22094d' },
  { match: /plex/i, from: '#b8820b', to: '#4d3604' },
  { match: /apple\s?tv/i, from: '#4a4d52', to: '#1b1c1f' },
  { match: /player\.pl|tvn/i, from: '#0059d6', to: '#001f4d' },
  { match: /canal\+/i, from: '#3a3a3a', to: '#101010' },
];

/**
 * Gradient CSS w kolorach marki dla nazwy aplikacji — undefined gdy
 * marka nieznana (wtedy player zostaje przy neutralnym tle).
 */
export function appBrandGradient(app: string | undefined): string | undefined {
  if (!app) return undefined;
  const brand = BRANDS.find((b) => b.match.test(app));
  if (!brand) return undefined;
  return `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 72%)`;
}
