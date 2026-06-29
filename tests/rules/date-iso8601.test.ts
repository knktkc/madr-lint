import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/date-iso8601/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures/date-iso8601');

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
      });
    }
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
});
