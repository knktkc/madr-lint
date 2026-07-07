import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { defineCommand, runMain } from 'citty';
import { initCommand } from './commands/init.js';
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
import {
  ConfigFileNotFoundError,
  loadConfig,
  loadConfigFromPath,
  resolveExtends,
  type ResolvedConfig,
} from './core/config.js';
import { findAdrFiles } from './core/discover.js';
import { unifiedDiff } from './core/fix.js';
import { shouldIgnore } from './core/ignore.js';
import { lintAndFix, lintFiles, type CacheConfig } from './core/lint.js';
import { reporters, type ReporterFormat } from './core/reporter.js';
import { RuleOptionsError } from './core/runner.js';
import type { AnyRule, Diagnostic } from './core/types.js';
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
      description: 'Reporter format: text (default), json, sarif, or github',
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
    quiet: {
      type: 'boolean',
      description: 'Report errors only; suppress warnings from output',
      default: false,
    },
    'max-warnings': {
      type: 'string',
      description:
        'Exit 1 when warning count exceeds n. n=0 means any warning fails. Negative = no limit.',
      required: false,
    },
    config: {
      type: 'string',
      description: 'Path to config file, bypassing auto-discovery',
      required: false,
    },
    fix: {
      type: 'boolean',
      description: 'Apply autofixes in place; exit code reflects remaining problems',
      default: false,
    },
    'fix-dry-run': {
      type: 'boolean',
      description: 'Show a diff of the fixes that --fix would apply; write nothing',
      default: false,
    },
  },
  run({ args }) {
    const cwd = process.cwd();

    // Parse --max-warnings. Require an integer (including negative); float or
    // non-numeric is a usage error (exit 2), not a lint failure (exit 1).
    // Number('') === 0, so an empty value (e.g. --max-warnings "$UNSET_VAR")
    // would silently become the strictest limit — reject it explicitly.
    let maxWarnings = -1;
    const rawMaxWarnings = args['max-warnings'] as string | undefined;
    if (rawMaxWarnings !== undefined) {
      const parsed = Number(rawMaxWarnings);
      if (rawMaxWarnings.trim() === '' || !Number.isInteger(parsed)) {
        console.error(
          `Invalid --max-warnings "${rawMaxWarnings}": must be an integer.`,
        );
        process.exit(2);
      }
      maxWarnings = parsed;
    }

    // --config bypasses the config discovery walk. When the user explicitly
    // points to a config file we skip the recommended fallback — they chose
    // the config intentionally (even if it has no rules).
    let config: ResolvedConfig;
    let configExplicit = false;
    const configArg = args.config as string | undefined;
    if (configArg) {
      const absConfigPath = resolve(cwd, configArg);
      try {
        config = loadConfigFromPath(absConfigPath);
        configExplicit = true;
      } catch (err) {
        if (err instanceof ConfigFileNotFoundError) {
          console.error(err.message);
        } else {
          console.error(
            `Failed to load config "${configArg}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        process.exit(2);
      }
    } else {
      config = loadConfig(cwd);
    }

    // When no rules are configured and no explicit config was provided, fall
    // back to `recommended` so users get useful output without authoring a
    // config first.
    if (!configExplicit && Object.keys(config.rules).length === 0) {
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
    const format = (args.format ?? 'text') as ReporterFormat;

    // Shared "report the resulting diagnostics and exit" tail. `fixedCount` is
    // undefined on a plain lint (no fix footer / summary), a number when a fix
    // pass ran. Diagnostics are POST-baseline, so baselined warnings never
    // count toward --max-warnings — inherited debt does not fail CI.
    const reportAndExit = (
      diagnostics: readonly Diagnostic[],
      baselineHidden: number,
      fixedCount: number | undefined,
      dryRun: boolean,
    ): never => {
      const rulesByName = new Map<string, AnyRule>(
        allRulesArray.map((r) => [r.meta.name, r]),
      );
      const reporter = reporters[format];
      if (!reporter) {
        console.error(
          `Unknown --format "${format}". Available: ${Object.keys(reporters).join(', ')}`,
        );
        process.exit(2);
      }
      const warningCount = diagnostics.filter((d) => d.severity === 'warn').length;
      const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
      const overWarningLimit = maxWarnings >= 0 && warningCount > maxWarnings;

      // --quiet filters warnings from OUTPUT but the original warning count is
      // still used for --max-warnings (mirrors ESLint). The threshold verdict
      // goes to stderr so `--quiet --max-warnings 0` still fails loudly.
      const reported = args.quiet
        ? diagnostics.filter((d) => d.severity !== 'warn')
        : diagnostics;

      // Text-only: a "✓ All clear." banner beside exit 1 would lie, so suppress
      // it when the run fails purely on the warning threshold.
      const suppressAllClear =
        format === 'text' && reported.length === 0 && overWarningLimit;
      if (!suppressAllClear) {
        console.log(
          reporter.format(reported, rulesByName, {
            baselineHidden,
            ...(fixedCount !== undefined ? { fixed: fixedCount } : {}),
          }),
        );
      }
      if (format === 'text' && baselineHidden > 0) {
        console.log(baselineHiddenSummary(baselineHidden));
      }
      // Text-only autofix footer (json carries summary.fixed instead).
      if (format === 'text' && fixedCount !== undefined && fixedCount > 0) {
        const noun = fixedCount === 1 ? 'problem' : 'problems';
        console.log(
          dryRun
            ? `${fixedCount} ${noun} fixable (dry run; no files written)`
            : `Fixed ${fixedCount} ${noun}`,
        );
      }
      if (overWarningLimit) {
        console.error(
          `madr-lint: ${warningCount} warning(s) found, exceeds --max-warnings ${maxWarnings}`,
        );
      }
      process.exit(errorCount > 0 || overWarningLimit ? 1 : 0);
    };

    // ── Autofix path (--fix / --fix-dry-run) ─────────────────────────
    const fixMode = args.fix === true || args['fix-dry-run'] === true;
    if (fixMode && updateBaseline) {
      // Ambiguous intent: rewrite files vs snapshot the current violations.
      console.error(
        'madr-lint: --update-baseline cannot be combined with --fix or --fix-dry-run',
      );
      process.exit(2);
    }
    if (fixMode) {
      // --fix-dry-run wins if both are given: never write on a dry run.
      const dryRun = args['fix-dry-run'] === true;
      let fixResult: ReturnType<typeof lintAndFix>;
      try {
        // The cache is intentionally bypassed while fixing (fixes need live
        // thunks); fixed files re-enter the normal pipeline on the next run.
        fixResult = lintAndFix({
          rules: allRulesArray,
          ruleSeverity: config.rules,
          files,
          cwd,
          baseline,
        });
      } catch (err) {
        if (err instanceof RuleOptionsError) {
          console.error(`Invalid rule options in config: ${err.message}`);
          process.exit(2);
        }
        throw err;
      }

      if (dryRun) {
        for (const f of fixResult.files) {
          if (f.changed) process.stdout.write(unifiedDiff(f.path, f.original, f.fixed));
        }
      } else {
        for (const f of fixResult.files) {
          if (f.changed) writeFileSync(f.absPath, f.fixed, 'utf8');
        }
      }
      reportAndExit(fixResult.diagnostics, fixResult.baselineHidden, fixResult.fixed, dryRun);
    }

    // ── Normal lint path ─────────────────────────────────────────────
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

    reportAndExit(result.diagnostics, result.baselineHidden, undefined, false);
  },
});

// Manual subcommand dispatch. citty's `subCommands` field cannot coexist with
// the free-form `paths` positional: runCommand() treats ANY leading non-flag
// token as a subcommand name once `subCommands` is set, so `madr-lint docs/adr`
// would die with "Unknown command docs/adr" (verified against citty 0.2.2).
// Only the literal first raw arg `init` selects the subcommand; every other
// invocation flows to the default lint command exactly as before.
const rawArgs = process.argv.slice(2);
if (rawArgs[0] === 'init') {
  await runMain(initCommand, { rawArgs: rawArgs.slice(1) });
} else {
  await runMain(main);
}
