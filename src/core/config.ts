import { existsSync, readFileSync, statSync, type Stats } from 'node:fs';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import { recommended } from '../configs/recommended.js';
import type { MadrLintConfig } from '../index.js';
import type { MadrVersion, RuleSeverity } from './types.js';

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
const CONFIG_FILES = [
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
  // Single statSync instead of existsSync→statSync: the redundant pre-check
  // opens a check-then-use window CodeQL flags as js/file-system-race (TOCTOU).
  let st: Stats;
  try {
    st = statSync(filePath);
  } catch {
    throw new ConfigFileNotFoundError(`Config file not found: ${filePath}`);
  }
  // A directory exists on disk but jiti's failure reads like a missing
  // npm package ("Cannot find module") — fail with an honest message instead.
  if (st.isDirectory()) {
    throw new ConfigFileNotFoundError(
      `Config path is a directory, not a file: ${filePath}`,
    );
  }
  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as MadrLintConfig;
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

/**
 * Pure function: turns a raw `MadrLintConfig` into a `ResolvedConfig`
 * with defaults filled in and `extends` presets merged.
 */
export function resolveExtends(config: MadrLintConfig): ResolvedConfig {
  const baseRules: Record<string, RuleSeverity> = config.extends?.includes(
    'madr-lint:recommended',
  )
    ? { ...recommended }
    : {};

  return {
    adrDir: config.adrDir ?? 'docs/adr',
    rules: { ...baseRules, ...config.rules },
    ignorePatterns: config.ignorePatterns ?? [],
    madrVersion: config.madrVersion ?? 'auto',
    cache: config.cache ?? true,
    cacheLocation: config.cacheLocation ?? '.madr-lint/cache',
  };
}
