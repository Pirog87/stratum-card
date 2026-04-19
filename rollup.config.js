import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const dev = process.env.ROLLUP_WATCH === 'true';

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
    !dev && terser({
      format: { comments: false },
    }),
  ].filter(Boolean),
};
