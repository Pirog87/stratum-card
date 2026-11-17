// Wersja bundla — jedno źródło prawdy dla obu kart.
//
// `__STRATUM_VERSION__` podmienia przy buildzie plugin `stratum-version`
// w rollup.config.js na `version` z package.json. Poza rollupem (Vitest)
// identyfikatora nie ma — `typeof` nie rzuca ReferenceError, dostajemy
// deterministyczny 'dev' zamiast wyjątku.

declare const __STRATUM_VERSION__: string | undefined;

export const VERSION: string =
  typeof __STRATUM_VERSION__ === 'string' ? __STRATUM_VERSION__ : 'dev';
