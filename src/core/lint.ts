import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { runRulesOnFile } from './runner.js';
import type { Diagnostic, Rule, RuleSeverity, Severity } from './types.js';

export interface LintOptions {
  /** All available rules. The orchestrator picks enabled ones via ruleSeverity. */
  rules: readonly Rule[];
  /** User-configured severity per rule name. Missing entry === 'off'. */
  ruleSeverity: Record<string, RuleSeverity>;
  /** Files to lint, absolute or cwd-relative paths. */
  files: readonly string[];
  /** Working directory. Diagnostics' `path` is reported relative to this. */
  cwd: string;
}

export interface LintResult {
  filesChecked: number;
  diagnostics: Diagnostic[];
}

/**
 * Lint a list of files against a list of rules with a per-rule severity map.
 * For each file, rules are grouped by severity and dispatched to
 * runRulesOnFile in two passes (one per severity) so each pass benefits
 * from single-pass AST traversal.
 */
export function lintFiles(opts: LintOptions): LintResult {
  const allDiagnostics: Diagnostic[] = [];

  for (const file of opts.files) {
    const content = readFileSync(file, 'utf8');
    const fileContext = {
      content,
      path: relative(opts.cwd, file),
    };

    const errorRules: Rule[] = [];
    const warnRules: Rule[] = [];

    for (const rule of opts.rules) {
      const severity = resolveSeverity(opts.ruleSeverity[rule.meta.name]);
      if (severity === 'off') continue;
      if (severity === 'error') errorRules.push(rule);
      else warnRules.push(rule);
    }

    if (errorRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnFile(errorRules, fileContext, { severity: 'error' }),
      );
    }
    if (warnRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnFile(warnRules, fileContext, { severity: 'warn' }),
      );
    }
  }

  return {
    filesChecked: opts.files.length,
    diagnostics: allDiagnostics,
  };
}

function resolveSeverity(config: RuleSeverity | undefined): Severity | 'off' {
  if (config === undefined) return 'off';
  if (typeof config === 'string') return config;
  // Tuple form: [Severity, options] — options not yet wired into runner
  return config[0];
}
