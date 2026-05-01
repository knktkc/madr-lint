import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      // Cover all rule implementations; only exclude the bare registry
      // (src/rules/index.ts) which is just re-exports.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/rules/index.ts'],
    },
  },
});
