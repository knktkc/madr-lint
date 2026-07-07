import { describe, it, expect } from 'vitest';
import {
  applyEdits,
  collectFixes,
  fixFileContent,
  makeFixer,
  unifiedDiff,
  MAX_FIX_PASSES,
} from '../../src/core/fix.js';
import { frontmatterOffset } from '../../src/core/parser.js';
import type { Diagnostic, FixFn } from '../../src/core/types.js';

// Minimal Diagnostic factory carrying an optional live fix thunk. `fixable`
// mirrors "has a fix" so these fixtures look like runner-produced diagnostics.
function diag(fix?: FixFn): Diagnostic {
  return {
    ruleName: 'test/r',
    messageId: 'm',
    severity: 'error',
    path: 't.md',
    suggestion: null,
    docsUrl: '',
    fixable: fix !== undefined,
    ...(fix ? { fix } : {}),
  };
}

describe('core/fix — applyEdits', () => {
  it('applies a single replacement', () => {
    expect(applyEdits('hello world', [{ range: [6, 11], text: 'there' }])).toBe(
      'hello there',
    );
  });

  it('applies multiple non-overlapping edits regardless of input order', () => {
    // Deliberately unsorted input; the applier sorts by start offset.
    const out = applyEdits('abcdef', [
      { range: [4, 5], text: 'E' },
      { range: [0, 1], text: 'A' },
    ]);
    expect(out).toBe('AbcdEf');
  });

  it('drops the later of two overlapping edits (first-by-position wins)', () => {
    const out = applyEdits('abcdef', [
      { range: [0, 3], text: 'XYZ' },
      { range: [1, 4], text: '!!!' }, // overlaps the first → dropped
    ]);
    expect(out).toBe('XYZdef');
  });

  it('drops out-of-bounds and inverted ranges', () => {
    const out = applyEdits('abc', [
      { range: [1, 2], text: 'B' },
      { range: [2, 1], text: 'bad' }, // start > end
      { range: [5, 9], text: 'oob' }, // beyond length
    ]);
    expect(out).toBe('aBc');
  });

  it('supports zero-width insertions', () => {
    expect(applyEdits('ac', [{ range: [1, 1], text: 'b' }])).toBe('abc');
  });

  it('returns content unchanged for an empty edit list', () => {
    expect(applyEdits('abc', [])).toBe('abc');
  });
});

describe('core/fix — makeFixer (body → whole-file offset translation)', () => {
  it('is the identity when there is no frontmatter (offset 0)', () => {
    const f = makeFixer(0);
    expect(f.replaceRange([2, 5], 'z')).toEqual({ range: [2, 5], text: 'z' });
    expect(f.insertAt(3, 'q')).toEqual({ range: [3, 3], text: 'q' });
    expect(f.remove([4, 7])).toEqual({ range: [4, 7], text: '' });
  });

  it('adds the frontmatter offset to every range/offset', () => {
    const f = makeFixer(10);
    expect(f.replaceRange([2, 5], 'z')).toEqual({ range: [12, 15], text: 'z' });
    expect(f.insertAt(3, 'q')).toEqual({ range: [13, 13], text: 'q' });
    expect(f.remove([4, 7])).toEqual({ range: [14, 17], text: '' });
  });
});

describe('core/fix — collectFixes', () => {
  it('invokes thunks, flattens arrays, and skips null/absent fixes', () => {
    const content = 'hello ACCEPTED world';
    const edits = collectFixes(
      [
        diag((f) => f.replaceRange([6, 14], 'accepted')),
        diag(), // no fix
        diag(() => null), // opted out
        diag((f) => [f.replaceRange([0, 1], 'H'), f.insertAt(5, '!')]),
      ],
      content,
    );
    expect(edits).toEqual([
      { range: [6, 14], text: 'accepted' },
      { range: [0, 1], text: 'H' },
      { range: [5, 5], text: '!' },
    ]);
  });

  it('translates body offsets by the content-derived frontmatter offset', () => {
    const content = '---\nx: 1\n---\n# T\n\nACCEPTED\n';
    const fm = frontmatterOffset(content);
    const body = content.slice(fm);
    const i = body.indexOf('ACCEPTED');
    const edits = collectFixes([diag((f) => f.replaceRange([i, i + 8], 'accepted'))], content);
    // The single edit must land in whole-file coordinates.
    expect(edits).toEqual([{ range: [fm + i, fm + i + 8], text: 'accepted' }]);
    expect(applyEdits(content, edits)).toBe('---\nx: 1\n---\n# T\n\naccepted\n');
  });
});

describe('core/fix — fixFileContent (fixpoint loop)', () => {
  // A lint callback that fixes ACCEPTED → accepted in the body until gone.
  const lowercaseAccepted = (content: string): Diagnostic[] => {
    const fm = frontmatterOffset(content);
    const body = content.slice(fm);
    const i = body.indexOf('ACCEPTED');
    if (i === -1) return [];
    return [diag((f) => f.replaceRange([i, i + 8], 'accepted'))];
  };

  it('converges: applies fixes until none remain; remaining reflects final content', () => {
    const content = '---\nx: 1\n---\n# T\n\nStatus: ACCEPTED\n';
    const res = fixFileContent(content, lowercaseAccepted);
    expect(res.fixedContent).toBe('---\nx: 1\n---\n# T\n\nStatus: accepted\n');
    expect(res.changed).toBe(true);
    expect(res.remaining).toEqual([]);
    expect(res.passes).toBe(1);
    expect(res.applied).toBe(1);
  });

  it('leaves clean content untouched (no edits, no change, zero passes)', () => {
    const content = '# T\n\nStatus: accepted\n';
    const res = fixFileContent(content, lowercaseAccepted);
    expect(res.changed).toBe(false);
    expect(res.passes).toBe(0);
    expect(res.fixedContent).toBe(content);
  });

  it('caps at MAX_FIX_PASSES for a non-converging fixer', () => {
    // Always reports one fixable diagnostic that appends 'x' at end → never
    // stabilizes. The loop must stop at the pass bound.
    const evergrowing = (content: string): Diagnostic[] => [
      diag((f) => f.insertAt(content.length, 'x')),
    ];
    const res = fixFileContent('seed', evergrowing);
    expect(res.passes).toBe(MAX_FIX_PASSES);
    expect(res.applied).toBe(MAX_FIX_PASSES);
    expect(res.fixedContent).toBe('seed' + 'x'.repeat(MAX_FIX_PASSES));
    // The final content STILL has a fixable diagnostic — remaining reflects it.
    expect(res.remaining).toHaveLength(1);
  });

  it('honors a custom maxPasses bound', () => {
    const evergrowing = (content: string): Diagnostic[] => [
      diag((f) => f.insertAt(content.length, 'x')),
    ];
    const res = fixFileContent('seed', evergrowing, 3);
    expect(res.passes).toBe(3);
    expect(res.fixedContent).toBe('seedxxx');
  });

  it('breaks when a fix makes no progress (zero-width no-op)', () => {
    const noop = (): Diagnostic[] => [diag((f) => f.replaceRange([0, 0], ''))];
    const res = fixFileContent('abc', noop);
    expect(res.changed).toBe(false);
    expect(res.passes).toBe(0);
    expect(res.remaining).toHaveLength(1);
  });

  it('only fixes what the callback returns (suppressed/baselined excluded upstream)', () => {
    // Simulate a diagnostic the caller filtered out (suppression/baseline):
    // the callback returns no fixable diagnostics, so nothing is rewritten.
    const content = '# T\n\nStatus: ACCEPTED\n';
    const res = fixFileContent(content, () => []);
    expect(res.changed).toBe(false);
    expect(res.fixedContent).toBe(content);
  });

  // `applied` must count edits that actually LANDED — not every edit collected.
  // Edits dropped by the overlap policy or bounds validation never touched the
  // content, and `summary.fixed` is built from this number.
  it('does not count an edit dropped by the overlap policy', () => {
    const lint = (content: string): Diagnostic[] => {
      if (content.startsWith('XYZ')) return []; // converged
      return [
        diag((f) => f.replaceRange([0, 3], 'XYZ')),
        diag((f) => f.replaceRange([1, 4], '!!!')), // overlaps the first → dropped
      ];
    };
    const res = fixFileContent('abcdef', lint);
    expect(res.fixedContent).toBe('XYZdef');
    expect(res.passes).toBe(1);
    expect(res.applied).toBe(1); // 2 collected, 1 landed
  });

  it('does not count an out-of-bounds edit', () => {
    const lint = (content: string): Diagnostic[] => {
      if (content === 'aBc') return []; // converged
      return [
        diag((f) => f.replaceRange([1, 2], 'B')),
        diag((f) => f.replaceRange([50, 60], 'oob')), // beyond length → dropped
      ];
    };
    const res = fixFileContent('abc', lint);
    expect(res.fixedContent).toBe('aBc');
    expect(res.applied).toBe(1); // 2 collected, 1 landed
  });
});

describe('core/fix — unifiedDiff', () => {
  it('emits headers and +/- lines for a changed file', () => {
    const before = '# T\n\n- Status: Accepted\n';
    const after = '# T\n\n- Status: accepted\n';
    const out = unifiedDiff('docs/adr/0001-a.md', before, after);
    expect(out).toContain('--- a/docs/adr/0001-a.md');
    expect(out).toContain('+++ b/docs/adr/0001-a.md');
    expect(out).toContain('-- Status: Accepted');
    expect(out).toContain('+- Status: accepted');
  });

  it('returns an empty string when content is unchanged', () => {
    expect(unifiedDiff('a.md', 'same\n', 'same\n')).toBe('');
  });
});
