import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  buildProjectFile,
  runRulesOnFile,
  runRulesOnProject,
} from './runner.js';
import {
  isProjectRule,
  type AnyRule,
  type Diagnostic,
  type ProjectRule,
  type Rule,
  type RuleSeverity,
  type Severity,
} from './types.js';

export interface LintOptions {
  /** All available rules (per-file or project). The orchestrator picks
   *  enabled ones via ruleSeverity and dispatches to the right runner. */
  rules: readonly AnyRule[];
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
 * Lint a list of files against per-file AND project rules.
 *
 * Per-file rules go through `runRulesOnFile` (single-pass AST per file).
 * Project rules go through `runRulesOnProject` (eager parse all files,
 * single check call per rule). See ADR-0005.
 *
 * File contents are read once and shared between both passes.
 */
export function lintFiles(opts: LintOptions): LintResult {
  const allDiagnostics: Diagnostic[] = [];

  // Read all file contents once — shared between per-file and project passes.
  const fileEntries = opts.files.map((absolutePath) => ({
    relativePath: relative(opts.cwd, absolutePath),
    content: readFileSync(absolutePath, 'utf8'),
  }));

  // Partition rules by kind.
  const perFileRules: Rule[] = [];
  const projectRules: ProjectRule[] = [];
  for (const rule of opts.rules) {
    if (isProjectRule(rule)) projectRules.push(rule);
    else perFileRules.push(rule);
  }

  // ── Per-file pass ────────────────────────────────────────────────
  for (const file of fileEntries) {
    const fileContext = {
      content: file.content,
      path: file.relativePath,
    };

    const errorRules: Rule[] = [];
    const warnRules: Rule[] = [];
    for (const rule of perFileRules) {
      const sev = resolveSeverity(opts.ruleSeverity[rule.meta.name]);
      if (sev === 'off') continue;
      if (sev === 'error') errorRules.push(rule);
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

  // ── Project pass ─────────────────────────────────────────────────
  const enabledProjectRules = projectRules.filter(
    (rule) => resolveSeverity(opts.ruleSeverity[rule.meta.name]) !== 'off',
  );
  if (enabledProjectRules.length > 0) {
    const projectFiles = fileEntries.map((f) =>
      buildProjectFile({ path: f.relativePath, content: f.content }),
    );

    const errorRules: ProjectRule[] = [];
    const warnRules: ProjectRule[] = [];
    for (const rule of enabledProjectRules) {
      const sev = resolveSeverity(opts.ruleSeverity[rule.meta.name]);
      if (sev === 'error') errorRules.push(rule);
      else if (sev === 'warn') warnRules.push(rule);
    }

    if (errorRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnProject(errorRules, projectFiles, { severity: 'error' }),
      );
    }
    if (warnRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnProject(warnRules, projectFiles, { severity: 'warn' }),
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
  return config[0];
}
