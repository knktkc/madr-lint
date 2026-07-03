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
import {
  ConfigFileNotFoundError,
  loadConfig,
  loadConfigFromPath,
  resolveExtends,
  type ResolvedConfig,
} from './core/config.js';
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
    // result.diagnostics is POST-baseline (lintFiles subtracts before
    // returning), so baselined warnings never count toward --max-warnings —
    // the whole point of a baseline is that inherited debt does not fail CI.
    const allDiagnostics = result.diagnostics;
    const warningCount = allDiagnostics.filter((d) => d.severity === 'warn').length;
    const errorCount = allDiagnostics.filter((d) => d.severity === 'error').length;
    const overWarningLimit = maxWarnings >= 0 && warningCount > maxWarnings;

    // --quiet filters warnings from OUTPUT but the original warning count is
    // still used for --max-warnings (mirrors ESLint: "warnings still run, not
    // reported"). So `--quiet --max-warnings 0` keeps the log free of warning
    // noise while still failing the build — the threshold verdict below goes
    // to stderr so the failure is never mute.
    const reported = args.quiet
      ? allDiagnostics.filter((d) => d.severity !== 'warn')
      : allDiagnostics;

    // Text-only: a "✓ All clear." banner beside exit 1 would lie, so suppress
    // it when the run fails purely on the warning threshold. json/sarif
    // payloads still print — machine consumers read stdout + stderr + exit.
    const suppressAllClear =
      format === 'text' && reported.length === 0 && overWarningLimit;
    if (!suppressAllClear) {
      console.log(
        reporter.format(reported, rulesByName, {
          baselineHidden: result.baselineHidden,
        }),
      );
    }
    // Text-only footer: JSON carries the count in its summary; SARIF stays
    // schema-clean. Printed even when --quiet or the banner is suppressed —
    // knowing the baseline absorbed diagnostics is never noise.
    if (format === 'text' && result.baselineHidden > 0) {
      console.log(baselineHiddenSummary(result.baselineHidden));
    }

    // The threshold verdict goes to stderr for every format so it survives
    // --quiet and machine-readable stdout alike.
    if (overWarningLimit) {
      console.error(
        `madr-lint: ${warningCount} warning(s) found, exceeds --max-warnings ${maxWarnings}`,
      );
    }

    process.exit(errorCount > 0 || overWarningLimit ? 1 : 0);
  },
});

await runMain(main);
