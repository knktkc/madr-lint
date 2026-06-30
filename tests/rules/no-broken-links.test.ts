import { describe, it, expect } from 'vitest';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/no-broken-links/index.js';

function f(path: string, body: string): ReturnType<typeof buildProjectFile> {
  return buildProjectFile({ path, content: body });
}

// fileExists predicates for the filesystem-fallback tests, hoisted to module
// scope so they aren't recreated per test (oxlint consistent-function-scoping).
const existsAt =
  (target: string) =>
  (p: string): boolean =>
    p === target;
const neverExists = (): boolean => false;

describe('madr/no-broken-links', () => {
  describe('valid links', () => {
    it('relative link to an existing file in the same dir', () => {
      const files = [
        f('docs/adr/0001-a.md', '# A\n\n[See B](./0002-b.md)\n'),
        f('docs/adr/0002-b.md', '# B\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('relative link with anchor to an existing file', () => {
      const files = [
        f('docs/adr/0001-a.md', '# A\n\n[See section](./0002-b.md#decision)\n'),
        f('docs/adr/0002-b.md', '# B\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('http(s) external links are skipped', () => {
      const files = [
        f('docs/adr/0001-a.md', '[ext](https://example.com/page)\n[insecure](http://x.test)\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('mailto / ftp / other protocol links are skipped', () => {
      const files = [
        f('docs/adr/0001-a.md', '[mail](mailto:foo@example.com)\n[ftp](ftp://example.com/file)\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('pure anchor links are skipped', () => {
      const files = [
        f('docs/adr/0001-a.md', '[top](#header)\n[empty](#)\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('cross-directory relative link that resolves correctly', () => {
      const files = [
        f('docs/adr/topic/0001-a.md', '[Up](../0042-shared.md)\n'),
        f('docs/adr/0042-shared.md', '# shared\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });
  });

  describe('broken links', () => {
    it('relative link to a missing file', () => {
      const files = [
        f('docs/adr/0001-a.md', '[Missing](./0099-nope.md)\n'),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/no-broken-links',
        messageId: 'brokenLink',
        path: 'docs/adr/0001-a.md',
        data: { url: './0099-nope.md', resolvedPath: 'docs/adr/0099-nope.md' },
      });
    });

    it('multiple broken links in one file', () => {
      const files = [
        f(
          'docs/adr/0001-a.md',
          '[A](./missing-a.md)\n[B](./missing-b.md)\n',
        ),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.map((d) => d.data?.url).toSorted()).toEqual([
        './missing-a.md',
        './missing-b.md',
      ]);
    });

    it('broken link with anchor still reports', () => {
      const files = [
        f('docs/adr/0001-a.md', '[Missing section](./0099-nope.md#x)\n'),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data).toMatchObject({
        url: './0099-nope.md#x',
        resolvedPath: 'docs/adr/0099-nope.md',
      });
    });

    it('cross-directory broken link', () => {
      const files = [
        f('docs/adr/topic/0001-a.md', '[Up](../0099-missing.md)\n'),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data?.resolvedPath).toBe('docs/adr/0099-missing.md');
    });
  });

  describe('AST traversal — links in nested nodes', () => {
    it('finds links inside headings', () => {
      const files = [
        f('docs/adr/0001-a.md', '# Heading with [link](./0099-x.md)\n'),
      ];
      expect(runRulesOnProject([rule], files)).toHaveLength(1);
    });

    it('finds links inside list items', () => {
      const files = [
        f('docs/adr/0001-a.md', '- item with [link](./0099-x.md)\n'),
      ];
      expect(runRulesOnProject([rule], files)).toHaveLength(1);
    });

    it('finds links inside emphasis', () => {
      const files = [
        f('docs/adr/0001-a.md', '_italic with [link](./0099-x.md)_\n'),
      ];
      expect(runRulesOnProject([rule], files)).toHaveLength(1);
    });
  });

  describe('files without links produce no diagnostics', () => {
    it('plain prose only', () => {
      const files = [
        f('docs/adr/0001-a.md', '# ADR-0001\n\nJust some prose without links.\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });
  });

  // Links to assets that are not in the linted .md set (non-Markdown files
  // like JSON/YAML, or Markdown files outside the scanned paths) must NOT be
  // flagged broken when they actually exist on disk. The orchestrator injects
  // a `fileExists` predicate; the rule consults it as a fallback to knownPaths.
  describe('filesystem fallback (fileExists)', () => {
    it('non-md asset link that exists on disk is not broken', () => {
      const files = [
        f('docs/adr/0001-a.md', '[data](./data.json)\n'),
      ];
      expect(
        runRulesOnProject([rule], files, {
          fileExists: existsAt('docs/adr/data.json'),
        }),
      ).toEqual([]);
    });

    it('out-of-scope md link that exists on disk is not broken', () => {
      const files = [
        f('docs/adr/0001-a.md', '[readme](../README.md)\n'),
      ];
      expect(
        runRulesOnProject([rule], files, {
          fileExists: existsAt('docs/README.md'),
        }),
      ).toEqual([]);
    });

    it('still reports broken when fileExists returns false', () => {
      const files = [
        f('docs/adr/0001-a.md', '[gone](./gone.json)\n'),
      ];
      const diagnostics = runRulesOnProject([rule], files, {
        fileExists: neverExists,
      });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.data).toMatchObject({
        url: './gone.json',
        resolvedPath: 'docs/adr/gone.json',
      });
    });

    it('knownPaths still resolves links even when fileExists says no', () => {
      const files = [
        f('docs/adr/0001-a.md', '[b](./0002-b.md)\n'),
        f('docs/adr/0002-b.md', '# B\n'),
      ];
      expect(
        runRulesOnProject([rule], files, { fileExists: neverExists }),
      ).toEqual([]);
    });
  });

  describe('URL query strings and percent-encoding', () => {
    it('strips a ?query before resolving the target', () => {
      const files = [
        f('docs/adr/0001-a.md', '[b](./0002-b.md?v=2)\n'),
        f('docs/adr/0002-b.md', '# B\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('percent-decodes the path so spaces resolve to the real file', () => {
      const files = [
        f('docs/adr/0001-a.md', '[b](./my%20file.md)\n'),
        f('docs/adr/my file.md', '# B\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('leaves malformed percent-encoding untouched (no throw)', () => {
      const files = [
        f('docs/adr/0001-a.md', '[bad](./100%.md)\n'),
        f('docs/adr/100%.md', '# B\n'),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });
  });
});
