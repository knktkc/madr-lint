import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
}

/** Config files searched in order. Phase 1: JSON only. */
const CONFIG_FILES = ['.madrlintrc.json'];

/**
 * Loads and resolves a config from `cwd`. If no config file is found,
 * returns the defaults (no rules enabled — caller can opt into the
 * recommended preset by extending).
 */
export function loadConfig(cwd: string): ResolvedConfig {
  for (const name of CONFIG_FILES) {
    const path = resolve(cwd, name);
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as MadrLintConfig;
      return resolveExtends(parsed);
    }
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
  };
}
