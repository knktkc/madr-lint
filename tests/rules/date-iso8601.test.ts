import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import { applyEdits, makeFixer } from '../../src/core/fix.js';
import { frontmatterOffset } from '../../src/core/parser.js';
import rule from '../../src/rules/date-iso8601/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures/date-iso8601');

/** Apply a fixable diagnostic's fix thunk to the source and return the result. */
function applyFix(content: string, d: { fix?: (f: ReturnType<typeof makeFixer>) => unknown }): string {
  const fixer = makeFixer(frontmatterOffset(content));
  const edit = d.fix?.(fixer);
  const edits = Array.isArray(edit) ? edit : edit ? [edit] : [];
  return applyEdits(content, edits as never);
}

describe('madr/date-iso8601', () => {
  describe('valid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'valid'))) {
      it(`${file} produces no diagnostics`, () => {
        const content = readFileSync(join(fixturesDir, 'valid', file), 'utf8');
        expect(runRule(rule, { content, path: file })).toEqual([]);
      });
    }
  });

  describe('invalid fixtures', () => {
    it('no-frontmatter.md → missingDate', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'no-frontmatter.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'no-frontmatter.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingDate');
    });

    it('no-date-field.md → missingDate', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'no-date-field.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'no-date-field.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingDate');
    });

    const invalidDateCases: Array<[string, string]> = [
      ['month-13.md', '2026-13-01'],
      ['feb-31.md', '2026-02-31'],
      ['non-leap-feb-29.md', '2025-02-29'],
      ['unpadded.md', '2026-5-1'],
      ['two-digit-year.md', '26-05-01'],
      ['not-a-date.md', 'today'],
      // v2 bold-list — same bad calendar date, extracted via metadata bridge
      ['month-13-v2.md', '2026-13-01'],
      // canonical MADR v2 plain (non-bold, asterisk) key — same bad date
      ['month-13-plain-v2.md', '2026-13-01'],
    ];

    for (const [file, expectedRaw] of invalidDateCases) {
      it(`${file} → invalidDate (raw: ${expectedRaw})`, () => {
        const content = readFileSync(
          join(fixturesDir, 'invalid', file),
          'utf8',
        );
        const diagnostics = runRule(rule, { content, path: file });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleName: 'madr/date-iso8601',
          messageId: 'invalidDate',
          data: { date: expectedRaw },
        });
        // self-contained diagnostics (#67): show the expected format
        expect(diagnostics[0]?.suggestion).toContain('YYYY-MM-DD');
        expect(diagnostics[0]?.docsUrl).toBe(
          'https://knktkc.github.io/madr-lint/rules/date-iso8601/',
        );
      });
    }

    it('missingDate suggests adding the field in YYYY-MM-DD format', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'no-date-field.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'no-date-field.md' });
      expect(diagnostics[0]?.messageId).toBe('missingDate');
      expect(diagnostics[0]?.suggestion).toContain('YYYY-MM-DD');
    });
  });

  describe('YAML date type handling', () => {
    it('accepts unquoted YAML 1.1 date (parsed by gray-matter as Date object)', () => {
      const content = '---\ndate: 2026-05-01\n---\n\n# x\n';
      expect(runRule(rule, { content, path: 't.md' })).toEqual([]);
    });

    it('treats null date as missingDate', () => {
      const content = '---\ndate: null\n---\n\n# x\n';
      const diagnostics = runRule(rule, { content, path: 't.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingDate');
    });

    it('treats numeric date as missingDate', () => {
      const content = '---\ndate: 12345\n---\n\n# x\n';
      const diagnostics = runRule(rule, { content, path: 't.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingDate');
    });
  });

  describe('field option', () => {
    it('reads a custom frontmatter field name', () => {
      const content = '---\ncreated: 2026-05-01\n---\n\n# x\n';
      const diagnostics = runRule(
        rule,
        { content, path: 't.md' },
        { options: { field: 'created' } },
      );
      expect(diagnostics).toEqual([]);
    });

    it('reports missingDate when the custom field is absent', () => {
      const content = '---\ndate: 2026-05-01\n---\n\n# x\n';
      const diagnostics = runRule(
        rule,
        { content, path: 't.md' },
        { options: { field: 'created' } },
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('missingDate');
    });
  });

  describe('property-based: round-trip Date through YYYY-MM-DD always validates', () => {
    it('any valid Date in 1970-2100 range', () => {
      fc.assert(
        fc.property(
          fc.date({
            min: new Date('1970-01-01T00:00:00Z'),
            max: new Date('2100-12-31T00:00:00Z'),
            noInvalidDate: true,
          }),
          (date) => {
            const iso = date.toISOString().slice(0, 10);
            const content = `---\ndate: '${iso}'\n---\n\n# x\n`;
            const diagnostics = runRule(rule, { content, path: 't.md' });
            return diagnostics.length === 0;
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('property-based: malformed strings always produce a single diagnostic', () => {
    it('any non-YYYY-MM-DD string is rejected', () => {
      const malformedShape = fc.string({ minLength: 1, maxLength: 30 }).filter(
        (s) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(s) &&
          !/['"\\\n\r:#&*!|>%@`]/.test(s) &&
          s.trim() === s &&
          s.length > 0,
      );

      fc.assert(
        fc.property(malformedShape, (s) => {
          const content = `---\ndate: '${s}'\n---\n\n# x\n`;
          const diagnostics = runRule(rule, { content, path: 't.md' });
          return (
            diagnostics.length === 1 &&
            (diagnostics[0]?.messageId === 'invalidDate' ||
              diagnostics[0]?.messageId === 'missingDate')
          );
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('diagnostic location (loc) and inline suppression', () => {
    it('v2 list-sourced invalid date carries the list item line (body coordinates)', () => {
      const content = '# Title\n\n- Date: 2026-99-99\n';
      const diagnostics = runRule(rule, { content, path: 'v2.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('invalidDate');
      expect(diagnostics[0]?.loc).toEqual({ line: 3, column: 1 });
    });

    it('frontmatter-sourced invalid date stays line-less (frontmatter is outside body coordinates)', () => {
      const content = "---\ndate: '2026-99-99'\n---\n# Title\n";
      const diagnostics = runRule(rule, { content, path: 'fm.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('invalidDate');
      expect(diagnostics[0]?.loc).toBeUndefined();
    });

    it('disable-next-line above the list item suppresses the real diagnostic', () => {
      const content =
        '# Title\n\n<!-- madr-lint-disable-next-line madr/date-iso8601 -->\n- Date: 2026-99-99\n';
      expect(runRule(rule, { content, path: 'v2.md' })).toEqual([]);
    });
  });

  // Autofix (#29): normalize ONLY unambiguous shapes of a v2 list-sourced value —
  // year-first numeric (`YYYY/M/D`, `YYYY.M.D`, `YYYY-M-D`) and named-month forms
  // (`3 Jul 2026`, `Jul 3, 2026`). Day/month-order-ambiguous inputs, invalid
  // calendar dates, and frontmatter-sourced values are NEVER fixed.
  describe('autofix (v2 list-sourced, unambiguous normalizations only)', () => {
    const fixCases: Array<[string, string, string]> = [
      // [label, raw value, normalized]
      ['slash year-first', '2026/7/3', '2026-07-03'],
      ['dot year-first', '2026.7.3', '2026-07-03'],
      ['hyphen unpadded', '2026-7-3', '2026-07-03'],
      ['already-padded slash', '2026/07/03', '2026-07-03'],
      ['day-first named month (abbrev)', '3 Jul 2026', '2026-07-03'],
      ['day-first named month (full)', '03 July 2026', '2026-07-03'],
      ['month-first named month (comma)', 'Jul 3, 2026', '2026-07-03'],
      ['month-first named month (full, comma)', 'July 3, 2026', '2026-07-03'],
    ];

    for (const [label, raw, normalized] of fixCases) {
      it(`fixes ${label}: "${raw}" → ${normalized} (plain-key v2 list)`, () => {
        const content = `# Title\n\n- Date: ${raw}\n`;
        const d = runRule(rule, { content, path: 'v2.md' })[0];
        expect(d?.messageId).toBe('invalidDate');
        expect(d?.fixable).toBe(true);
        expect(applyFix(content, d!)).toBe(`# Title\n\n- Date: ${normalized}\n`);
      });
    }

    it('fixes a bold-key list value', () => {
      const content = '# Title\n\n- **Date**: 2026/7/3\n';
      const d = runRule(rule, { content, path: 'v2.md' })[0];
      expect(d?.fixable).toBe(true);
      expect(applyFix(content, d!)).toBe('# Title\n\n- **Date**: 2026-07-03\n');
    });

    it('translates the value offset past frontmatter (frontmatter + v2 list date)', () => {
      const content = '---\nstatus: accepted\n---\n# Title\n\n- Date: 2026/7/3\n';
      const d = runRule(rule, { content, path: 'mixed.md' })[0];
      expect(d?.fixable).toBe(true);
      expect(applyFix(content, d!)).toBe(
        '---\nstatus: accepted\n---\n# Title\n\n- Date: 2026-07-03\n',
      );
    });

    const declineCases: Array<[string, string]> = [
      ['DD/MM vs MM/DD ambiguity', '03/07/2026'],
      ['two-digit-year ambiguity', '26/07/03'],
      ['invalid calendar date (Feb 30)', '2026/2/30'],
      ['month out of range', '2026/13/01'],
      ['day out of range', '2026/07/32'],
      ['non-English month name', '3 Mai 2026'],
      ['not a date', 'today'],
      ['day out of range (hyphen)', '2026-7-32'],
    ];

    for (const [label, raw] of declineCases) {
      it(`declines ${label}: "${raw}" (report-only, no fix)`, () => {
        const content = `# Title\n\n- Date: ${raw}\n`;
        const d = runRule(rule, { content, path: 'v2.md' })[0];
        expect(d?.messageId).toBe('invalidDate');
        expect(d?.fixable).toBe(false);
        expect(d?.fix).toBeUndefined();
      });
    }

    it('does NOT offer a fix for a frontmatter-sourced value (YAML-aware, out of scope)', () => {
      const content = "---\ndate: '2026/7/3'\n---\n# Title\n";
      const d = runRule(rule, { content, path: 'fm.md' })[0];
      expect(d?.messageId).toBe('invalidDate');
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });
  });
});
