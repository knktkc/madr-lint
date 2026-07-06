import { describe, it, expect } from 'vitest';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/no-duplicate-numbering/index.js';

function file(path: string): ReturnType<typeof buildProjectFile> {
  return buildProjectFile({ path, content: '# x\n' });
}

describe('madr/no-duplicate-numbering', () => {
  it('passes when all numbers are unique', () => {
    const files = [file('0001-a.md'), file('0002-b.md'), file('0003-c.md')];
    expect(runRulesOnProject([rule], files)).toEqual([]);
  });

  it('reports both files of a duplicate pair', () => {
    const files = [file('0001-a.md'), file('0001-b.md')];
    const diagnostics = runRulesOnProject([rule], files);
    expect(diagnostics).toHaveLength(2);
    for (const d of diagnostics) {
      expect(d).toMatchObject({
        ruleName: 'madr/no-duplicate-numbering',
        messageId: 'duplicateNumber',
        severity: 'error',
        data: { number: '0001' },
      });
      // self-contained diagnostics (#67)
      expect(d.suggestion).toContain('renumber');
      expect(d.docsUrl).toBe(
        'https://knktkc.github.io/madr-lint/rules/no-duplicate-numbering/',
      );
    }
    const paths = diagnostics.map((d) => d.path).toSorted();
    expect(paths).toEqual(['0001-a.md', '0001-b.md']);
  });

  it('reports each member of a triple-duplicate group', () => {
    const files = [
      file('0001-a.md'),
      file('0001-b.md'),
      file('0001-c.md'),
      file('0002-unique.md'),
    ];
    const diagnostics = runRulesOnProject([rule], files);
    expect(diagnostics).toHaveLength(3);
    const paths = diagnostics.map((d) => d.path).toSorted();
    expect(paths).toEqual(['0001-a.md', '0001-b.md', '0001-c.md']);
  });

  it('reports multiple independent duplicate groups', () => {
    const files = [
      file('0001-a.md'),
      file('0001-b.md'),
      file('0002-c.md'),
      file('0002-d.md'),
    ];
    const diagnostics = runRulesOnProject([rule], files);
    expect(diagnostics).toHaveLength(4);
    const numbers = diagnostics.map((d) => d.data?.number).toSorted();
    expect(numbers).toEqual(['0001', '0001', '0002', '0002']);
  });

  it('ignores files that do not match the NNNN- prefix pattern', () => {
    // template.md, README.md, 0001nohyphen.md — none of these are duplicates
    // of each other or of any 4-digit-prefixed file
    const files = [
      file('template.md'),
      file('README.md'),
      file('0001nohyphen.md'),
      file('0001-foo.md'),
    ];
    expect(runRulesOnProject([rule], files)).toEqual([]);
  });

  it('handles directory-prefixed paths (recursive walk)', () => {
    const files = [
      file('docs/adr/0001-a.md'),
      file('docs/adr/sub/0001-b.md'),
    ];
    const diagnostics = runRulesOnProject([rule], files);
    expect(diagnostics).toHaveLength(2);
  });

  it('paths data field lists all files in the conflict', () => {
    const files = [file('0001-a.md'), file('0001-b.md'), file('0001-c.md')];
    const diagnostics = runRulesOnProject([rule], files);
    expect(diagnostics[0]?.data?.paths).toBe('0001-a.md, 0001-b.md, 0001-c.md');
  });
});
