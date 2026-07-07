import { beforeAll, describe, expect, it } from 'vitest';
import {
  githubReporter,
  jsonReporter,
  reporters,
  sarifReporter,
  textReporter,
} from '../../src/core/reporter.js';
import type { AnyRule, Diagnostic, Rule } from '../../src/core/types.js';

beforeAll(() => {
  process.env.NO_COLOR = '1';
});

function makeRule(name: string, messages: Record<string, string>): Rule {
  return {
    meta: {
      name,
      type: 'perFile',
      versionCompat: ['v2'],
      docs: { description: '', recommended: false },
      messages,
      defaultOptions: {},
    },
    create() {},
  };
}

// Build a Diagnostic with the runner-resolved fields (`suggestion`, `docsUrl`,
// `fixable`) defaulted so the reporters — which read them off the diagnostic —
// can be exercised without hand-writing them in every case. Reporters treat a
// null suggestion / empty docsUrl as "absent" and fixable:false as "no fix".
function diag(
  d: Omit<Diagnostic, 'suggestion' | 'docsUrl' | 'fixable'> &
    Partial<Pick<Diagnostic, 'suggestion' | 'docsUrl' | 'fixable'>>,
): Diagnostic {
  return { suggestion: null, docsUrl: '', fixable: false, ...d };
}

describe('core/reporter — text', () => {
  it('returns "All clear" when there are no diagnostics', () => {
    expect(textReporter.format([], new Map())).toContain('All clear');
  });

  it('groups diagnostics by file path', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { foo: 'msg {{x}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'foo', severity: 'error', path: 'a.md', data: { x: 1 } }),
      diag({ ruleName: 'test/r', messageId: 'foo', severity: 'error', path: 'a.md', data: { x: 2 } }),
      diag({ ruleName: 'test/r', messageId: 'foo', severity: 'warn', path: 'b.md', data: { x: 3 } }),
    ];
    const out = textReporter.format(diagnostics, rules);
    expect(out).toContain('a.md');
    expect(out).toContain('b.md');
    // a.md appears once as a header even though it has 2 diagnostics
    expect(out.match(/a\.md/g) ?? []).toHaveLength(1);
  });

  it('renders {{placeholder}} from data', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { hello: 'Hello {{name}}!' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'test/r',
        messageId: 'hello',
        severity: 'error',
        path: 'a.md',
        data: { name: 'world' },
      }),
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('Hello world!');
  });

  it('shows summary with error and warning counts', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' }),
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' }),
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'warn', path: 'b.md' }),
    ];
    const out = textReporter.format(diagnostics, rules);
    expect(out).toContain('2 errors');
    expect(out).toContain('1 warning');
  });

  it('falls back to messageId when rule or template is missing', () => {
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'unknown/rule', messageId: 'mystery', severity: 'error', path: 'a.md' }),
    ];
    const out = textReporter.format(diagnostics, new Map());
    expect(out).toContain('mystery');
  });

  it('includes rule name in each diagnostic line', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' }),
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('test/r');
  });

  it('keeps unmatched placeholders intact (visible bug surface)', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'value: {{notProvided}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', data: {} }),
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('{{notProvided}}');
  });

  // ── self-contained diagnostics (#67) ─────────────────────────────────
  it('renders an indented → suggestion line under a diagnostic that has one', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'the problem' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'test/r',
        messageId: 'x',
        severity: 'error',
        path: 'a.md',
        suggestion: 'apply the concrete fix',
      }),
    ];
    const out = textReporter.format(diagnostics, rules);
    expect(out).toContain('→ apply the concrete fix');
  });

  it('renders no suggestion line when suggestion is null', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'the problem' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' }),
    ];
    expect(textReporter.format(diagnostics, rules)).not.toContain('→');
  });

  it('prints the docs URL once per rule per file group (not per diagnostic)', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const url = 'https://docs.example/rules/r/';
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', docsUrl: url }),
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', docsUrl: url }),
    ];
    const out = textReporter.format(diagnostics, rules);
    // Count literal occurrences via split — no regex, so no metacharacter
    // escaping to get wrong (CodeQL js/incomplete-sanitization flagged the
    // previous hand-rolled escape for not handling backslashes).
    expect(out.split(url).length - 1).toBe(1);
  });

  it('prints a distinct docs URL for each rule in a file group', () => {
    const rules = new Map<string, AnyRule>([
      ['test/a', makeRule('test/a', { x: 'msg' })],
      ['test/b', makeRule('test/b', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/a', messageId: 'x', severity: 'error', path: 'a.md', docsUrl: 'https://docs.example/a/' }),
      diag({ ruleName: 'test/b', messageId: 'x', severity: 'error', path: 'a.md', docsUrl: 'https://docs.example/b/' }),
    ];
    const out = textReporter.format(diagnostics, rules);
    expect(out).toContain('https://docs.example/a/');
    expect(out).toContain('https://docs.example/b/');
  });

  it('omits the docs URL line when docsUrl is empty', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', docsUrl: '' }),
    ];
    expect(textReporter.format(diagnostics, rules)).not.toContain('http');
  });

  // ── autofix (#28): fixable diagnostics carry a dim 🔧 marker ───────────
  it('marks a fixable diagnostic with a 🔧 fixable tag', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', fixable: true }),
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('🔧 fixable');
  });

  it('does not add a 🔧 tag to a non-fixable diagnostic', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' }),
    ];
    expect(textReporter.format(diagnostics, rules)).not.toContain('🔧');
  });
});

describe('core/reporter — json', () => {
  it('emits empty results array with zero counts when there are no diagnostics', () => {
    const out = jsonReporter.format([], new Map());
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe(1);
    expect(parsed.summary).toEqual({
      total: 0,
      errors: 0,
      warnings: 0,
      baselineHidden: 0,
    });
    expect(parsed.results).toEqual([]);
  });

  it('renders messages and counts errors / warnings separately', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'value {{n}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'test/r',
        messageId: 'x',
        severity: 'error',
        path: 'a.md',
        data: { n: 1 },
      }),
      diag({
        ruleName: 'test/r',
        messageId: 'x',
        severity: 'warn',
        path: 'b.md',
        data: { n: 2 },
      }),
    ];
    const out = JSON.parse(jsonReporter.format(diagnostics, rules));
    expect(out.summary).toEqual({
      total: 2,
      errors: 1,
      warnings: 1,
      baselineHidden: 0,
    });
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      path: 'a.md',
      ruleName: 'test/r',
      messageId: 'x',
      severity: 'error',
      message: 'value 1',
      data: { n: 1 },
    });
  });

  it('summary.baselineHidden reflects the meta passed by the caller', () => {
    const out = JSON.parse(jsonReporter.format([], new Map(), { baselineHidden: 5 }));
    expect(out.summary.baselineHidden).toBe(5);
  });

  it('produces parseable JSON', () => {
    const out = jsonReporter.format([], new Map());
    expect(() => JSON.parse(out)).not.toThrow();
  });

  // ── self-contained diagnostics (#67) ─────────────────────────────────
  it('every result carries suggestion (string|null) and docsUrl (string)', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'test/r',
        messageId: 'x',
        severity: 'error',
        path: 'a.md',
        suggestion: 'do the fix',
        docsUrl: 'https://docs.example/r/',
      }),
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'warn', path: 'b.md' }),
    ];
    const out = JSON.parse(jsonReporter.format(diagnostics, rules));
    expect(out.results[0]).toMatchObject({
      suggestion: 'do the fix',
      docsUrl: 'https://docs.example/r/',
    });
    // Keys are ALWAYS present — pin the machine-readable shape.
    expect(out.results[1]).toHaveProperty('suggestion', null);
    expect(out.results[1]).toHaveProperty('docsUrl', '');
  });

  // ── autofix (#28) ────────────────────────────────────────────────────
  it('every result carries a fixable boolean', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', fixable: true }),
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'warn', path: 'b.md' }),
    ];
    const out = JSON.parse(jsonReporter.format(diagnostics, rules));
    expect(out.results[0]).toHaveProperty('fixable', true);
    expect(out.results[1]).toHaveProperty('fixable', false);
  });

  it('adds summary.fixed only when the caller passes a fixed count', () => {
    const withFixed = JSON.parse(jsonReporter.format([], new Map(), { fixed: 4 }));
    expect(withFixed.summary.fixed).toBe(4);
    const without = JSON.parse(jsonReporter.format([], new Map()));
    expect(without.summary).not.toHaveProperty('fixed');
  });

  it('embeds a top-level diffs array only when the caller passes fixDiffs (dry run)', () => {
    const fixDiffs = [
      { path: 'a.md', diff: '--- a/a.md\n+++ b/a.md\n@@ -1,1 +1,1 @@\n-x\n+y\n' },
    ];
    const withDiffs = JSON.parse(
      jsonReporter.format([], new Map(), { fixed: 1, fixDiffs }),
    );
    expect(withDiffs.diffs).toEqual(fixDiffs);
    const without = JSON.parse(jsonReporter.format([], new Map(), { fixed: 1 }));
    expect(without).not.toHaveProperty('diffs');
  });
});

describe('core/reporter — sarif', () => {
  it('emits a valid SARIF 2.1.0 envelope', () => {
    const out = JSON.parse(sarifReporter.format([], new Map()));
    expect(out.version).toBe('2.1.0');
    expect(out.$schema).toContain('sarif');
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0].tool.driver.name).toBe('madr-lint');
    expect(out.runs[0].results).toEqual([]);
  });

  it('maps each unique ruleName into the rules array exactly once', () => {
    const rules = new Map<string, AnyRule>([
      ['test/a', makeRule('test/a', { x: 'msg-a' })],
      ['test/b', makeRule('test/b', { x: 'msg-b' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/a', messageId: 'x', severity: 'error', path: 'a.md' }),
      diag({ ruleName: 'test/a', messageId: 'x', severity: 'error', path: 'b.md' }),
      diag({ ruleName: 'test/b', messageId: 'x', severity: 'warn', path: 'b.md' }),
    ];
    const out = JSON.parse(sarifReporter.format(diagnostics, rules));
    expect(out.runs[0].tool.driver.rules).toHaveLength(2);
    expect(out.runs[0].results).toHaveLength(3);
    expect(out.runs[0].results[0].level).toBe('error');
    expect(out.runs[0].results[2].level).toBe('warning');
  });

  it('attaches each result to its file path via physicalLocation', () => {
    const rules = new Map<string, AnyRule>([
      ['test/a', makeRule('test/a', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'test/a',
        messageId: 'x',
        severity: 'error',
        path: 'docs/adr/0001.md',
      }),
    ];
    const out = JSON.parse(sarifReporter.format(diagnostics, rules));
    expect(out.runs[0].results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: 'docs/adr/0001.md', uriBaseId: '%SRCROOT%' },
      region: { startLine: 1 },
    });
  });

  // ── self-contained diagnostics (#67): SARIF is unchanged — helpUri already
  // carries the docs URL, so no new per-result fields are added. ────────────
  it('does not add suggestion or docsUrl fields to SARIF results', () => {
    const rules = new Map<string, AnyRule>([
      ['test/a', makeRule('test/a', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'test/a',
        messageId: 'x',
        severity: 'error',
        path: 'a.md',
        suggestion: 'do the fix',
        docsUrl: 'https://docs.example/a/',
      }),
    ];
    const result = JSON.parse(sarifReporter.format(diagnostics, rules)).runs[0].results[0];
    expect(result).not.toHaveProperty('suggestion');
    expect(result).not.toHaveProperty('docsUrl');
  });
});

describe('core/reporter — github', () => {
  it('emits ::error command for error-severity diagnostic with line', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/foo', makeRule('madr/foo', { bad: 'Bad thing {{x}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/foo',
        messageId: 'bad',
        severity: 'error',
        path: 'docs/adr/0001.md',
        loc: { line: 5, column: 0 },
        data: { x: 'here' },
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('::error file=docs/adr/0001.md,line=5,title=madr/foo::Bad thing here');
  });

  it('emits ::warning command for warn-severity diagnostic', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/bar', makeRule('madr/bar', { warn: 'Watch out' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/bar',
        messageId: 'warn',
        severity: 'warn',
        path: 'docs/adr/0002.md',
        loc: { line: 3, column: 0 },
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('::warning file=docs/adr/0002.md,line=3,title=madr/bar::Watch out');
  });

  it('omits ,line= when diagnostic has no loc', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/baz', makeRule('madr/baz', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/baz',
        messageId: 'x',
        severity: 'error',
        path: 'docs/adr/0003.md',
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('::error file=docs/adr/0003.md,title=madr/baz::msg');
    expect(out).not.toContain(',line=');
  });

  it('escapes % \\r \\n in message text', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/esc', makeRule('madr/esc', { x: '100% done\r\nok' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/esc',
        messageId: 'x',
        severity: 'error',
        path: 'a.md',
        data: {},
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('100%25 done%0D%0Aok');
  });

  it('escapes , and : in property values (file path and title)', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/rule:check', makeRule('madr/rule:check', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/rule:check',
        messageId: 'x',
        severity: 'error',
        path: 'path,with,commas.md',
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    // commas in file path should be escaped
    expect(out).toContain('file=path%2Cwith%2Ccommas.md');
    // colon in rule name title should be escaped; slash is not in the GH spec escape list
    expect(out).toContain('title=madr/rule%3Acheck');
  });

  it('escapes % in property values (double-encoding safe)', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/pct', makeRule('madr/pct', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/pct',
        messageId: 'x',
        severity: 'error',
        path: 'test%20file.md',
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    // literal % in the path must itself be encoded: %20 → %2520
    expect(out).toContain('file=test%2520file.md');
  });

  it('prints a human summary line after annotations', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' }),
      diag({ ruleName: 'test/r', messageId: 'x', severity: 'warn', path: 'b.md' }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('1 error');
    expect(out).toContain('1 warning');
  });

  it('includes baselineHidden in the summary when > 0', () => {
    const out = githubReporter.format([], new Map(), { baselineHidden: 3 });
    expect(out).toContain('3 hidden by baseline');
  });

  it('returns empty-ish summary when there are no diagnostics', () => {
    const out = githubReporter.format([], new Map());
    // No annotation lines, just summary
    expect(out).not.toContain('::error');
    expect(out).not.toContain('::warning');
  });

  it('prints zero-count summary on a clean run (log line is never empty)', () => {
    const out = githubReporter.format([], new Map());
    expect(out).toContain('0 errors, 0 warnings');
  });

  // ── self-contained diagnostics (#67) ─────────────────────────────────
  it('appends the suggestion to the annotation message when present', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/foo', makeRule('madr/foo', { bad: 'Bad thing {{x}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/foo',
        messageId: 'bad',
        severity: 'error',
        path: 'a.md',
        data: { x: 'here' },
        suggestion: 'do the fix',
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('::error file=a.md,title=madr/foo::Bad thing here — do the fix');
  });

  it('does not append a separator when there is no suggestion', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/foo', makeRule('madr/foo', { bad: 'Bad thing' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({ ruleName: 'madr/foo', messageId: 'bad', severity: 'error', path: 'a.md' }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('::Bad thing');
    expect(out).not.toContain(' — ');
  });

  it('escapes % and newlines in an appended suggestion', () => {
    const rules = new Map<string, AnyRule>([
      ['madr/foo', makeRule('madr/foo', { bad: 'Bad' })],
    ]);
    const diagnostics: Diagnostic[] = [
      diag({
        ruleName: 'madr/foo',
        messageId: 'bad',
        severity: 'error',
        path: 'a.md',
        suggestion: 'use 100%\nnow',
      }),
    ];
    const out = githubReporter.format(diagnostics, rules);
    expect(out).toContain('Bad — use 100%25%0Anow');
  });
});

describe('core/reporter — registry', () => {
  it('exposes text, json, sarif, and github via the reporters map', () => {
    expect(reporters.text).toBe(textReporter);
    expect(reporters.json).toBe(jsonReporter);
    expect(reporters.sarif).toBe(sarifReporter);
    expect(reporters.github).toBe(githubReporter);
  });
});
