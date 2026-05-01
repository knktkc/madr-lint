import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/required-sections/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures/required-sections');

describe('madr/required-sections', () => {
  describe('valid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'valid'))) {
      it(`${file} produces no diagnostics`, () => {
        const content = readFileSync(join(fixturesDir, 'valid', file), 'utf8');
        expect(runRule(rule, { content, path: file })).toEqual([]);
      });
    }
  });

  describe('invalid fixtures', () => {
    it('missing-context.md produces exactly 1 missingSection diagnostic', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'missing-context.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'missing-context.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/required-sections',
        messageId: 'missingSection',
        severity: 'error',
        path: 'missing-context.md',
        data: {
          section: 'Context and Problem Statement',
        },
      });
    });

    it('missing-outcome.md produces exactly 1 missingSection diagnostic', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'missing-outcome.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'missing-outcome.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/required-sections',
        messageId: 'missingSection',
        data: { section: 'Decision Outcome' },
      });
    });

    it('missing-consequences.md produces exactly 1 missingSection diagnostic', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'missing-consequences.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, {
        content,
        path: 'missing-consequences.md',
      });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/required-sections',
        messageId: 'missingSection',
        data: { section: 'Consequences' },
      });
    });

    it('missing-all.md produces 3 missingSection diagnostics', () => {
      const content = readFileSync(
        join(fixturesDir, 'invalid', 'missing-all.md'),
        'utf8',
      );
      const diagnostics = runRule(rule, { content, path: 'missing-all.md' });
      expect(diagnostics).toHaveLength(3);
      const sections = diagnostics.map((d) => d.data?.section).toSorted();
      expect(sections).toEqual([
        'Consequences',
        'Context and Problem Statement',
        'Decision Outcome',
      ]);
    });
  });

  describe('matchMode option', () => {
    it('startsWith allows headings with suffixes', () => {
      const content = `# ADR-0001\n\n## Context and Problem Statement (background)\n\n## Decision Outcome (architectural)\n\n## Consequences\n`;
      const diagnostics = runRule(
        rule,
        { content, path: 'startswith.md' },
        { options: { matchMode: 'startsWith' } },
      );
      expect(diagnostics).toEqual([]);
    });

    it('exact (default) rejects headings with suffixes', () => {
      const content = `# ADR-0001\n\n## Context and Problem Statement (background)\n\n## Decision Outcome\n\n## Consequences\n`;
      const diagnostics = runRule(rule, { content, path: 'exact.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data?.section).toBe('Context and Problem Statement');
    });
  });

  describe('headings with inline markup', () => {
    it('extracts text via mdast-util-to-string (e.g. ## **Bold** Context)', () => {
      const content = `# ADR-0001\n\n## **Bold** Context and Problem Statement\n\n## Decision Outcome\n\n## Consequences\n`;
      // The matched text would be "Bold Context and Problem Statement" — strict match would fail
      const diagnostics = runRule(rule, { content, path: 'inline-markup.md' });
      expect(diagnostics.length).toBeGreaterThan(0);
      // The `found` array should contain the inline-markup-stripped text
      expect(diagnostics[0]?.data?.found).toContain('Bold Context and Problem Statement');
    });
  });
});
