import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import { applyEdits, makeFixer } from '../../src/core/fix.js';
import { frontmatterOffset } from '../../src/core/parser.js';
import rule from '../../src/rules/status-enum/index.js';

/** Apply a fixable diagnostic's fix thunk to the source and return the result. */
function applyFix(content: string, d: { fix?: (f: ReturnType<typeof makeFixer>) => unknown }): string {
  const fixer = makeFixer(frontmatterOffset(content));
  const edit = d.fix?.(fixer);
  const edits = Array.isArray(edit) ? edit : edit ? [edit] : [];
  return applyEdits(content, edits as never);
}

const fixturesDir = join(import.meta.dirname, '../fixtures/status-enum');

describe('madr/status-enum', () => {
  describe('valid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'valid'))) {
      it(`${file} produces no diagnostics`, () => {
        const content = readFileSync(join(fixturesDir, 'valid', file), 'utf8');
        expect(runRule(rule, { content, path: file })).toEqual([]);
      });
    }
  });

  describe('invalid fixtures', () => {
    it('no-frontmatter.md produces missingStatus', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'no-frontmatter.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'no-frontmatter.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/status-enum',
        messageId: 'missingStatus',
        severity: 'error',
        path: 'no-frontmatter.md',
      });
      // self-contained diagnostics (#67): missingStatus suggests adding the field
      expect(diagnostics[0]?.suggestion).toContain(
        'add a "status" field to the frontmatter',
      );
      expect(diagnostics[0]?.docsUrl).toBe(
        'https://knktkc.github.io/madr-lint/rules/status-enum/',
      );
    });

    it('invalidStatus omits a suggestion (message already lists allowed values)', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'typo.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'typo.md' });
      expect(diagnostics[0]?.messageId).toBe('invalidStatus');
      expect(diagnostics[0]?.suggestion).toBeNull();
    });

    it('no-status.md produces missingStatus', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'no-status.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'no-status.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingStatus');
    });

    it('typo.md produces invalidStatus', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'typo.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'typo.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/status-enum',
        messageId: 'invalidStatus',
        data: { status: 'acccepted' },
      });
    });

    it('unknown.md produces invalidStatus', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'unknown.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'unknown.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        messageId: 'invalidStatus',
        data: { status: 'pending' },
      });
      // The `allowed` data field should be a string array
      expect(diagnostics[0]?.data?.allowed).toBeInstanceOf(Array);
    });

    it('unknown-v2.md (v2 bold-list "pending") produces invalidStatus', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'unknown-v2.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'unknown-v2.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        messageId: 'invalidStatus',
        data: { status: 'pending' },
      });
    });

    it('unknown-plain-v2.md (canonical v2 plain "pending") produces invalidStatus', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'unknown-plain-v2.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'unknown-plain-v2.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        messageId: 'invalidStatus',
        data: { status: 'pending' },
      });
    });
  });

  describe('precision: prose lists are not misread as metadata', () => {
    it('a "Status:"-keyed bullet after intro prose does not yield invalidStatus', () => {
      const content = [
        '# Some note',
        '',
        'Introductory prose before any metadata block.',
        '',
        '- Status: still under discussion',
        '',
        '## Context',
      ].join('\n');
      const diagnostics = runRule(rule, { content, path: 'n.md' });
      // The leading list is not metadata (it follows prose), so the rule
      // reports a genuinely missing status — never a spurious invalidStatus.
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingStatus');
    });

    it('a prose list with no recognized key yields no invalidStatus', () => {
      const content = '# T\n\n- Option A: fast\n- Option B: cheap\n\n## Context\n';
      const diagnostics = runRule(rule, { content, path: 'n.md' });
      expect(diagnostics.every((d) => d.messageId !== 'invalidStatus')).toBe(true);
    });
  });

  describe('caseSensitive option', () => {
    it('rejects mixed-case when caseSensitive: true', () => {
      const content = '---\nstatus: Accepted\n---\n\n# x\n';
      const diagnostics = runRule(
        rule,
        { content, path: 'cs.md' },
        { options: { caseSensitive: true } },
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('invalidStatus');
    });

    it('accepts mixed-case when caseSensitive: false (default)', () => {
      const content = '---\nstatus: ACCEPTED\n---\n\n# x\n';
      expect(runRule(rule, { content, path: 'cs.md' })).toEqual([]);
    });
  });

  describe('prefixValues option', () => {
    it('accepts "superseded by ADR-0042" by default', () => {
      const content = '---\nstatus: superseded by ADR-0042\n---\n\n# x\n';
      expect(runRule(rule, { content, path: 'p.md' })).toEqual([]);
    });

    it('rejects superseded prefix when removed from prefixValues', () => {
      const content = '---\nstatus: superseded by ADR-0042\n---\n\n# x\n';
      const diagnostics = runRule(
        rule,
        { content, path: 'p.md' },
        { options: { prefixValues: [] } },
      );
      expect(diagnostics).toHaveLength(1);
    });
  });

  describe('non-string status values', () => {
    it('treats null as missingStatus', () => {
      const content = '---\nstatus: null\n---\n\n# x\n';
      const diagnostics = runRule(rule, { content, path: 'n.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingStatus');
    });

    it('treats boolean as missingStatus', () => {
      const content = '---\nstatus: true\n---\n\n# x\n';
      const diagnostics = runRule(rule, { content, path: 'b.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingStatus');
    });
  });

  describe('diagnostic location (loc) and inline suppression', () => {
    it('v2 list-sourced invalid status carries the list item line (body coordinates)', () => {
      const content = '# Title\n\n- Status: totally-wrong\n';
      const diagnostics = runRule(rule, { content, path: 'v2.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('invalidStatus');
      expect(diagnostics[0]?.loc).toEqual({ line: 3, column: 1 });
    });

    it('frontmatter-sourced invalid status stays line-less (frontmatter is outside body coordinates)', () => {
      const content = '---\nstatus: totally-wrong\n---\n# Title\n';
      const diagnostics = runRule(rule, { content, path: 'fm.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('invalidStatus');
      expect(diagnostics[0]?.loc).toBeUndefined();
    });

    it('missingStatus stays line-less (nothing to point at)', () => {
      const content = '# Title\n\nNo metadata here.\n';
      const diagnostics = runRule(rule, { content, path: 'm.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingStatus');
      expect(diagnostics[0]?.loc).toBeUndefined();
    });

    it('disable-next-line above the list item suppresses the real diagnostic', () => {
      const content =
        '# Title\n\n<!-- madr-lint-disable-next-line madr/status-enum -->\n- Status: totally-wrong\n';
      expect(runRule(rule, { content, path: 'v2.md' })).toEqual([]);
    });
  });

  // Autofix (#28): the ONLY mechanical status-enum fix is a pure case
  // normalization of a v2 list-sourced value whose lowercase equals an allowed
  // value. Everything else (real typos, frontmatter-sourced values) is left to
  // #29 / manual repair — fix omitted, fixable:false.
  describe('autofix (case-only, v2 list-sourced)', () => {
    it('offers a fix for a plain-key list value that differs only by case (caseSensitive)', () => {
      const content = '# Title\n\n- Status: Accepted\n';
      const d = runRule(rule, { content, path: 'v2.md' }, { options: { caseSensitive: true } })[0];
      expect(d?.messageId).toBe('invalidStatus');
      expect(d?.fixable).toBe(true);
      expect(applyFix(content, d!)).toBe('# Title\n\n- Status: accepted\n');
    });

    it('offers a fix for a bold-key list value that differs only by case', () => {
      const content = '# Title\n\n- **Status**: Accepted\n';
      const d = runRule(rule, { content, path: 'v2.md' }, { options: { caseSensitive: true } })[0];
      expect(d?.fixable).toBe(true);
      expect(applyFix(content, d!)).toBe('# Title\n\n- **Status**: accepted\n');
    });

    it('translates the value offset past frontmatter (frontmatter + v2 list status)', () => {
      const content = '---\ndate: 2026-01-01\n---\n# Title\n\n- Status: Accepted\n';
      const d = runRule(rule, { content, path: 'mixed.md' }, { options: { caseSensitive: true } })[0];
      expect(d?.fixable).toBe(true);
      expect(applyFix(content, d!)).toBe(
        '---\ndate: 2026-01-01\n---\n# Title\n\n- Status: accepted\n',
      );
    });

    it('does NOT offer a fix for a frontmatter-sourced value (YAML-aware, out of scope)', () => {
      const content = '---\nstatus: Accepted\n---\n# Title\n';
      const d = runRule(rule, { content, path: 'fm.md' }, { options: { caseSensitive: true } })[0];
      expect(d?.messageId).toBe('invalidStatus');
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });

    it('does NOT offer a fix for a genuine typo that does not case-fold to an allowed value', () => {
      const content = '# Title\n\n- Status: acccepted\n';
      const d = runRule(rule, { content, path: 't.md' })[0];
      expect(d?.messageId).toBe('invalidStatus');
      expect(d?.fixable).toBe(false);
    });
  });
});
