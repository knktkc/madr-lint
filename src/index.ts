// Public API entry point for madr-lint.

import type { MadrVersion, RuleSeverity } from './core/types.js';

// Types
export type {
  AnyRule,
  Diagnostic,
  FileContext,
  MadrVersion,
  MdastNode,
  MdastNodeType,
  ProjectFile,
  ProjectRule,
  ProjectRuleContext,
  Rule,
  RuleContext,
  RuleListeners,
  RuleMeta,
  RuleSeverity,
  Severity,
} from './core/types.js';

// Per-file runner + project runner (programmatic linting API)
export {
  buildProjectFile,
  runRule,
  runRulesOnFile,
  runRulesOnProject,
  RuleOptionsError,
  INTERNAL_ERROR_RULE_NAME,
} from './core/runner.js';
export type { RunRuleOptions } from './core/runner.js';

// Type guard for distinguishing project rules from per-file rules
export { isProjectRule } from './core/types.js';

// Parser — exposed for tools that want to parse without linting,
// including the v2 list-metadata extractor (ADR-0006).
export { parseFile, extractListMetadata } from './core/parser.js';
export type { ParsedFile } from './core/parser.js';

// Built-in rules and presets
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
  /**
   * Filename / path patterns to skip. Phase 1 supports exact basename,
   * full relative path, path suffix, and trailing wildcard (e.g.
   * `9999-*`). Full glob support is on the roadmap.
   */
  ignorePatterns?: string[];
  /** Enable per-file content-hash cache. Default: true. */
  cache?: boolean;
  /** Cache directory. Default: '.madr-lint/cache'. */
  cacheLocation?: string;
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
 *   ignorePatterns: ['README.md', 'template.md'],
 *   rules: {
 *     'madr/filename-format': ['error', { pattern: '^[0-9]{4}-.+\\.md$' }],
 *   },
 * });
 * ```
 */
export function defineConfig(config: MadrLintConfig): MadrLintConfig {
  return config;
}
