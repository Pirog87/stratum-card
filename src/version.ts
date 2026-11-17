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
// watcher wczytuje config raz, więc id builda (niżej) stoi w miejscu przez
// całą sesję `npm run watch` — samo `?sv=<id>` przypiąłoby w cache
// przeglądarki stare edytory do świeżej karty; loader dokłada wtedy znacznik
// czasu ładowania strony. Poza rollupem (Vitest) — false, deterministycznie.
declare const __STRATUM_DEV__: boolean | undefined;

export const DEV_BUILD: boolean =
  typeof __STRATUM_DEV__ === 'boolean' ? __STRATUM_DEV__ : false;

// `__STRATUM_BUILD__` — id builda: wersja + skrót źródeł (src/, package.json,
// package-lock.json, rollup/tsconfig), liczony raz przy wczytaniu
// rollup.config.js i wstrzykiwany do OBU plików dist. Loader edytorów używa
// go w adresie (`sv=`) i porównuje z id zapisanym przez plik edytorów.
// Dlaczego nie sama wersja: przebudowanie z poprawką bez podbicia wersji
// zostawiało w cache przeglądarki stare edytory (HA trzyma /local/ 31 dni,
// a Ctrl+Shift+R nie dotyczy importu robionego dopiero przy „Edytuj") —
// świeża karta dostawała edytory sprzed poprawki i nic tego nie wykrywało.
// Skrót źródeł, nie znacznik czasu: ten sam kod = ten sam adres, więc cache
// działa, a build w CI i lokalny z tych samych źródeł dają ten sam plik.
// Poza rollupem (Vitest) — sama wersja.
declare const __STRATUM_BUILD__: string | undefined;

export const BUILD_ID: string =
  typeof __STRATUM_BUILD__ === 'string' ? __STRATUM_BUILD__ : VERSION;
