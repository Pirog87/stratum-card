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
 * Wersja z package.json wstrzykiwana w src/version.ts. Wcześniej każda
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
        code: code.replace(/\b__STRATUM_VERSION__\b/g, JSON.stringify(pkg.version)),
        map: null,
      };
    },
  };
}

export default {
  input: 'src/stratum-card.ts',
  output: {
    file: 'dist/stratum-card.js',
    format: 'es',
    sourcemap: dev,
  },
  plugins: [
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
  ].filter(Boolean),
};
