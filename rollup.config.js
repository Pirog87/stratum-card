import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { minifyHTMLLiterals } from 'minify-literals';

const dev = process.env.ROLLUP_WATCH === 'true';

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
    // Minify only in production builds
    !dev && minifyLiteralsPlugin(),
    !dev && terser({
      format: { comments: false },
    }),
  ].filter(Boolean),
};
