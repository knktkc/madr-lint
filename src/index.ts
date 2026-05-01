// Public API entry point for madr-lint.

import type { MadrVersion, RuleSeverity } from './core/types.js';

export type {
  Diagnostic,
  FileContext,
  MadrVersion,
  MdastNodeType,
  Rule,
  RuleContext,
  RuleListeners,
  RuleMeta,
  RuleSeverity,
  Severity,
} from './core/types.js';

export * as rules from './rules/index.js';
export { recommended } from './configs/recommended.js';

export interface MadrLintConfig {
  /** Preset configurations to extend (e.g. 'madr-lint:recommended'). */
  extends?: string[];
  /** MADR format version target. 'auto' = detect per-file. */
  madrVersion?: MadrVersion | 'auto';
  /** Directory containing ADR files. */
  adrDir?: string;
  /** Per-rule severity / options overrides. */
  rules?: Record<string, RuleSeverity>;
  /** Glob patterns to skip. */
  ignorePatterns?: string[];
}

/**
 * Helper for type-safe config files. Identity at runtime.
 *
 * Usage:
 * ```typescript
 * // madr-lint.config.ts
 * import { defineConfig } from 'madr-lint';
 * export default defineConfig({
 *   extends: ['madr-lint:recommended'],
 *   madrVersion: 'auto',
 *   adrDir: 'docs/adr',
 *   rules: {
 *     'madr/filename-format': ['error', { pattern: '^[0-9]{4}-.+\\.md$' }],
 *   },
 * });
 * ```
 */
export function defineConfig(config: MadrLintConfig): MadrLintConfig {
  return config;
}
