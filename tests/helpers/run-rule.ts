import type { Diagnostic, FileContext, Rule, RuleContext } from '../../src/core/types.ts';

// Minimal in-memory rule runner for tests.
// At v0.1.0, AST parsing is unnecessary because the first rule (filename-format)
// inspects only the path string. This helper grows a parser step
// (mdast-util-from-markdown + gray-matter) when the first AST-using rule lands.
export function runRule(
  rule: Rule,
  file: FileContext,
  options: Record<string, unknown> = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const mergedOptions = { ...rule.meta.defaultOptions, ...options };
  const context: RuleContext = {
    file,
    options: mergedOptions,
    report(d) {
      diagnostics.push({
        ruleName: rule.meta.name,
        severity: 'error',
        path: file.path,
        ...d,
      });
    },
  };
  rule.create(context);
  return diagnostics;
}
