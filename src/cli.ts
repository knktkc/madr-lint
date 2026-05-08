import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { defineCommand, runMain } from 'citty';
import { loadConfig, resolveExtends, type ResolvedConfig } from './core/config.js';
import { findAdrFiles } from './core/discover.js';
import { shouldIgnore } from './core/ignore.js';
import { lintFiles } from './core/lint.js';
import { textReporter } from './core/reporter.js';
import type { AnyRule } from './core/types.js';
import * as builtinRules from './rules/index.js';

function toPosix(p: string): string {
  if (sep === '/') return p;
  return p.split(sep).join('/');
}

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
      description: 'Path to ADR directory (overrides config.adrDir)',
      required: false,
    },
  },
  run({ args }) {
    const cwd = process.cwd();
    let config: ResolvedConfig = loadConfig(cwd);

    // CLI default UX: when no rules are explicitly configured, fall back to
    // the `recommended` preset so users get useful output without authoring
    // `.madrlintrc.json` first.
    if (Object.keys(config.rules).length === 0) {
      config = resolveExtends({ extends: ['madr-lint:recommended'] });
    }

    const adrDir = args.path ?? config.adrDir;
    const allFiles = findAdrFiles(adrDir);

    // Apply ignorePatterns from config (e.g. README.md, template.md, 9999-*).
    // POSIX-normalize so path-suffix patterns work cross-platform on Windows.
    const files = allFiles.filter(
      (absPath) =>
        !shouldIgnore(toPosix(relative(cwd, absPath)), config.ignorePatterns),
    );

    if (files.length === 0) {
      const skipped = allFiles.length - files.length;
      const note = skipped > 0 ? ` (${skipped} ignored by config)` : '';
      console.log(`No .md files to lint in ${adrDir}${note}`);
      process.exit(0);
    }

    const allRulesArray: AnyRule[] = Object.values(builtinRules);
    const result = lintFiles({
      rules: allRulesArray,
      ruleSeverity: config.rules,
      files,
      cwd,
    });

    const rulesByName = new Map<string, AnyRule>(
      allRulesArray.map((r) => [r.meta.name, r]),
    );
    console.log(textReporter.format(result.diagnostics, rulesByName));

    const errorCount = result.diagnostics.filter(
      (d) => d.severity === 'error',
    ).length;
    process.exit(errorCount > 0 ? 1 : 0);
  },
});

await runMain(main);
