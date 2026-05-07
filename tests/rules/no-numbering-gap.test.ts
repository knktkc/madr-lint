import { describe, it, expect } from 'vitest';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/no-numbering-gap/index.js';

function f(path: string): ReturnType<typeof buildProjectFile> {
  return buildProjectFile({ path, content: '# x\n' });
}

describe('madr/no-numbering-gap', () => {
  describe('no gaps (valid)', () => {
    it('contiguous from 0001', () => {
      const files = [f('0001-a.md'), f('0002-b.md'), f('0003-c.md')];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('contiguous from a higher start', () => {
      const files = [f('0042-a.md'), f('0043-b.md')];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('single file', () => {
      expect(runRulesOnProject([rule], [f('0001-only.md')])).toEqual([]);
    });

    it('empty file list', () => {
      expect(runRulesOnProject([rule], [])).toEqual([]);
    });

    it('non-NNNN files are ignored', () => {
      const files = [f('template.md'), f('README.md'), f('0001-a.md'), f('0002-b.md')];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });
  });

  describe('gap detection', () => {
    it('single gap of 1 number', () => {
      const files = [f('0001-a.md'), f('0003-c.md')];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/no-numbering-gap',
        messageId: 'numberingGap',
        path: '0003-c.md',
        data: { from: '0001', to: '0003', missing: '0002' },
      });
    });

    it('gap of multiple numbers', () => {
      const files = [f('0001-a.md'), f('0005-e.md')];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data).toMatchObject({
        from: '0001',
        to: '0005',
        missing: '0002, 0003, 0004',
      });
    });

    it('multiple separate gaps', () => {
      const files = [
        f('0001-a.md'),
        f('0003-c.md'),  // missing 0002
        f('0006-f.md'),  // missing 0004, 0005
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(2);
      const gaps = diagnostics
        .map((d) => `${d.data?.from}→${d.data?.to}`)
        .toSorted();
      expect(gaps).toEqual(['0001→0003', '0003→0006']);
    });

    it('gap reported on the higher-side file', () => {
      const files = [f('0001-a.md'), f('0003-c.md')];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics[0]?.path).toBe('0003-c.md');
    });

    it('non-NNNN files do not affect gap detection', () => {
      const files = [
        f('template.md'),
        f('0001-a.md'),
        f('0003-c.md'),
        f('README.md'),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data?.missing).toBe('0002');
    });

    it('handles unsorted file order correctly', () => {
      // Files are presented out of numerical order (e.g. fs walk yields
      // them differently). Rule must sort internally.
      const files = [f('0003-c.md'), f('0001-a.md'), f('0002-b.md')];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('handles a gap at the boundary of double-digit ranges', () => {
      const files = [f('0009-a.md'), f('0011-c.md')];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data).toMatchObject({
        from: '0009',
        to: '0011',
        missing: '0010',
      });
    });
  });
});
