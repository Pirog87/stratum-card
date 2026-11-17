import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
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
 * Id builda: wersja + 8 znaków sha256 ze źródeł, które wpływają na oba
 * pliki dist (src/, package.json, package-lock.json, rollup.config.js,
 * tsconfig.json). Liczone RAZ przy wczytaniu configu, więc oba buildy
 * z jednego `npm run build` dostają to samo id. Loader edytorów wkłada je
 * w adres (`sv=`) i porównuje z id zapisanym przez plik edytorów — przy
 * samej wersji przebudowanie z poprawką bez podbicia wersji parowało świeżą
 * kartę ze starymi edytorami z cache przeglądarki (src/version.ts).
 * Skrót, nie znacznik czasu: build w CI i lokalny z tych samych źródeł dają
 * identyczny plik. W watch-mode config wczytuje się raz, więc id stoi
 * w miejscu przez całą sesję — dlatego dev-build dokłada w loaderze
 * znacznik czasu ładowania strony, a samo id oznaczamy `-dev`, żeby nie
 * dało się go pomylić z buildem produkcyjnym.
 */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? sourceFiles(p) : [p];
  });
}
function computeBuildId() {
  const files = [
    'package.json',
    'package-lock.json',
    'rollup.config.js',
    'tsconfig.json',
    ...sourceFiles('src'),
  ].sort();
  const h = createHash('sha256');
  for (const f of files) {
    let body;
    try {
      body = readFileSync(new URL(`./${f}`, import.meta.url));
    } catch {
      continue; // brak lockfile'a itp. — liczymy z tego, co jest
    }
    // Ścieżka w skrócie: przeniesienie kodu między plikami to też inny build.
    h.update(f).update('\0').update(body).update('\0');
  }
  return `${pkg.version}.${h.digest('hex').slice(0, 8)}`;
}
const buildId = dev ? `${pkg.version}-dev` : computeBuildId();

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
          .replace(/\b__STRATUM_DEV__\b/g, JSON.stringify(dev))
          .replace(/\b__STRATUM_BUILD__\b/g, JSON.stringify(buildId)),
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
// Definicja elementu: dekorator albo bezpośrednie customElements.define.
const DEFINE_RE = /(?:\bcustomElement|\.define)\(\s*['"`](stratum-[a-z0-9-]+)['"`]/g;
// Dekorator pod inną nazwą (`customElement as ce`) wymknąłby się DEFINE_RE —
// zamiast zgadywać aliasy, zabraniamy ich w src/.
const ALIAS_RE = /\bcustomElement\s+as\s+[A-Za-z_$]/;

/** Czy moduł definiuje nie-edytorowy element `stratum-*`. */
function definesCardElement(code) {
  for (const m of code.matchAll(DEFINE_RE)) {
    if (!m[1].endsWith('-editor')) return true;
  }
  return false;
}

function stratumBoundary(kind) {
  return {
    name: 'stratum-boundary',
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
      // Kod modułów czytamy z getModuleInfo przy KAŻDYM generateBundle, a nie
      // zbieramy w transform: w `npm run watch` niezmienione moduły nie
      // przechodzą transformu ponownie, więc zbiór trzymany między buildami
      // pamiętał błąd także po cofnięciu zmiany — aż do restartu watchera.
      // getModuleInfo().code jest dostępne również dla modułów z cache.
      const codeOf = (id) => this.getModuleInfo(id)?.code ?? '';
      const aliased = rendered.filter((id) => srcRel(id) && ALIAS_RE.test(codeOf(id)));
      if (aliased.length) {
        this.error(`${kind}: alias dekoratora customElement: ${aliased.map(srcRel).join(', ')}`);
      }
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
          return !!rel && (CARD_RUNTIME.has(rel) || definesCardElement(codeOf(id)));
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
