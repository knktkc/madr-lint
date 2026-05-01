import type {
  Diagnostic,
  FileContext,
  Rule,
  RuleContext,
  Severity,
} from '../../src/core/types.ts';

interface RunRuleOptions {
  /** Per-rule options to merge over rule.meta.defaultOptions. */
  options?: Record<string, unknown>;
  /** Severity to attach to emitted diagnostics. Defaults to 'error'. */
  severity?: Severity;
}

/**
 * Minimal in-memory rule runner for tests.
 *
 * For v0.1.0 only the simple shape (rules that report directly from create()
 * and return void) is exercised. When the first AST-using rule lands the
 * helper grows: parse with gray-matter + mdast-util-from-markdown, walk the
 * tree once, dispatch to listeners returned by create().
 */
export function runRule<TOptions extends Record<string, unknown>>(
  rule: Rule<TOptions>,
  file: FileContext,
  runtime: RunRuleOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const severity = runtime.severity ?? 'error';
  const mergedOptions = {
    ...rule.meta.defaultOptions,
    ...runtime.options,
  } as TOptions;

  const context: RuleContext<TOptions> = {
    file,
    options: mergedOptions,
    report(d) {
      diagnostics.push({
        ruleName: rule.meta.name,
        severity,
        path: file.path,
        ...d,
      });
    },
  };

  const listeners = rule.create(context);
  // listeners returned by AST-based rules will be dispatched once a parser
  // pipeline lands (ADR-0002). Filename/metadata rules return void here.
  void listeners;

  return diagnostics;
}
