import pc from 'picocolors';
import type { AnyRule, Diagnostic } from './types.js';

/**
 * Run-level facts a reporter cannot derive from the diagnostics themselves.
 * Optional third argument so existing two-arg callers keep working.
 */
export interface ReporterMeta {
  /** Diagnostics absorbed by .madr-lint/baseline.json. Absent ⇒ 0. */
  baselineHidden?: number;
}

export interface Reporter {
  format(
    diagnostics: readonly Diagnostic[],
    rulesByName: Map<string, AnyRule>,
    meta?: ReporterMeta,
  ): string;
}

export type ReporterFormat = 'text' | 'json' | 'sarif' | 'github';

/**
 * Human-readable reporter for terminal output. Groups diagnostics by file,
 * interpolates {{placeholders}} from `data` against the rule's message
 * template, and ends with a count summary.
 *
 * Coloring uses picocolors which honors NO_COLOR / FORCE_COLOR env vars.
 */
export const textReporter: Reporter = {
  // Deliberately 2-param (meta unused): the CLI prints baselineHiddenSummary()
  // itself for text format, so the footer can outlive a suppressed banner.
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

function renderMessage(
  d: Diagnostic,
  rulesByName: Map<string, AnyRule>,
): string {
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

/**
 * Machine-readable JSON reporter. Stable shape — additive changes only,
 * tagged via `version`. Tools can `JSON.parse` stdout and consume `results`
 * directly without scraping the human-readable formatter.
 */
export const jsonReporter: Reporter = {
  format(diagnostics, rulesByName, meta) {
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.filter((d) => d.severity === 'warn').length;
    const payload = {
      version: 1,
      summary: {
        total: diagnostics.length,
        errors,
        warnings,
        // Always present (0 when no baseline) so CI consumers can detect an
        // active baseline without probing for the key. SARIF stays untouched.
        baselineHidden: meta?.baselineHidden ?? 0,
      },
      results: diagnostics.map((d) => ({
        path: d.path,
        ruleName: d.ruleName,
        messageId: d.messageId,
        severity: d.severity,
        message: renderMessage(d, rulesByName),
        data: d.data ?? {},
      })),
    };
    return JSON.stringify(payload, null, 2);
  },
};

/**
 * SARIF 2.1.0 reporter. Emits a minimal-but-valid Static Analysis Results
 * Interchange Format document so GitHub Code Scanning, VS Code SARIF
 * Viewer, and other consumers can ingest madr-lint results.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
export const sarifReporter: Reporter = {
  format(diagnostics, rulesByName) {
    const ruleNames = [...new Set(diagnostics.map((d) => d.ruleName))];
    const ruleIndex = new Map(ruleNames.map((name, i) => [name, i]));

    const sarifRules = ruleNames.map((name) => {
      const rule = rulesByName.get(name);
      return {
        id: name,
        name: name.replace(/[^A-Za-z0-9]/g, '_'),
        shortDescription: { text: rule?.meta.docs.description ?? name },
        helpUri: rule?.meta.docs.url,
      };
    });

    const sarifResults = diagnostics.map((d) => ({
      ruleId: d.ruleName,
      ruleIndex: ruleIndex.get(d.ruleName) ?? 0,
      level: d.severity === 'error' ? 'error' : 'warning',
      message: { text: renderMessage(d, rulesByName) },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: d.path, uriBaseId: '%SRCROOT%' },
            region: { startLine: 1 },
          },
        },
      ],
    }));

    const sarif = {
      $schema:
        'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'madr-lint',
              informationUri: 'https://github.com/knktkc/madr-lint',
              rules: sarifRules,
            },
          },
          results: sarifResults,
        },
      ],
    };
    return JSON.stringify(sarif, null, 2);
  },
};

/** Escape a workflow-command message value (data after `::`). */
function escapeGhMessage(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escape a workflow-command property value (e.g. file=, title=). */
function escapeGhProperty(s: string): string {
  return escapeGhMessage(s)
    .replace(/,/g, '%2C')
    .replace(/:/g, '%3A');
}

/**
 * GitHub Actions annotation reporter. Emits one `::error` / `::warning`
 * workflow command per diagnostic so GitHub renders them as PR diff annotations,
 * then a one-line human summary on stdout.
 *
 * Escape rules from https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions
 */
export const githubReporter: Reporter = {
  format(diagnostics, rulesByName, meta) {
    const lines: string[] = [];

    for (const d of diagnostics) {
      const level = d.severity === 'error' ? 'error' : 'warning';
      const file = escapeGhProperty(d.path);
      const title = escapeGhProperty(d.ruleName);
      const message = escapeGhMessage(renderMessage(d, rulesByName));

      const linePart = d.loc ? `,line=${d.loc.line}` : '';
      lines.push(`::${level} file=${file}${linePart},title=${title}::${message}`);
    }

    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.filter((d) => d.severity === 'warn').length;
    const summaryParts: string[] = [];
    if (errors > 0) summaryParts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
    if (warnings > 0) summaryParts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
    // A clean run still prints counts — a silent log line reads as a broken CI step.
    if (summaryParts.length === 0) summaryParts.push('0 errors, 0 warnings');
    const baselineHidden = meta?.baselineHidden ?? 0;
    if (baselineHidden > 0) summaryParts.push(`${baselineHidden} hidden by baseline`);
    lines.push(summaryParts.join(', '));

    return lines.join('\n');
  },
};

export const reporters: Record<ReporterFormat, Reporter> = {
  text: textReporter,
  json: jsonReporter,
  sarif: sarifReporter,
  github: githubReporter,
};
