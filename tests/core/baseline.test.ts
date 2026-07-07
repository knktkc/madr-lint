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
    suggestion: null,
    docsUrl: '',
    fixable: false,
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
      // "violations" (sum of counts), not "entries" — that word names the
      // on-disk map and would collide.
      expect(s).toContain('3 violations');
      expect(s).not.toContain('entries');
      expect(s).toContain('2 files');
      expect(s).toContain('.madr-lint/baseline.json');
    });

    it('baselineWriteSummary uses singular forms for one violation in one file', () => {
      const baseline = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      const s = baselineWriteSummary(baseline);
      expect(s).toContain('1 violation ');
      expect(s).toContain('1 file');
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

  // CodeQL js/prototype-polluting-assignment: `entries[d.path] ??= {}` with a
  // key of '__proto__' reads Object.prototype (non-nullish), so the follow-up
  // write lands ON Object.prototype — polluting every object in the process —
  // and the entry silently vanishes from the serialized baseline. Paths derive
  // from on-disk filenames, so this is externally reachable.
  describe('prototype pollution hardening', () => {
    // A RED run of these tests really does pollute Object.prototype; scrub
    // the specific keys afterwards so sibling tests are not contaminated.
    // NOTE: '__proto__' itself must NOT be scrubbed — deleting the built-in
    // accessor from Object.prototype would change '__proto__' semantics for
    // the rest of the worker and mask the very hazard under test.
    const SENTINEL_KEYS = ['madr/status-enum', 'invalidStatus'];
    afterEach(() => {
      for (const key of SENTINEL_KEYS) {
        if (Object.hasOwn(Object.prototype, key)) {
          Reflect.deleteProperty(Object.prototype, key);
        }
      }
    });

    it('a path of "__proto__" does not pollute Object.prototype and is still recorded', () => {
      const b = buildBaseline([
        diag({ path: '__proto__', ruleName: 'madr/status-enum', messageId: 'invalidStatus' }),
      ]);
      // Global pollution check: a fresh object must not have gained the rule key.
      const fresh: Record<string, unknown> = {};
      expect(fresh['madr/status-enum']).toBeUndefined();
      // The entry must exist as an OWN property (not vanish into the prototype).
      expect(Object.hasOwn(b.entries, '__proto__')).toBe(true);
      expect(b.entries['__proto__']?.['madr/status-enum']?.['invalidStatus']).toBe(1);
    });

    it('a ruleName of "__proto__" does not pollute Object.prototype and is still recorded', () => {
      const b = buildBaseline([
        diag({ path: 'a.md', ruleName: '__proto__', messageId: 'invalidStatus' }),
      ]);
      const fresh: Record<string, unknown> = {};
      expect(fresh['invalidStatus']).toBeUndefined();
      const byRule = b.entries['a.md'];
      expect(byRule && Object.hasOwn(byRule, '__proto__')).toBe(true);
      expect(byRule?.['__proto__']?.['invalidStatus']).toBe(1);
    });

    it('a messageId of "__proto__" is counted as an ordinary key', () => {
      const b = buildBaseline([
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: '__proto__' }),
        diag({ path: 'a.md', ruleName: 'madr/status-enum', messageId: '__proto__' }),
      ]);
      const byMessage = b.entries['a.md']?.['madr/status-enum'];
      expect(byMessage && Object.hasOwn(byMessage, '__proto__')).toBe(true);
      expect(byMessage?.['__proto__']).toBe(2);
    });

    it('a "__proto__" path survives serialize → write → load → apply round-trip', () => {
      const dir = mkdtempSync(join(tmpdir(), 'madr-lint-proto-'));
      try {
        const d = diag({
          path: '__proto__',
          ruleName: 'madr/status-enum',
          messageId: 'invalidStatus',
        });
        const built = buildBaseline([d]);
        // Serialization must carry the key as DATA (not lose it to a setter).
        expect(serializeBaseline(built)).toContain('"__proto__"');

        const p = baselinePath(dir);
        writeBaseline(p, built);
        const loaded = loadBaseline(p);
        expect(loaded).not.toBeNull();
        const applied = applyBaseline([d], loaded as Baseline);
        expect(applied.hidden).toBe(1);
        expect(applied.kept).toEqual([]);
        // Loading a '__proto__'-keyed file must not have polluted anything.
        const fresh: Record<string, unknown> = {};
        expect(fresh['madr/status-enum']).toBeUndefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a path merely CONTAINING a __proto__ segment is an ordinary whole-string key', () => {
      const d = diag({
        path: 'docs/adr/__proto__/0001-x.md',
        ruleName: 'madr/status-enum',
        messageId: 'invalidStatus',
      });
      const b = buildBaseline([d]);
      expect(
        b.entries['docs/adr/__proto__/0001-x.md']?.['madr/status-enum']?.['invalidStatus'],
      ).toBe(1);
      expect(applyBaseline([d], b).hidden).toBe(1);
    });
  });
});
