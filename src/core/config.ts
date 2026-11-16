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
    return resolveExtends(JSON.parse(raw) as unknown);
  }
  const { config, origin } = loadModule(filePath);
  return resolveExtends(config, origin);
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
      return resolveExtends(JSON.parse(readFileSync(path, 'utf8')) as unknown);
    }

    const { config, origin } = loadModule(path);
    return resolveExtends(config, origin);
  }
  return resolveExtends({});
}

interface LoadedModule {
  /** The default export, or the exports object when there is none. */
  config: unknown;
  origin: ConfigOrigin;
}

function loadModule(path: string): LoadedModule {
  // interopDefault keeps `import base from './base.cjs'` inside a config
  // working. Its proxy answers `.default` with the whole module when the
  // default export is null or undefined, and `.__esModule` with true for every
  // module, so read both properties as written.
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded: unknown = jiti(path);
  if (typeof loaded !== 'function' && (typeof loaded !== 'object' || loaded === null)) {
    return { config: loaded, origin: { module: { hasDefaultExport: true, esModule: false } } };
  }
  const esModule = Boolean(Object.getOwnPropertyDescriptor(loaded, '__esModule')?.value);
  const own = Object.getOwnPropertyDescriptor(loaded, 'default');
  if (own === undefined) {
    return { config: loaded, origin: { module: { hasDefaultExport: false, esModule } } };
  }
  return {
    config: own.get === undefined ? own.value : own.get.call(loaded),
    origin: { module: { hasDefaultExport: true, esModule } },
  };
}

/** Where a raw config came from, for checks that depend on the file format. */
export interface ConfigOrigin {
  /** Set when the config came from a JS/TS module rather than JSON. */
  module?: {
    /** False when the module has no default export: its exports are the config. */
    hasDefaultExport: boolean;
    /** jiti marks a module written in ESM syntax with `__esModule`. */
    esModule: boolean;
  };
}

/**
 * Every top-level key madr-lint reads. Checked against `MadrLintConfig` so a
 * key added to the interface but not here fails the typecheck.
 */
const CONFIG_KEYS = {
  extends: true,
  madrVersion: true,
  adrDir: true,
  rules: true,
  ignorePatterns: true,
  cache: true,
  cacheLocation: true,
} as const satisfies Record<keyof MadrLintConfig, true>;

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set(Object.keys(CONFIG_KEYS));

const PROMISE_PROBLEM =
  'The config must be an object, not a Promise. Async configs are not supported: export the config object itself.';

const NO_DEFAULT_EXPORT_NOTE =
  'The config file has no default export, so its exports were read as the config.';

// A key that can be written after `export default` / `module.exports =`.
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

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

// Long enough for any realistic rule ID, short enough to keep one problem on
// one screen line when someone pastes a huge key.
const MAX_SHOWN_LENGTH = 80;

function truncate(text: string): string {
  if (text.length <= MAX_SHOWN_LENGTH) return text;
  let cut = text.slice(0, MAX_SHOWN_LENGTH);
  // Cutting between the halves of a surrogate pair leaves a broken character.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut}…`;
}

const UNPRINTABLE = 'an unprintable value';

/**
 * Renders a config value from the user for an error message. JS configs can
 * hold anything, so this must not throw: `JSON.stringify` throws on a bigint
 * or a cycle, and returns undefined for a symbol, a function, or undefined.
 * A revoked Proxy or a throwing `toJSON` / `Symbol.toStringTag` defeats every
 * way of printing it, so the last resort is a fixed description.
 */
function formatValue(value: unknown): string {
  try {
    return formatValueUnguarded(value);
  } catch {
    return UNPRINTABLE;
  }
}

function formatValueUnguarded(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(truncate(value));
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return truncate(value.toString());
    case 'function':
      return 'a function';
    case 'undefined':
    case 'number':
    case 'boolean':
      return String(value);
    default:
      try {
        return truncate(JSON.stringify(value) ?? Object.prototype.toString.call(value));
      } catch {
        return truncate(Object.prototype.toString.call(value));
      }
  }
}

function quoteList(values: Iterable<string>): string {
  return [...values].map((v) => `"${v}"`).join(', ');
}

function didYouMean(value: string, known: Iterable<string>): string | undefined {
  const match = closestMatch(value, known);
  return match === undefined ? undefined : `Did you mean "${match}"?`;
}

/**
 * `null`, `undefined`, and `false` mean "absent" for top-level `extends` and
 * `rules` and for entries of an `extends` array. They were ignored before
 * #206, and JS configs rely on that (`rules: ci && {...}`,
 * `extends: [ci && 'preset']`).
 */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === false;
}

/** `Array.isArray`, but undefined instead of a throw for a revoked Proxy. */
function tryIsArray(value: unknown): boolean | undefined {
  try {
    return Array.isArray(value);
  } catch {
    return undefined;
  }
}

/**
 * Own and inherited enumerable string keys, the ones `for...in` yields and a
 * property read can find. Undefined instead of a throw for a hostile Proxy.
 */
function tryEnumerableKeys(value: object): string[] | undefined {
  try {
    const keys: string[] = [];
    for (const key in value) {
      if (!Object.hasOwn(value, key) && isObjectPrototypeAddition(key)) continue;
      keys.push(key);
    }
    return keys;
  } catch {
    return undefined;
  }
}

/**
 * An enumerable property that some dependency added to `Object.prototype`.
 * Every object inherits it, so it says nothing about the config and the user
 * cannot remove it there. Built-in names such as `toString` are not
 * enumerable, so a `toString` inherited from another prototype still counts.
 */
function isObjectPrototypeAddition(key: string): boolean {
  return Object.prototype.propertyIsEnumerable(key);
}

/** `object[key]`, but undefined instead of a throw from a getter or Proxy. */
function tryGet(object: object, key: string): unknown {
  try {
    return (object as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** What `tryRead` returns when a getter or Proxy trap throws. */
const UNREADABLE: unique symbol = Symbol('unreadable');

/** Like `tryGet`, but a throw is told apart from a value that is undefined. */
function tryRead(object: object, key: string | number): unknown {
  try {
    return (object as Record<string | number, unknown>)[key];
  } catch {
    return UNREADABLE;
  }
}

function formatRead(value: unknown): string {
  return value === UNREADABLE ? UNPRINTABLE : formatValue(value);
}

/**
 * The length of an array, or undefined for anything else. A Proxy can make
 * `Array.isArray` or the length read throw; then it is UNREADABLE.
 */
function tryArrayLength(value: unknown): unknown {
  const isArray = tryIsArray(value);
  if (isArray === undefined) return UNREADABLE;
  return isArray ? tryRead(value as object, 'length') : undefined;
}

function isThenable(value: unknown): boolean {
  if (typeof value !== 'function' && (typeof value !== 'object' || value === null)) {
    return false;
  }
  return typeof tryGet(value, 'then') === 'function';
}

/**
 * Keys a module system adds, not the user: `__esModule` from transpiled
 * modules, and `default` pointing back at the object (`module.exports = c;
 * module.exports.default = c`). Spreading such a module (`{ ...base }`)
 * copies a `default` that points at the module instead, so an object whose
 * own `default` is itself counts too.
 */
function isModuleInteropKey(config: object, key: string): boolean {
  if (key === '__esModule') return true;
  if (key !== 'default') return false;
  const value = tryGet(config, 'default');
  return value === config || isSelfReferencingDefault(value);
}

function isSelfReferencingDefault(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  try {
    return Object.hasOwn(value, 'default') && (value as { default: unknown }).default === value;
  } catch {
    return false;
  }
}

function looksLikeConfig(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || tryIsArray(value) !== false) {
    return false;
  }
  return (tryEnumerableKeys(value) ?? []).some((key) => KNOWN_CONFIG_KEYS.has(key));
}

function looksLikeConfigHint(key: string): string {
  const name = key.length <= MAX_SHOWN_LENGTH && IDENTIFIER.test(key) ? key : '{...}';
  return `The export ${formatValue(key)} looks like a config. Export it as the default: \`export default ${name}\` (ESM) or \`module.exports = ${name}\` (CommonJS).`;
}

/**
 * At most one line, for a module without a default export. `module.exports =
 * {...}` is such a module at runtime, so plain CommonJS gets a hint only when
 * an export looks like the config.
 */
function noDefaultExportHint(
  config: object,
  unknownKeys: readonly string[],
  origin: ConfigOrigin,
): string | undefined {
  const module = origin.module;
  if (module === undefined || module.hasDefaultExport || unknownKeys.length === 0) {
    return undefined;
  }
  const configLike = unknownKeys.find((key) => looksLikeConfig(tryGet(config, key)));
  if (configLike !== undefined) return looksLikeConfigHint(configLike);
  return module.esModule ? NO_DEFAULT_EXPORT_NOTE : undefined;
}

/**
 * Normalizes `extends` to a list. A bare string has always worked (by way of
 * `String.prototype.includes`), so it stays accepted as a one-entry list.
 */
function extendsEntries(value: unknown, problems: string[]): unknown[] {
  if (isAbsent(value)) return [];
  if (typeof value === 'string') return [value];
  if (tryIsArray(value) === true) {
    return (value as unknown[]).filter((entry) => !isAbsent(entry));
  }
  problems.push(
    `Invalid extends ${formatValue(value)}: use a preset name or a list of preset names.`,
  );
  return [];
}

/**
 * A path setting (`adrDir`, `cacheLocation`). null and undefined mean "not
 * set", as they always did through `??`.
 */
function pathSetting(
  config: object,
  key: 'adrDir' | 'cacheLocation',
  example: string,
  problems: string[],
): string | undefined {
  const value = tryRead(config, key);
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value !== '') return value;
  problems.push(
    `Invalid ${key} ${formatRead(value)}: use a non-empty string, such as "${example}".`,
  );
  return undefined;
}

function cacheSetting(config: object, problems: string[]): boolean | undefined {
  const value = tryRead(config, 'cache');
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  problems.push(`Invalid cache ${formatRead(value)}: use true or false.`);
  return undefined;
}

/**
 * A string used to be read character by character, so `"0001-*"` ignored
 * every file through its `*` (#229). Returns a copy, so the patterns are read
 * once.
 */
function ignorePatternsSetting(config: object, problems: string[]): string[] | undefined {
  const value = tryRead(config, 'ignorePatterns');
  if (value === null || value === undefined) return undefined;
  const length = tryArrayLength(value);
  if (typeof length !== 'number') {
    problems.push(
      `Invalid ignorePatterns ${length === UNREADABLE ? UNPRINTABLE : formatRead(value)}: use a list of glob patterns, such as ["template.md"].`,
    );
    return undefined;
  }
  const patterns: string[] = [];
  // Index reads, because a hole is an invalid entry too. Only the first bad
  // entry is reported: a sparse list of length 1e8 would otherwise add 1e8
  // problems.
  for (let i = 0; i < length; i++) {
    const entry = tryRead(value as object, i);
    if (typeof entry !== 'string' || entry === '') {
      problems.push(`Invalid ignorePatterns entry ${formatRead(entry)}: use a non-empty string.`);
      return undefined;
    }
    patterns.push(entry);
  }
  return patterns;
}

const SEVERITIES = ['error', 'warn', 'off'] as const;

// ESLint's numeric severities, indexed by number.
const ESLINT_SEVERITIES: readonly string[] = ['off', 'warn', 'error'];

const SEVERITY_USE = `use one of ${quoteList(SEVERITIES)}.`;
const RULE_VALUE_USE = `use one of ${quoteList(SEVERITIES)}, or a list [severity, options].`;

function severityProblem(value: unknown, rule: string, use: string): string | undefined {
  if (typeof value === 'string') {
    if (SEVERITIES.some((s) => s === value)) return undefined;
    const hint = didYouMean(value, SEVERITIES);
    return `Invalid severity ${formatValue(value)} for rule ${rule}: ${SEVERITY_USE}${hint === undefined ? '' : ` ${hint}`}`;
  }
  const eslint = typeof value === 'number' ? ESLINT_SEVERITIES[value] : undefined;
  if (eslint !== undefined) {
    return `Invalid severity ${formatValue(value)} for rule ${rule}: use "${eslint}" instead.`;
  }
  return `Invalid severity ${formatRead(value)} for rule ${rule}: ${use}`;
}

/**
 * A severity, `[severity]`, or `[severity, options]`. An unknown severity used
 * to run a per-file rule as a warning and skip a project rule (#229). The
 * contents of `options` are left to the rule's schema, checked when it runs.
 */
function ruleValueProblems(name: string, value: unknown, problems: string[]): void {
  const rule = formatValue(name);
  const length = tryArrayLength(value);
  if (length === undefined) {
    const problem = severityProblem(value, rule, RULE_VALUE_USE);
    if (problem !== undefined) problems.push(problem);
    return;
  }
  if (length !== 1 && length !== 2) {
    problems.push(
      `Invalid severity ${length === UNREADABLE ? UNPRINTABLE : formatValue(value)} for rule ${rule}: ${RULE_VALUE_USE}`,
    );
    return;
  }
  const problem = severityProblem(tryRead(value as object, 0), rule, SEVERITY_USE);
  if (problem !== undefined) problems.push(problem);
  if (length === 1) return;
  // Absent options mean the rule's defaults, as before (`['error', ci && {...}]`).
  const options = tryRead(value as object, 1);
  if (isAbsent(options)) return;
  if (typeof options !== 'object' || options === null || tryIsArray(options) !== false) {
    problems.push(`Invalid options ${formatRead(options)} for rule ${rule}: use an object.`);
  }
}

/**
 * Pure function: turns a raw config (whatever the file yielded) into a
 * `ResolvedConfig` with defaults filled in and `extends` presets merged.
 *
 * Only what the user wrote is checked; preset contents are trusted. Every
 * problem goes into one `InvalidConfigError` so the config can be fixed in
 * one pass, in this order: the config's shape and unknown keys, madrVersion,
 * adrDir, ignorePatterns, cache, cacheLocation, extends, then each rule (its
 * name, then its severity).
 */
export function resolveExtends(raw: unknown, origin: ConfigOrigin = {}): ResolvedConfig {
  const known = BUILTIN_CONFIG_NAMES;
  const problems: string[] = [];

  // A key madr-lint does not read used to be dropped silently, so a typo or a
  // config in a named export had no effect and the run went on without it
  // (#222).
  let config: MadrLintConfig = {};
  const unknownKeys: string[] = [];
  let exportHint: string | undefined;
  if (isThenable(raw)) {
    problems.push(PROMISE_PROBLEM);
  } else if (typeof raw !== 'object' || raw === null || tryIsArray(raw) !== false) {
    problems.push(`The config must be an object, not ${formatValue(raw)}.`);
  } else {
    config = raw as MadrLintConfig;
    const keys = tryEnumerableKeys(raw);
    if (keys === undefined) problems.push('Cannot list the keys of the config.');
    for (const key of keys ?? []) {
      if (KNOWN_CONFIG_KEYS.has(key)) continue;
      if (origin.module !== undefined && isModuleInteropKey(raw, key)) continue;
      unknownKeys.push(key);
      const suggestion =
        didYouMean(key, KNOWN_CONFIG_KEYS) ?? `Known keys: ${quoteList(KNOWN_CONFIG_KEYS)}.`;
      problems.push(`Unknown key ${formatValue(key)} in the config. ${suggestion}`);
    }
    exportHint = noDefaultExportHint(raw, unknownKeys, origin);
  }

  // madrVersion selects the metadata source and which rules run (#207). An
  // unknown value would read frontmatter only and skip every project rule, so
  // stop instead of linting with a silently different setup.
  const rawMadrVersion: unknown = config.madrVersion ?? 'auto';
  const madrVersion = isMadrVersion(rawMadrVersion) ? rawMadrVersion : 'auto';
  if (!isMadrVersion(rawMadrVersion)) {
    problems.push(
      `Invalid madrVersion ${formatValue(rawMadrVersion)}: use one of ${quoteList(MADR_VERSIONS)}.`,
    );
  }

  // A value of the wrong type used to crash with a stack trace (exit 1) or
  // quietly change what was linted (#229). Each value is read once, and the
  // value checked is the value returned.
  const adrDir = pathSetting(config, 'adrDir', 'docs/adr', problems);
  const ignorePatterns = ignorePatternsSetting(config, problems);
  const cache = cacheSetting(config, problems);
  const cacheLocation = pathSetting(config, 'cacheLocation', '.madr-lint/cache', problems);

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
    problems.push(`Unknown preset ${formatValue(entry)} in extends. ${hint}`);
  }

  const rules: unknown = isAbsent(config.rules) ? {} : config.rules;
  // Only the user's values: preset severities are trusted, and a user value
  // overrides the preset's.
  const userRules: Record<string, RuleSeverity> = {};
  if (typeof rules !== 'object' || rules === null || tryIsArray(rules) !== false) {
    // Checked as a whole: listing the keys of a string or an array would
    // report each index ("0", "1", ...) as an unknown rule.
    problems.push(
      `Invalid rules ${formatValue(rules)}: use an object that maps rule IDs to severities.`,
    );
  } else {
    for (const name of Object.keys(rules)) {
      const isKnownRule = known.rules.has(name);
      if (!isKnownRule) {
        if (name.startsWith(RESERVED_RULE_NAMESPACE)) {
          problems.push(
            `Rule ${formatValue(name)} in rules cannot be configured: "${RESERVED_RULE_NAMESPACE}" rule IDs are reserved for madr-lint's own diagnostics.`,
          );
          continue;
        }
        const hint =
          didYouMean(name, known.rules) ?? `See ${RULES_DOCS_URL} for the list of rules.`;
        problems.push(`Unknown rule ${formatValue(name)} in rules. ${hint}`);
      }
      const value = tryRead(rules, name);
      // Absent, as for top-level rules and extends entries: the entry counts
      // as not written, so a preset's severity stays. null used to crash.
      if (isAbsent(value)) continue;
      ruleValueProblems(name, value, problems);
      if (isKnownRule) userRules[name] = value as RuleSeverity;
    }
  }

  if (problems.length > 0) {
    let message =
      problems.length === 1
        ? problems[0]
        : `Invalid config (${problems.length} problems):\n${problems.map((p) => `  - ${p}`).join('\n')}`;
    // Not a problem of its own: it explains the unknown keys above it.
    if (exportHint !== undefined) message += `\n${exportHint}`;
    throw new InvalidConfigError(message);
  }

  return {
    adrDir: adrDir ?? 'docs/adr',
    rules: { ...baseRules, ...userRules },
    ignorePatterns: ignorePatterns ?? [],
    madrVersion,
    cache: cache ?? true,
    cacheLocation: cacheLocation ?? '.madr-lint/cache',
  };
}
