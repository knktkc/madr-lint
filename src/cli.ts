// CLI entry point for madr-lint.
// At v0.1.0-alpha this is a stub that prints version and target path.
// The lint runtime lands in M1 along with the AST traversal helper.

import { readFileSync } from 'node:fs';
import { defineCommand, runMain } from 'citty';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const main = defineCommand({
  meta: {
    name: 'madr-lint',
    version: pkg.version,
    description: 'A linter for MADR (Markdown Architectural Decision Records)',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to the ADR directory',
      required: false,
      default: 'docs/adr',
    },
  },
  run({ args }) {
    console.log(`madr-lint v${pkg.version}`);
    console.log(`Target: ${args.path}`);
    console.log('Linter runtime not yet implemented (M1 in progress).');
  },
});

await runMain(main);
