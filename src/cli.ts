import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { defineCommand, runMain } from 'citty';
import {
  baselineHiddenSummary,
  baselineMalformedWarning,
  baselinePath,
  baselineWriteSummary,
  buildBaseline,
  loadBaseline,
  writeBaseline,
} from './core/baseline.js';
import { computeConfigHash } from './core/cache.js';
import { loadConfig, resolveExtends, type ResolvedConfig } from './core/config.js';
import { findAdrFiles } from './core/discover.js';
import { shouldIgnore } from './core/ignore.js';
import { lintFiles, type CacheConfig } from './core/lint.js';
import { reporters, type ReporterFormat } from './core/reporter.js';
import { RuleOptionsError } from './core/runner.js';
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
    paths: {
      type: 'positional',
      description:
        'One or more paths (files or directories). Defaults to config.adrDir',
      required: false,
    },
    cache: {
      type: 'boolean',
      description:
        'Use per-file content-hash cache (use --no-cache to disable)',
      default: true,
    },
    'cache-dir': {
      type: 'string',
      description: 'Cache directory (default: .madr-lint/cache)',
      required: false,
    },
    format: {
      type: 'string',
      description: 'Reporter format: text (default), json, or sarif',
      default: 'text',
    },
    baseline: {
      type: 'boolean',
      description:
        'Subtract .madr-lint/baseline.json when present (use --no-baseline to ignore it)',
      default: true,
    },
    'update-baseline': {
      type: 'boolean',
      description:
        'Rewrite .madr-lint/baseline.json from a full lint, then exit 0',
      default: false,
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

    // citty: positionals collect into `args._` (array of strings). If
    // empty, fall back to the config's adrDir.
    const positionals = (args._ as string[] | undefined) ?? [];
    const inputs = positionals.length > 0 ? positionals : [config.adrDir];

    const seen = new Set<string>();
    const allFiles: string[] = [];
    for (const input of inputs) {
      for (const file of findAdrFiles(input)) {
        if (!seen.has(file)) {
          seen.add(file);
          allFiles.push(file);
        }
      }
    }

    // Apply ignorePatterns from config (e.g. README.md, template.md, 9999-*).
    // POSIX-normalize so path-suffix patterns work cross-platform on Windows.
    const files = allFiles.filter(
      (absPath) =>
        !shouldIgnore(toPosix(relative(cwd, absPath)), config.ignorePatterns),
    );

    if (files.length === 0) {
      const skipped = allFiles.length - files.length;
      const note = skipped > 0 ? ` (${skipped} ignored by config)` : '';
      const where = inputs.length === 1 ? inputs[0] : inputs.join(', ');
      console.log(`No .md files to lint in ${where}${note}`);
      process.exit(0);
    }

    // CLI flag wins over config — `--no-cache` sets args.cache=false,
    // overriding `cache: true` from .madrlintrc.json.
    const cacheEnabled = (args.cache ?? config.cache) === true;
    const cacheDir = (args['cache-dir'] ?? config.cacheLocation) as string;
    const cacheConfig: CacheConfig | null = cacheEnabled
      ? {
          dir: resolve(cwd, cacheDir),
          configHash: computeConfigHash({
            rules: config.rules,
            ignorePatterns: config.ignorePatterns,
            madrVersion: config.madrVersion,
          }),
          pkgVersion: pkg.version,
        }
      : null;

    // --update-baseline runs a full lint IGNORING any existing baseline, so we
    // subtract nothing here and (below) rebuild the file from the raw output.
    const baselineFile = baselinePath(cwd);
    const updateBaseline = args['update-baseline'] === true;
    const useBaseline = !updateBaseline && args.baseline !== false;
    const baseline = useBaseline ? loadBaseline(baselineFile) : null;
    // Absent → silent no-op. Present but unusable → warn: silently ignoring a
    // corrupt baseline would flip CI red with zero explanation.
    if (useBaseline && baseline === null && existsSync(baselineFile)) {
      console.error(baselineMalformedWarning());
    }

    const allRulesArray: AnyRule[] = Object.values(builtinRules);
    let result: ReturnType<typeof lintFiles>;
    try {
      result = lintFiles({
        rules: allRulesArray,
        ruleSeverity: config.rules,
        files,
        cwd,
        cache: cacheConfig,
        baseline,
      });
    } catch (err) {
      // Invalid rule options in the user's config fail AJV validation now that
      // options actually reach the rules. Surface a clear message instead of a
      // stack trace, and exit 2 (config error, distinct from lint failures).
      if (err instanceof RuleOptionsError) {
        console.error(`Invalid rule options in config: ${err.message}`);
        process.exit(2);
      }
      throw err;
    }

    // Rebuild the baseline from the full (pre-baseline) diagnostics and exit.
    if (updateBaseline) {
      const built = buildBaseline(result.diagnostics);
      writeBaseline(baselineFile, built);
      console.log(baselineWriteSummary(built));
      process.exit(0);
    }

    const rulesByName = new Map<string, AnyRule>(
      allRulesArray.map((r) => [r.meta.name, r]),
    );
    const format = (args.format ?? 'text') as ReporterFormat;
    const reporter = reporters[format];
    if (!reporter) {
      console.error(
        `Unknown --format "${format}". Available: ${Object.keys(reporters).join(', ')}`,
      );
      process.exit(2);
    }
    console.log(
      reporter.format(result.diagnostics, rulesByName, {
        baselineHidden: result.baselineHidden,
      }),
    );
    // Text-only footer: JSON carries the count in its summary; SARIF stays
    // schema-clean.
    if (format === 'text' && result.baselineHidden > 0) {
      console.log(baselineHiddenSummary(result.baselineHidden));
    }

    const errorCount = result.diagnostics.filter(
      (d) => d.severity === 'error',
    ).length;
    process.exit(errorCount > 0 ? 1 : 0);
  },
});

await runMain(main);
