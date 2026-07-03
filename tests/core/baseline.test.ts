import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyBaseline,
  baselineHiddenSummary,
  baselinePath,
  baselineWriteSummary,
  buildBaseline,
  loadBaseline,
  serializeBaseline,
  writeBaseline,
  type Baseline,
} from '../../src/core/baseline.js';
import { INTERNAL_ERROR_RULE_NAME, type Diagnostic } from '../../src/core/types.js';

function diag(partial: Partial<Diagnostic> & Pick<Diagnostic, 'ruleName' | 'messageId' | 'path'>): Diagnostic {
  return {
    severity: 'error',
    ...partial,
  };
}

describe('core/baseline', () => {
  describe('buildBaseline', () => {
    it('counts diagnostics by (path, rule, messageId)', () => {
      const b = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
        diag({ path: 'b.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      expect(b.entries['a.md']?.['madr/required-sections']?.['missingSection']).toBe(3);
      expect(b.entries['a.md']?.['madr/status-enum']?.['invalidStatus']).toBe(1);
      expect(b.entries['b.md']?.['madr/status-enum']?.['invalidStatus']).toBe(1);
    });

    it('never records core/internal-error diagnostics', () => {
      const b = buildBaseline([
        diag({ path: 'a.md', ruleName: INTERNAL_ERROR_RULE_NAME, messageId: 'ruleCrashed' }),
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      expect(b.entries['a.md']?.[INTERNAL_ERROR_RULE_NAME]).toBeUndefined();
      expect(b.entries['a.md']?.['madr/status-enum']?.['invalidStatus']).toBe(1);
    });
  });

  describe('serializeBaseline', () => {
    it('sorts keys (path, then rule, then messageId), 2-space indent, trailing newline', () => {
      // Deliberately reverse insertion order to prove sorting is applied.
      const baseline: Baseline = {
        version: 1,
        entries: {
          'z.md': { 'madr/status-enum': { invalidStatus: 1 } },
          'a.md': {
            'madr/status-enum': { invalidStatus: 2 },
            'madr/required-sections': { missingSection: 1 },
          },
        },
      };
      const text = serializeBaseline(baseline);
      expect(text.endsWith('\n')).toBe(true);
      expect(text.includes('\n  ')).toBe(true); // 2-space indent present
      // Paths sorted a.md before z.md; within a.md, rule keys sorted.
      const aIdx = text.indexOf('a.md');
      const zIdx = text.indexOf('z.md');
      expect(aIdx).toBeLessThan(zIdx);
      const reqIdx = text.indexOf('required-sections');
      const statusIdx = text.indexOf('status-enum');
      expect(reqIdx).toBeLessThan(statusIdx);
    });

    it('is deterministic regardless of buildBaseline insertion order', () => {
      const one = buildBaseline([
        diag({ path: 'b.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
      ]);
      const two = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'b.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      expect(serializeBaseline(one)).toBe(serializeBaseline(two));
    });
  });

  describe('applyBaseline', () => {
    it('baselines the first N matching diagnostics and reports the (N+1)th', () => {
      const baseline = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
      ]);
      // Now three occurrences exist — two are baselined, one is new.
      const { kept, hidden } = applyBaseline(
        [
          diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
          diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
          diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        ],
        baseline,
      );
      expect(hidden).toBe(2);
      expect(kept).toHaveLength(1);
    });

    it('survives unrelated edits: same counts but different line numbers still subtract fully', () => {
      const baseline = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus', loc: { line: 3, column: 1 } }),
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus', loc: { line: 8, column: 1 } }),
      ]);
      // A later run: unrelated edits shifted the lines, but the count is the same.
      const { kept, hidden } = applyBaseline(
        [
          diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus', loc: { line: 42, column: 1 } }),
          diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus', loc: { line: 99, column: 1 } }),
        ],
        baseline,
      );
      expect(hidden).toBe(2);
      expect(kept).toEqual([]);
    });

    it('baselines both errors and warnings', () => {
      const baseline = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus', severity: 'error' }),
        diag({ path: 'a.md', ruleName: 'madr/no-numbering-gap', messageId: 'gap', severity: 'warn' }),
      ]);
      const { kept, hidden } = applyBaseline(
        [
          diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus', severity: 'error' }),
          diag({ path: 'a.md', ruleName: 'madr/no-numbering-gap', messageId: 'gap', severity: 'warn' }),
        ],
        baseline,
      );
      expect(hidden).toBe(2);
      expect(kept).toEqual([]);
    });

    it('never baselines core/internal-error even if present in the baseline data', () => {
      // Even a hand-crafted baseline claiming to cover internal-error must not hide it.
      const baseline: Baseline = {
        version: 1,
        entries: { 'a.md': { [INTERNAL_ERROR_RULE_NAME]: { ruleCrashed: 5 } } },
      };
      const { kept, hidden } = applyBaseline(
        [diag({ path: 'a.md', ruleName: INTERNAL_ERROR_RULE_NAME, messageId: 'ruleCrashed' })],
        baseline,
      );
      expect(hidden).toBe(0);
      expect(kept).toHaveLength(1);
    });

    it('stale entries (count exceeds current matches) are inert — no error, just fewer hidden', () => {
      const baseline: Baseline = {
        version: 1,
        entries: { 'a.md': { 'madr/status-enum': { invalidStatus: 5 } } },
      };
      const { kept, hidden } = applyBaseline(
        [diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' })],
        baseline,
      );
      expect(hidden).toBe(1);
      expect(kept).toEqual([]);
    });

    it('reports diagnostics with no baseline entry at all', () => {
      const baseline: Baseline = { version: 1, entries: {} };
      const { kept, hidden } = applyBaseline(
        [diag({ path: 'new.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' })],
        baseline,
      );
      expect(hidden).toBe(0);
      expect(kept).toHaveLength(1);
    });
  });

  describe('loadBaseline / writeBaseline', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'madr-lint-baseline-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('returns null for an absent file (no-op)', () => {
      expect(loadBaseline(join(dir, 'nope.json'))).toBeNull();
    });

    it('returns null for malformed JSON rather than throwing', () => {
      const p = join(dir, 'baseline.json');
      writeFileSync(p, 'not json{');
      expect(loadBaseline(p)).toBeNull();
    });

    it('round-trips through write + load, creating the directory', () => {
      const baseline = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      const p = baselinePath(dir);
      writeBaseline(p, baseline);
      // Written file is the deterministic serialization.
      expect(readFileSync(p, 'utf8')).toBe(serializeBaseline(baseline));
      const loaded = loadBaseline(p);
      expect(loaded?.entries['a.md']?.['madr/status-enum']?.['invalidStatus']).toBe(1);
    });
  });

  describe('summaries', () => {
    it('baselineWriteSummary reports total violation count and file count', () => {
      const baseline = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'a.md', ruleName: 'madr/required-sections', messageId: 'missingSection' }),
        diag({ path: 'b.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      const s = baselineWriteSummary(baseline);
      expect(s).toContain('3'); // 3 total baselined violations
      expect(s).toContain('2 files');
      expect(s).toContain('.madr-lint/baseline.json');
    });

    it('baselineHiddenSummary pluralizes and cites the baseline path', () => {
      expect(baselineHiddenSummary(1)).toBe(
        '1 problem hidden by baseline (.madr-lint/baseline.json)',
      );
      expect(baselineHiddenSummary(7)).toBe(
        '7 problems hidden by baseline (.madr-lint/baseline.json)',
      );
    });
  });
});
