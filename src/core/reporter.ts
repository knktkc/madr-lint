import pc from 'picocolors';
import type { Diagnostic, Rule } from './types.js';

export interface Reporter {
  format(diagnostics: readonly Diagnostic[], rulesByName: Map<string, Rule>): string;
}

/**
 * Human-readable reporter for terminal output. Groups diagnostics by file,
 * interpolates {{placeholders}} from `data` against the rule's message
 * template, and ends with a count summary.
 *
 * Coloring uses picocolors which honors NO_COLOR / FORCE_COLOR env vars.
 */
export const textReporter: Reporter = {
  format(diagnostics, rulesByName) {
    if (diagnostics.length === 0) {
      return pc.green('✓ All clear.');
    }

    const byFile = groupByFile(diagnostics);
    const lines: string[] = [];

    for (const [file, fileDiagnostics] of byFile) {
      lines.push(pc.underline(file));
      for (const d of fileDiagnostics) {
        const sev =
          d.severity === 'error'
            ? pc.red('  error  ')
            : pc.yellow('  warn   ');
        const ruleId = pc.dim(d.ruleName.padEnd(28));
        const message = renderMessage(d, rulesByName);
        lines.push(`${sev}${ruleId}  ${message}`);
      }
      lines.push('');
    }

    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.filter((d) => d.severity === 'warn').length;
    lines.push(pc.bold(formatSummary(errors, warnings)));

    return lines.join('\n');
  },
};

function groupByFile(diagnostics: readonly Diagnostic[]): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    if (!map.has(d.path)) map.set(d.path, []);
    map.get(d.path)?.push(d);
  }
  return map;
}

function renderMessage(d: Diagnostic, rulesByName: Map<string, Rule>): string {
  const rule = rulesByName.get(d.ruleName);
  const template = rule?.meta.messages[d.messageId] ?? d.messageId;
  return interpolate(template, d.data ?? {});
}

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = data[key];
    return v !== undefined ? String(v) : `{{${key}}}`;
  });
}

function formatSummary(errors: number, warnings: number): string {
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
  return parts.join(', ');
}
