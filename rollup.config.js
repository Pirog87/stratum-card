import { readFileSync } from 'node:fs';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { minifyHTMLLiterals } from 'minify-literals';

const dev = process.env.ROLLUP_WATCH === 'true';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Terser nie wchodzi do wnętrza template literals — bez tego pluginu
 * ~50% bundle'a to nieminifikowany CSS/HTML z tagów css`` i html``
 * (sam whitespace wcięć to ~45 KB). Odpalamy PO transformacji TS,
 * więc plugin dostaje czysty JS.
 */
function minifyLiteralsPlugin() {
  return {
    name: 'minify-literals',
    async transform(code, id) {
      if (!/\.(js|ts)$/.test(id) || id.includes('node_modules')) return null;
      const result = await minifyHTMLLiterals(code, { fileName: id });
      if (!result) return null;
      return { code: result.code, map: result.map ?? null };
    },
  };
}

/**
 * Wersja z package.json (i flaga dev-buildu) wstrzykiwana w src/version.ts. Wcześniej każda
 * karta miała własną stałą VERSION utrzymywaną ręcznie — popup potrafił
 * logować v1.24.0 obok v1.108.2 i wyglądało to jak stary cache. Jedno
 * źródło prawdy = baner w konsoli zawsze mówi, co naprawdę się załadowało.
 * Podmieniamy PO TypeScripcie (deklaracja `declare const` już zniknęła),
 * tylko w module wersji.
 */
function versionPlugin() {
  return {
    name: 'stratum-version',
    transform(code, id) {
      if (!/[\\/]src[\\/]version\.ts$/.test(id)) return null;
      return {
        code: code
          .replace(/\b__STRATUM_VERSION__\b/g, JSON.stringify(pkg.version))
          .replace(/\b__STRATUM_DEV__\b/g, JSON.stringify(dev)),
        map: null,
      };
    },
  };
}

/**
 * Granica między dwoma plikami dist (PKG-3, v1.110.0, ADR-005).
 *
 * Budujemy DWA niezależne, samodzielne pliki ES: dashboard
 * (stratum-card.js) i edytory (stratum-card-editors.js, ładowane przez
 * editor-loader.ts dopiero przy „Edytuj"). Celowo NIE chunk rollupa
 * z code-splittingiem: HACS ładuje kartę jako
 * /hacsfiles/stratum-card/stratum-card.js?hacstag=<n>, a chunk edytorów
 * importowałby `./stratum-card.js` (albo wspólny chunk) bez tego query.
 * Dla przeglądarki to inny URL = druga instancja modułu karty: drugi
 * customElements.define (NotSupportedError), drugi obserwator hass,
 * drugi baner. Dlatego każdy plik ma własną kopię lit i wspólnych
 * helperów (tap-action, area-entities, localize) — trzymają tylko cache,
 * więc dwie kopie niczego nie psują.
 *
 * Ten plugin zatrzymuje build, gdy granica się rozjedzie:
 *   - plik ma więcej niż jeden chunk albo jakikolwiek import statyczny lub
 *     dynamiczny z literałem (import(url) z wyliczonym adresem w loaderze
 *     się tu nie liczy — rollup go nie rozwiązuje);
 *   - main zawiera moduł edytora — wtedy dashboard znów ciągnie edytory;
 *   - edytory zawierają runtime karty albo moduł, który definiuje
 *     nie-edytorowy element `stratum-*` — druga definicja rzuciłaby
 *     wyjątkiem przy otwarciu edytora.
 * Liczą się tylko moduły, które naprawdę trafiły do wyjścia
 * (renderedLength > 0); same typy i wytrząśnięte importy nie.
 */
const SRC_REL = /[\\/]src[\\/](.+)\.ts$/;
const srcRel = (id) => {
  if (id.includes('node_modules')) return undefined;
  const m = SRC_REL.exec(id);
  return m ? m[1].replace(/\\/g, '/') : undefined;
};
// Moduły bez „editor" w nazwie, których używają wyłącznie edytory.
const EDITOR_ONLY = new Set([
  'display-config-clean',
  'room-list-config',
  'room-block-visibility',
  'section-presets',
  'section-type-change',
  'localize/with-code',
]);
// Moduły main z „editor" w nazwie, które edytorami nie są (sam loader).
const MAIN_ALLOWED = new Set(['editor-loader', 'editors-url']);
// Runtime karty — w pliku edytorów nie ma prawa się pojawić. load-guard
// jest dozwolony: czysty, editors-boot-guard używa go świadomie.
const CARD_RUNTIME = new Set([
  'stratum-card',
  'stratum-room-card',
  'boot-guard',
  'hass-watch',
  'power-pending',
  'escape-stack',
  'back-guard',
  'light-swipe',
  'ago-ticker',
  'template-renderer',
  'intercom',
  'scene-pending',
  'editor-loader',
]);
const DEFINE_RE = /customElement\(\s*['"`](stratum-[a-z0-9-]+)['"`]/g;

function stratumBoundary(kind) {
  const definesCardElement = new Set();
  return {
    name: 'stratum-boundary',
    transform(code, id) {
      if (!srcRel(id)) return null;
      for (const m of code.matchAll(DEFINE_RE)) {
        if (!m[1].endsWith('-editor')) definesCardElement.add(id);
      }
      return null;
    },
    generateBundle(_opts, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      if (chunks.length !== 1) {
        this.error(`${kind}: oczekiwany 1 chunk, jest ${chunks.length}`);
      }
      const [chunk] = chunks;
      const imports = [...chunk.imports, ...chunk.dynamicImports];
      if (imports.length) this.error(`${kind}: plik ma importy: ${imports.join(', ')}`);
      const rendered = Object.entries(chunk.modules)
        .filter(([, m]) => m.renderedLength > 0)
        .map(([id]) => id);
      if (kind === 'main') {
        const bad = rendered.filter((id) => {
          const rel = srcRel(id);
          if (!rel || MAIN_ALLOWED.has(rel)) return false;
          return /editor/i.test(rel) || EDITOR_ONLY.has(rel);
        });
        if (bad.length) this.error(`main zawiera edytory: ${bad.map(srcRel).join(', ')}`);
      } else {
        const bad = rendered.filter((id) => {
          const rel = srcRel(id);
          return !!rel && (CARD_RUNTIME.has(rel) || definesCardElement.has(id));
        });
        if (bad.length) {
          this.error(`edytory zawierają runtime karty: ${bad.map(srcRel).join(', ')}`);
        }
      }
    },
  };
}

// Świeże instancje pluginów dla każdego builda — typescript i terser
// trzymają stan per build.
const plugins = (kind) =>
  [
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      sourceMap: dev,
    }),
    versionPlugin(),
    // Minify only in production builds
    !dev && minifyLiteralsPlugin(),
    !dev && terser({
      format: { comments: false },
    }),
    stratumBoundary(kind),
  ].filter(Boolean);

export default [
  {
    input: 'src/stratum-card.ts',
    output: { file: 'dist/stratum-card.js', format: 'es', sourcemap: dev },
    plugins: plugins('main'),
  },
  {
    input: 'src/editors-entry.ts',
    output: { file: 'dist/stratum-card-editors.js', format: 'es', sourcemap: dev },
    plugins: plugins('editors'),
  },
];
