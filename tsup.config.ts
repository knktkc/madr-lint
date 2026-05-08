import { defineConfig } from 'tsup';

// Two configs: library entry (index) and CLI entry (cli). Split because
// the CLI needs a shebang banner so the published bin is executable via
// `npx madr-lint` after install.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    target: 'node22',
    outDir: 'dist',
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: 'node22',
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
