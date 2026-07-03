import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRulesOnFile } from '../../src/core/runner.js';
import { lintFiles } from '../../src/core/lint.js';
import noDuplicateNumbering from '../../src/rules/no-duplicate-numbering/index.js';
import type { Diagnostic, Rule, RuleListeners } from '../../src/core/types.js';

// A per-file rule that reports one diagnostic per heading, carrying the
// heading's source line (body coordinates) as `loc`. Lets us exercise
// line-range suppression precisely.
function lineRule(name: string): Rule {
  return {
    meta: {
      name,
      type: 'perFile',
      versionCompat: ['v2', 'v3', 'v4'],
      docs: { description: 'reports each heading with its line', recommended: false },
      messages: { h: 'heading at line {{line}}' },
      defaultOptions: {},
    },
    create(context): RuleListeners {
      return {
        enter: {
          heading(node) {
            const line = node.position?.start.line;
            if (line === undefined) {
              context.report({ messageId: 'h', data: { line: null } });
            } else {
              context.report({ messageId: 'h', loc: { line, column: 1 }, data: { line } });
            }
          },
        },
      };
    },
  };
}

// A per-file rule that reports exactly one locless diagnostic (like a
// filename/metadata rule). Lets us test file-level vs line-level behavior
// for diagnostics that carry no line.
function loclessRule(name: string): Rule {
  return {
    meta: {
      name,
      type: 'perFile',
      versionCompat: ['v2', 'v3', 'v4'],
      docs: { description: 'reports one locless diagnostic', recommended: false },
      messages: { x: 'file-level finding' },
      defaultOptions: {},
    },
    create(context) {
      context.report({ messageId: 'x', data: {} });
    },
  };
}

function reportedLines(diags: readonly Diagnostic[]): number[] {
  return diags.map((d) => d.loc?.line ?? -1).sort((a, b) => a - b);
}

function run(rules: Rule[], content: string): Diagnostic[] {
  return runRulesOnFile(rules, { content, path: 'a.md' });
}

describe('core/suppression — per-file directives', () => {
  describe('the four directive forms', () => {
    it('madr-lint-disable-file suppresses everything in the file', () => {
      const content = ['<!-- madr-lint-disable-file -->', '# A', '## B'].join('\n');
      expect(run([lineRule('test/line')], content)).toEqual([]);
    });

    it('madr-lint-disable suppresses from the directive line to EOF', () => {
      const content = ['# A', '<!-- madr-lint-disable -->', '## B', '## C'].join('\n');
      // headings at 1,3,4; disable opens at line 2 → 3 and 4 suppressed.
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1]);
    });

    it('madr-lint-enable re-enables after a disable', () => {
      const content = [
        '# A', // 1
        '<!-- madr-lint-disable test/line -->', // 2
        '## B', // 3 (suppressed)
        '## C', // 4 (suppressed)
        '<!-- madr-lint-enable test/line -->', // 5
        '## D', // 6 (reported again)
      ].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1, 6]);
    });

    it('madr-lint-disable-next-line suppresses only the next line', () => {
      const content = [
        '# A', // 1
        '<!-- madr-lint-disable-next-line -->', // 2 → targets line 3
        '## B', // 3 (suppressed)
        '## C', // 4 (reported)
      ].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1, 4]);
    });
  });

  describe('rule-scoped vs unscoped', () => {
    it('scoped disable only affects the named rule', () => {
      const content = ['# A', '<!-- madr-lint-disable test/line-a -->', '## B'].join('\n');
      const diags = run([lineRule('test/line-a'), lineRule('test/line-b')], content);
      const a = diags.filter((d) => d.ruleName === 'test/line-a');
      const b = diags.filter((d) => d.ruleName === 'test/line-b');
      // line-a disabled from line 2 onward → only its line-1 diagnostic remains.
      expect(reportedLines(a)).toEqual([1]);
      // line-b untouched.
      expect(reportedLines(b)).toEqual([1, 3]);
    });

    it('scoped disable-next-line only affects the named rule', () => {
      const content = ['<!-- madr-lint-disable-next-line test/line-a -->', '# A'].join('\n');
      const diags = run([lineRule('test/line-a'), lineRule('test/line-b')], content);
      const a = diags.filter((d) => d.ruleName === 'test/line-a');
      const b = diags.filter((d) => d.ruleName === 'test/line-b');
      expect(reportedLines(a)).toEqual([]);
      expect(reportedLines(b)).toEqual([2]);
    });

    it('unscoped disable-next-line affects all rules', () => {
      const content = ['<!-- madr-lint-disable-next-line -->', '# A'].join('\n');
      const diags = run([lineRule('test/line-a'), lineRule('test/line-b')], content);
      expect(diags).toEqual([]);
    });

    it('scoped disable-file only affects the named rule', () => {
      const content = ['<!-- madr-lint-disable-file test/line-a -->', '# A', '## B'].join('\n');
      const diags = run([lineRule('test/line-a'), lineRule('test/line-b')], content);
      expect(diags.filter((d) => d.ruleName === 'test/line-a')).toEqual([]);
      expect(reportedLines(diags.filter((d) => d.ruleName === 'test/line-b'))).toEqual([1, 2]);
    });
  });

  describe('disable-next-line at the last line of a file', () => {
    it('suppresses a diagnostic on the final line', () => {
      const content = ['# A', '<!-- madr-lint-disable-next-line -->', '## Last'].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1]);
    });

    it('a directive literally on the last line targets a nonexistent next line without crashing', () => {
      const content = ['# A', '<!-- madr-lint-disable-next-line -->'].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1]);
    });
  });

  describe('coordinate system (directive below YAML frontmatter)', () => {
    it('directive line numbers align with AST diagnostic lines after frontmatter is stripped', () => {
      const content = [
        '---',
        'status: accepted',
        'date: 2026-01-01',
        '---',
        '# Title', // body line 1
        '## Section A', // body line 2
        '<!-- madr-lint-disable-next-line test/line -->', // body line 3 → targets line 4
        '## Section B', // body line 4 (suppressed)
        '## Section C', // body line 5 (reported)
      ].join('\n');
      // If directive lines used raw-file coordinates and diagnostics used
      // body coordinates, the two would be offset by the frontmatter height
      // and Section B would NOT be suppressed. Same-system alignment ⇒ [1,2,5].
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1, 2, 5]);
    });
  });

  describe('locless (no-line) diagnostics', () => {
    it('disable-file suppresses a locless diagnostic', () => {
      const content = ['<!-- madr-lint-disable-file -->', '# A'].join('\n');
      expect(run([loclessRule('test/file-level')], content)).toEqual([]);
    });

    it('an open-ended disable (no matching enable) suppresses a locless diagnostic', () => {
      const content = ['# A', '<!-- madr-lint-disable test/file-level -->'].join('\n');
      expect(run([loclessRule('test/file-level')], content)).toEqual([]);
    });

    it('a bounded disable/enable pair does NOT suppress a locless diagnostic', () => {
      const content = [
        '# A',
        '<!-- madr-lint-disable test/file-level -->',
        '## x',
        '<!-- madr-lint-enable test/file-level -->',
      ].join('\n');
      expect(run([loclessRule('test/file-level')], content)).toHaveLength(1);
    });
  });

  describe('malformed / unknown / non-directive comments are ignored', () => {
    it('an unknown suffix (disable-line) is not a directive', () => {
      const content = ['# A', '<!-- madr-lint-disable-line test/line -->', '## B'].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1, 3]);
    });

    it('unknown keywords are ignored', () => {
      const content = [
        '# A',
        '<!-- madr-lint-frobnicate -->',
        '<!-- madr-lint-disablexyz test/line -->',
        '## B',
      ].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1, 4]);
    });

    it('plain HTML comments are ignored', () => {
      const content = ['# A', '<!-- just a comment -->', '<!-- TODO: fix later -->', '## B'].join('\n');
      expect(reportedLines(run([lineRule('test/line')], content))).toEqual([1, 4]);
    });
  });

  describe('per-file isolation', () => {
    it("one file's directive does not affect another file", () => {
      const dA = runRulesOnFile([lineRule('test/line')], {
        content: ['<!-- madr-lint-disable-file -->', '# A'].join('\n'),
        path: 'a.md',
      });
      const dB = runRulesOnFile([lineRule('test/line')], {
        content: ['# B', '## C'].join('\n'),
        path: 'b.md',
      });
      expect(dA).toEqual([]);
      expect(reportedLines(dB)).toEqual([1, 2]);
    });
  });

  describe('core/internal-error is never suppressible', () => {
    it('disable-file does not hide a rule that throws', () => {
      const throwing: Rule = {
        meta: {
          name: 'test/throws',
          type: 'perFile',
          versionCompat: ['v2', 'v3', 'v4'],
          docs: { description: 'always throws', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create() {
          throw new Error('boom');
        },
      };
      const content = ['<!-- madr-lint-disable-file -->', '# A'].join('\n');
      const diags = run([throwing], content);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.ruleName).toBe('core/internal-error');
    });
  });
});

describe('core/suppression — project rules (file-scoped)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-suppress-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function dupNumbering(aContent: string, bContent: string): Diagnostic[] {
    const fileA = join(dir, '0001-a.md');
    const fileB = join(dir, '0001-b.md');
    writeFileSync(fileA, aContent);
    writeFileSync(fileB, bContent);
    const result = lintFiles({
      rules: [noDuplicateNumbering],
      ruleSeverity: { 'madr/no-duplicate-numbering': 'error' },
      files: [fileA, fileB],
      cwd: dir,
    });
    return result.diagnostics.filter((d) => d.ruleName === 'madr/no-duplicate-numbering');
  }

  it('disable-file in one file suppresses only that file’s project diagnostic', () => {
    const diags = dupNumbering('# a\n\n<!-- madr-lint-disable-file -->\n', '# b\n');
    expect(diags.map((d) => d.path)).toEqual(['0001-b.md']);
  });

  it('scoped disable-file suppresses the named project rule for that file', () => {
    const diags = dupNumbering(
      '# a\n\n<!-- madr-lint-disable-file madr/no-duplicate-numbering -->\n',
      '# b\n',
    );
    expect(diags.map((d) => d.path)).toEqual(['0001-b.md']);
  });

  it('an open-ended disable (no enable) suppresses the locless project diagnostic for that file', () => {
    const diags = dupNumbering(
      '# a\n\n<!-- madr-lint-disable madr/no-duplicate-numbering -->\n',
      '# b\n',
    );
    expect(diags.map((d) => d.path)).toEqual(['0001-b.md']);
  });

  it('a bounded disable/enable pair does NOT suppress the locless project diagnostic', () => {
    const diags = dupNumbering(
      '# a\n\n<!-- madr-lint-disable madr/no-duplicate-numbering -->\n\n<!-- madr-lint-enable madr/no-duplicate-numbering -->\n',
      '# b\n',
    );
    expect(diags.map((d) => d.path).sort()).toEqual(['0001-a.md', '0001-b.md']);
  });

  it('a disable-file scoped to a different rule does not suppress', () => {
    const diags = dupNumbering('# a\n\n<!-- madr-lint-disable-file madr/other-rule -->\n', '# b\n');
    expect(diags.map((d) => d.path).sort()).toEqual(['0001-a.md', '0001-b.md']);
  });
});
