import { defineConfig } from 'vitest/config';

// Testujemy wyłącznie czyste funkcje (bez DOM/Lit) — environment: node.
// Moduły z komponentami Lit nie są importowane w testach.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
