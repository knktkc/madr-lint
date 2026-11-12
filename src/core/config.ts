import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import { recommended } from '../configs/recommended.js';
import type { MadrLintConfig } from '../index.js';
import * as builtinRules from '../rules/index.js';
import { closestMatch } from './suggest.js';
import type { AnyRule, MadrVersion, RuleSeverity } from './types.js';

export interface ResolvedConfig {
  /** ADR directory, relative to cwd or absolute. Default: 'docs/adr'. */
  adrDir: string;
  /** Per-rule severity / options map. Empty when no preset extended. */
  rules: Record<string, RuleSeverity>;
  /** Glob patterns to skip. */
  ignorePatterns: string[];
  /** MADR version target. Default: 'auto'. */
  madrVersion: MadrVersion | 'auto';
  /** Whether to use per-file content-hash cache. Default: true. */
  cache: boolean;
  /** Cache directory (relative to cwd). Default: '.madr-lint/cache'. */
  cacheLocation: string;
}

/**
 * Config file resolution order. First match wins.
 *
 * `.json` is parsed directly (no module loader), so it stays the fastest
 * and dependency-free path. The other extensions go through `jiti`,
 * which transpiles TS/ESM/CJS on the fly.
 */
export const CONFIG_FILES = [
  '.madrlintrc.json',
  '.madrlintrc.ts',
  '.madrlintrc.mts',
  '.madrlintrc.js',
  '.madrlintrc.mjs',
  '.madrlintrc.cjs',
  'madr-lint.config.ts',
  'madr-lint.config.mts',
  'madr-lint.config.js',
  'madr-lint.config.mjs',
  'madr-lint.config.cjs',
];

/** The config file loaded but holds a value madr-lint does not accept. */
export class InvalidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConfigError';
  }
}

const MADR_VERSIONS = ['v2', 'v3', 'v4', 'auto'] as const;

function isMadrVersion(value: unknown): value is ResolvedConfig['madrVersion'] {
  return MADR_VERSIONS.some((v) => v === value);
}

export class ConfigFileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigFileNotFoundError';
  }
}

/**
 * Load and resolve a config from an explicit file path, bypassing discovery.
 * Throws `ConfigFileNotFoundError` if the file does not exist.
 * Throws `SyntaxError` or other load errors if the file is malformed.
 */
export function loadConfigFromPath(filePath: string): ResolvedConfig {
  // Race-free error classification: fs check-APIs (existsSync/statSync) before
  // a use are TOCTOU by construction (CodeQL js/file-system-race). Reading IS
  // the use, so classify its errors instead: ENOENT/EISDIR carry exactly the
  // two cases we distinguish, with no check-then-use window.
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ConfigFileNotFoundError(`Config file not found: ${filePath}`);
    }
    // A directory exists on disk but jiti's failure reads like a missing
    // npm package ("Cannot find module") — fail with an honest message instead.
    if (code === 'EISDIR') {
      throw new ConfigFileNotFoundError(
        `Config path is a directory, not a file: ${filePath}`,
      );
    }
    throw err;
  }
  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(raw) as MadrLintConfig;
    return resolveExtends(parsed);
  }
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded = jiti(filePath) as MadrLintConfig | { default: MadrLintConfig };
  const config: MadrLintConfig =
    typeof loaded === 'object' && loaded !== null && 'default' in loaded
      ? (loaded.default as MadrLintConfig)
      : (loaded as MadrLintConfig);
  return resolveExtends(config);
}

/**
 * Loads and resolves a config from `cwd`. If no config file is found,
 * returns the defaults (no rules enabled — caller can opt into the
 * recommended preset by extending).
 *
 * `.json` is read synchronously and parsed inline. All other extensions
 * are loaded via `jiti`, supporting TypeScript and both module systems.
 */
export function loadConfig(cwd: string): ResolvedConfig {
  for (const name of CONFIG_FILES) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;

    if (name.endsWith('.json')) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as MadrLintConfig;
      return resolveExtends(parsed);
    }

    const jiti = createJiti(import.meta.url, { interopDefault: true });
    const loaded = jiti(path) as MadrLintConfig | { default: MadrLintConfig };
    const config: MadrLintConfig =
      typeof loaded === 'object' && loaded !== null && 'default' in loaded
        ? (loaded.default as MadrLintConfig)
        : (loaded as MadrLintConfig);
    return resolveExtends(config);
  }
  return resolveExtends({});
}

/** The rule IDs and presets a config may name. */
interface KnownConfigNames {
  rules: ReadonlySet<string>;
  presets: ReadonlyMap<string, Readonly<Record<string, RuleSeverity>>>;
}

/**
 * Built from the rule registry rather than a hand-kept list, so a new rule is
 * configurable as soon as it is registered, and plugins (#31) can add their
 * namespaces here later.
 */
const BUILTIN_CONFIG_NAMES: KnownConfigNames = {
  rules: new Set(
    Object.values(builtinRules).map((rule: AnyRule) => rule.meta.name),
  ),
  presets: new Map([['madr-lint:recommended', recommended]]),
};

const RESERVED_RULE_NAMESPACE = 'core/';
const RULES_DOCS_URL = 'https://knktkc.github.io/madr-lint/rules/';

function quoteList(values: Iterable<string>): string {
  return [...values].map((v) => `"${v}"`).join(', ');
}

function didYouMean(value: string, known: Iterable<string>): string | undefined {
  const match = closestMatch(value, known);
  return match === undefined ? undefined : `Did you mean "${match}"?`;
}

/**
 * Normalizes `extends` to a list. A bare string has always worked (by way of
 * `String.prototype.includes`), so it stays accepted as a one-entry list.
 */
function extendsEntries(value: unknown, problems: string[]): unknown[] {
  if (value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  problems.push(
    `Invalid extends ${JSON.stringify(value)}: use a preset name or a list of preset names.`,
  );
  return [];
}

/**
 * Pure function: turns a raw `MadrLintConfig` into a `ResolvedConfig`
 * with defaults filled in and `extends` presets merged.
 *
 * Only what the user wrote is checked; preset contents are trusted. Every
 * problem goes into one `InvalidConfigError` so the config can be fixed in
 * one pass.
 */
export function resolveExtends(config: MadrLintConfig): ResolvedConfig {
  const known = BUILTIN_CONFIG_NAMES;
  const problems: string[] = [];

  // madrVersion selects the metadata source and which rules run (#207). An
  // unknown value would read frontmatter only and skip every project rule, so
  // stop instead of linting with a silently different setup.
  const rawMadrVersion: unknown = config.madrVersion ?? 'auto';
  const madrVersion = isMadrVersion(rawMadrVersion) ? rawMadrVersion : 'auto';
  if (!isMadrVersion(rawMadrVersion)) {
    problems.push(
      `Invalid madrVersion ${JSON.stringify(rawMadrVersion)}: use one of ${quoteList(MADR_VERSIONS)}.`,
    );
  }

  // An unknown preset or rule ID used to be dropped silently, so a typo could
  // leave no rule running while the CLI exited 0 (#206).
  const baseRules: Record<string, RuleSeverity> = {};
  for (const entry of extendsEntries(config.extends, problems)) {
    const preset = typeof entry === 'string' ? known.presets.get(entry) : undefined;
    if (preset !== undefined) {
      Object.assign(baseRules, preset);
      continue;
    }
    const hint =
      (typeof entry === 'string' ? didYouMean(entry, known.presets.keys()) : undefined) ??
      `Known presets: ${quoteList(known.presets.keys())}.`;
    problems.push(`Unknown preset ${JSON.stringify(entry)} in extends. ${hint}`);
  }

  for (const name of Object.keys(config.rules ?? {})) {
    if (known.rules.has(name)) continue;
    if (name.startsWith(RESERVED_RULE_NAMESPACE)) {
      problems.push(
        `Rule "${name}" in rules cannot be configured: "${RESERVED_RULE_NAMESPACE}" rule IDs are reserved for madr-lint's own diagnostics.`,
      );
      continue;
    }
    const hint =
      didYouMean(name, known.rules) ?? `See ${RULES_DOCS_URL} for the list of rules.`;
    problems.push(`Unknown rule "${name}" in rules. ${hint}`);
  }

  if (problems.length === 1) throw new InvalidConfigError(problems[0]);
  if (problems.length > 1) {
    throw new InvalidConfigError(
      `Invalid config (${problems.length} problems):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  return {
    adrDir: config.adrDir ?? 'docs/adr',
    rules: { ...baseRules, ...config.rules },
    ignorePatterns: config.ignorePatterns ?? [],
    madrVersion,
    cache: config.cache ?? true,
    cacheLocation: config.cacheLocation ?? '.madr-lint/cache',
  };
}
