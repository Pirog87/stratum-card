// Wersja bundla — jedno źródło prawdy dla obu kart.
//
// `__STRATUM_VERSION__` podmienia przy buildzie plugin `stratum-version`
// w rollup.config.js na `version` z package.json. Poza rollupem (Vitest)
// identyfikatora nie ma — `typeof` nie rzuca ReferenceError, dostajemy
// deterministyczny 'dev' zamiast wyjątku.

declare const __STRATUM_VERSION__: string | undefined;

export const VERSION: string =
  typeof __STRATUM_VERSION__ === 'string' ? __STRATUM_VERSION__ : 'dev';

// `__STRATUM_DEV__` podmienia ten sam plugin: true w `npm run watch`, false
// w buildzie produkcyjnym. Potrzebne loaderowi edytorów (editor-loader.ts):
// w dev-loopie numer wersji się nie zmienia między przebudowaniami, więc
// sam `?sv=<wersja>` przypiąłby w cache przeglądarki stare edytory do
// świeżej karty. Poza rollupem (Vitest) — false, deterministycznie.
declare const __STRATUM_DEV__: boolean | undefined;

export const DEV_BUILD: boolean =
  typeof __STRATUM_DEV__ === 'boolean' ? __STRATUM_DEV__ : false;
