import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeContentHash, manifestPath } from '../../src/core/cache.js';
import { lintFiles, type CacheConfig } from '../../src/core/lint.js';
import { RuleOptionsError } from '../../src/core/runner.js';
import type { ProjectRule } from '../../src/core/types.js';
import filenameFormat from '../../src/rules/filename-format/index.js';
import noBrokenLinks from '../../src/rules/no-broken-links/index.js';
import noDuplicateNumbering from '../../src/rules/no-duplicate-numbering/index.js';
import requiredSections from '../../src/rules/required-sections/index.js';

// A custom project rule with an option, used to prove lintFiles threads
// per-rule options through the PROJECT pass (no built-in project rule has
// options today).
const tagProjectRule: ProjectRule<{ tag: string }> = {
  meta: {
    name: 'test/tag-project',
    type: 'project',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: { description: 'echo tag', recommended: false },
    messages: { echo: '{{tag}}' },
    defaultOptions: { tag: 'default' },
  },
  check(ctx) {
    ctx.report({
      messageId: 'echo',
      path: '<project>',
      data: { tag: ctx.options.tag },
    });
  },
};

describe('core/lint', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-lint-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns no diagnostics for a clean ADR', () => {
    const file = join(dir, '0001-good.md');
    writeFileSync(
      file,
      [
        '# ADR-0001',
        '',
        '## Context and Problem Statement',
        '',
        'ok',
        '',
        '## Decision Outcome',
        '',
        'ok',
        '',
        '## Consequences',
        '',
        'ok',
      ].join('\n'),
    );

    const result = lintFiles({
      rules: [filenameFormat, requiredSections],
      ruleSeverity: {
        'madr/filename-format': 'error',
        'madr/required-sections': 'error',
      },
      files: [file],
      cwd: dir,
    });

    expect(result.filesChecked).toBe(1);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports filename violations', () => {
    const file = join(dir, 'BAD_NAME.md');
    writeFileSync(file, '# x');
    const result = lintFiles({
      rules: [filenameFormat],
      ruleSeverity: { 'madr/filename-format': 'error' },
      files: [file],
      cwd: dir,
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.ruleName).toBe('madr/filename-format');
  });

  it('skips rules with severity: off', () => {
    const file = join(dir, 'BAD_NAME.md');
    writeFileSync(file, '# x');
    const result = lintFiles({
      rules: [filenameFormat],
      ruleSeverity: { 'madr/filename-format': 'off' },
      files: [file],
      cwd: dir,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('respects severity from config (warn)', () => {
    const file = join(dir, 'BAD_NAME.md');
    writeFileSync(file, '# x');
    const result = lintFiles({
      rules: [filenameFormat],
      ruleSeverity: { 'madr/filename-format': 'warn' },
      files: [file],
      cwd: dir,
    });
    expect(result.diagnostics[0]?.severity).toBe('warn');
  });

  it('uses relative paths in diagnostics (not absolute)', () => {
    const file = join(dir, 'BAD_NAME.md');
    writeFileSync(file, '# x');
    const result = lintFiles({
      rules: [filenameFormat],
      ruleSeverity: { 'madr/filename-format': 'error' },
      files: [file],
      cwd: dir,
    });
    expect(result.diagnostics[0]?.path).toBe('BAD_NAME.md');
  });

  it('runs multiple rules in single-pass per file', () => {
    const file = join(dir, 'BAD_NAME.md');
    writeFileSync(file, '# Just a heading\n\nNo required sections here.');
    const result = lintFiles({
      rules: [filenameFormat, requiredSections],
      ruleSeverity: {
        'madr/filename-format': 'error',
        'madr/required-sections': 'error',
      },
      files: [file],
      cwd: dir,
    });
    // Filename violation + 3 missing sections = 4 diagnostics
    expect(result.diagnostics).toHaveLength(4);
    const names = new Set(result.diagnostics.map((d) => d.ruleName));
    expect(names).toEqual(new Set(['madr/filename-format', 'madr/required-sections']));
  });

  it('handles multiple files independently', () => {
    const file1 = join(dir, '0001-a.md');
    const file2 = join(dir, '0002-b.md');
    writeFileSync(file1, '# Good\n\n## Context and Problem Statement\n## Decision Outcome\n## Consequences\n');
    writeFileSync(file2, '# Bad\n');
    const result = lintFiles({
      rules: [requiredSections],
      ruleSeverity: { 'madr/required-sections': 'error' },
      files: [file1, file2],
      cwd: dir,
    });
    expect(result.filesChecked).toBe(2);
    // Only file2 has missing sections (3 of them)
    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics.every((d) => d.path === '0002-b.md')).toBe(true);
  });

  describe('per-rule options from config tuples', () => {
    it('applies a tuple option (filename-format pattern) so a custom-named file passes', () => {
      const file = join(dir, 'ADR-001.md');
      writeFileSync(file, '# x');
      const result = lintFiles({
        rules: [filenameFormat],
        ruleSeverity: {
          'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
        },
        files: [file],
        cwd: dir,
      });
      // ADR-001.md matches the custom pattern → no diagnostics. (With the bug,
      // the default NNNN pattern applied and this produced 1 diagnostic.)
      expect(result.diagnostics).toEqual([]);
    });

    it('a tuple option that tightens the rule yields a diagnostic echoing that option', () => {
      const file = join(dir, '0001-a.md');
      writeFileSync(file, '# x');
      const result = lintFiles({
        rules: [filenameFormat],
        ruleSeverity: {
          'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
        },
        files: [file],
        cwd: dir,
      });
      // 0001-a.md does NOT match the custom ADR- pattern → 1 diagnostic whose
      // reported `expected` is the configured pattern, not the default.
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.data?.expected).toBe('^ADR-[0-9]+\\.md$');
    });

    it('threads per-rule options to PROJECT rules via lintFiles', () => {
      const file = join(dir, '0001-a.md');
      writeFileSync(file, '# x');
      const result = lintFiles({
        rules: [tagProjectRule],
        ruleSeverity: { 'test/tag-project': ['error', { tag: 'CONFIGURED' }] },
        files: [file],
        cwd: dir,
      });
      const d = result.diagnostics.find((x) => x.ruleName === 'test/tag-project');
      expect(d?.data?.tag).toBe('CONFIGURED');
    });

    it('propagates RuleOptionsError for an invalid config option (CLI surfaces it)', () => {
      const file = join(dir, '0001-a.md');
      writeFileSync(file, '# x');
      expect(() =>
        lintFiles({
          rules: [filenameFormat],
          // pattern must be a string per schema → AJV rejects 123.
          ruleSeverity: { 'madr/filename-format': ['error', { pattern: 123 }] },
          files: [file],
          cwd: dir,
        }),
      ).toThrow(RuleOptionsError);
    });
  });

  describe('project rule integration', () => {
    it('dispatches project rules alongside per-file rules in one call', () => {
      const file1 = join(dir, '0001-a.md');
      const file2 = join(dir, '0001-b.md'); // duplicate number
      writeFileSync(file1, '# x');
      writeFileSync(file2, '# x');

      const result = lintFiles({
        rules: [filenameFormat, noDuplicateNumbering],
        ruleSeverity: {
          'madr/filename-format': 'error',
          'madr/no-duplicate-numbering': 'error',
        },
        files: [file1, file2],
        cwd: dir,
      });

      // Both rules ran. Per-file rule (filename-format) sees valid names.
      // Project rule (no-duplicate-numbering) sees the duplicate.
      const projectDiags = result.diagnostics.filter(
        (d) => d.ruleName === 'madr/no-duplicate-numbering',
      );
      expect(projectDiags).toHaveLength(2);
      expect(projectDiags.map((d) => d.path).toSorted()).toEqual([
        '0001-a.md',
        '0001-b.md',
      ]);
    });

    it('skips project pass entirely when project rule severity is off', () => {
      const file1 = join(dir, '0001-a.md');
      writeFileSync(file1, '# x');

      const result = lintFiles({
        rules: [noDuplicateNumbering],
        ruleSeverity: { 'madr/no-duplicate-numbering': 'off' },
        files: [file1],
        cwd: dir,
      });
      expect(result.diagnostics).toEqual([]);
    });

    it('no-broken-links: link to an existing non-md sibling is not broken', () => {
      const adr = join(dir, '0001-a.md');
      writeFileSync(adr, '# ADR-0001\n\nSee [requirements](./requirements.json).\n');
      writeFileSync(join(dir, 'requirements.json'), '{}\n');

      const result = lintFiles({
        rules: [noBrokenLinks],
        ruleSeverity: { 'madr/no-broken-links': 'error' },
        files: [adr],
        cwd: dir,
      });
      expect(
        result.diagnostics.filter((d) => d.ruleName === 'madr/no-broken-links'),
      ).toEqual([]);
    });

    it('no-broken-links: link to a genuinely missing file is broken', () => {
      const adr = join(dir, '0001-a.md');
      writeFileSync(adr, '# ADR-0001\n\nSee [gone](./nope.json).\n');

      const result = lintFiles({
        rules: [noBrokenLinks],
        ruleSeverity: { 'madr/no-broken-links': 'error' },
        files: [adr],
        cwd: dir,
      });
      const broken = result.diagnostics.filter(
        (d) => d.ruleName === 'madr/no-broken-links',
      );
      expect(broken).toHaveLength(1);
      expect(broken[0]?.data).toMatchObject({ url: './nope.json' });
    });

    it('no-broken-links: a link escaping the project root is broken even if the target exists', () => {
      const project = join(dir, 'project');
      mkdirSync(project);
      const adr = join(project, '0001-a.md');
      writeFileSync(adr, '# ADR\n\n[outside](../outside.md)\n');
      // Real file, but ABOVE the project root (cwd = project) → not "in the project".
      writeFileSync(join(dir, 'outside.md'), '# outside\n');

      const result = lintFiles({
        rules: [noBrokenLinks],
        ruleSeverity: { 'madr/no-broken-links': 'error' },
        files: [adr],
        cwd: project,
      });
      const broken = result.diagnostics.filter(
        (d) => d.ruleName === 'madr/no-broken-links',
      );
      expect(broken).toHaveLength(1);
      expect(broken[0]?.data?.resolvedPath).toBe('../outside.md');
    });

    it('no-broken-links: an absolute (/-rooted) link with interior .. that escapes the root is broken', () => {
      const project = join(dir, 'project');
      mkdirSync(project);
      const adr = join(project, '0001-a.md');
      // `/`-rooted link resolves project-relative; the interior `..` walks
      // above the project root to a real file that must NOT be accepted.
      writeFileSync(adr, '# ADR\n\n[x](/foo/../../outside.md)\n');
      writeFileSync(join(dir, 'outside.md'), '# outside\n');

      const result = lintFiles({
        rules: [noBrokenLinks],
        ruleSeverity: { 'madr/no-broken-links': 'error' },
        files: [adr],
        cwd: project,
      });
      const broken = result.diagnostics.filter(
        (d) => d.ruleName === 'madr/no-broken-links',
      );
      expect(broken).toHaveLength(1);
    });

    it('no-broken-links: an in-root file literally named "..foo.md" is not a false positive', () => {
      // The containment check must distinguish an escaping `../` segment from
      // an ordinary filename that merely starts with two dots.
      const adr = join(dir, '0001-a.md');
      writeFileSync(adr, '# ADR\n\n[x](./..foo.md)\n');
      writeFileSync(join(dir, '..foo.md'), '# weird but valid name\n');

      const result = lintFiles({
        rules: [noBrokenLinks],
        ruleSeverity: { 'madr/no-broken-links': 'error' },
        files: [adr],
        cwd: dir,
      });
      expect(
        result.diagnostics.filter((d) => d.ruleName === 'madr/no-broken-links'),
      ).toEqual([]);
    });

    it('no-broken-links: a link to a directory is broken (must be a file)', () => {
      const adr = join(dir, '0001-a.md');
      writeFileSync(adr, '# ADR\n\n[assets](./assets)\n');
      mkdirSync(join(dir, 'assets'));

      const result = lintFiles({
        rules: [noBrokenLinks],
        ruleSeverity: { 'madr/no-broken-links': 'error' },
        files: [adr],
        cwd: dir,
      });
      const broken = result.diagnostics.filter(
        (d) => d.ruleName === 'madr/no-broken-links',
      );
      expect(broken).toHaveLength(1);
      expect(broken[0]?.data?.resolvedPath).toBe('assets');
    });

    it('reports project rule diagnostics with relative POSIX paths', () => {
      const file1 = join(dir, '0001-a.md');
      const file2 = join(dir, '0001-b.md');
      writeFileSync(file1, '# x');
      writeFileSync(file2, '# x');

      const result = lintFiles({
        rules: [noDuplicateNumbering],
        ruleSeverity: { 'madr/no-duplicate-numbering': 'error' },
        files: [file1, file2],
        cwd: dir,
      });
      // Paths must be POSIX (forward-slash) regardless of OS sep
      for (const d of result.diagnostics) {
        expect(d.path).not.toContain('\\');
        expect(d.path).toBe(d.path.split('\\').join('/'));
      }
    });
  });

  // Self-contained diagnostics (#67): cached diagnostics carry the new
  // suggestion/docsUrl fields. A manifest written BEFORE the shape change
  // (same pkgVersion — think repo devs or same-version CI caches, whom
  // pkgVersion invalidation does not save) must be treated as cold, or the
  // stale entries would be served verbatim and json output would silently
  // drop the keys.
  describe('cache schema versioning (stale Diagnostic shape)', () => {
    // Trips madr/required-sections three times.
    const BARE = '# Just a heading\n\nNo sections here.\n';

    function cacheConfig(): CacheConfig {
      return {
        dir: join(dir, '.madr-lint', 'cache'),
        configHash: 'h',
        pkgVersion: '0.0.0-test',
      };
    }

    function lintBare(cache: CacheConfig) {
      const file = join(dir, '0001-a.md');
      writeFileSync(file, BARE);
      return lintFiles({
        rules: [requiredSections],
        ruleSeverity: { 'madr/required-sections': 'error' },
        files: [file],
        cwd: dir,
        cache,
      });
    }

    it('treats a pre-schema manifest as cold — stale-shape diagnostics never leak', () => {
      const cache = cacheConfig();
      // Hand-write an OLD-shape manifest: matching version + configHash +
      // contentHash, but no schemaVersion and cached diagnostics lacking
      // suggestion/docsUrl (the pre-#67 Diagnostic shape).
      const stale = {
        version: cache.pkgVersion,
        configHash: cache.configHash,
        files: {
          '0001-a.md': {
            contentHash: computeContentHash(BARE),
            perFileDiagnostics: [
              {
                ruleName: 'madr/required-sections',
                messageId: 'missingSection',
                severity: 'error',
                path: '0001-a.md',
                data: { section: 'Context and Problem Statement' },
              },
            ],
          },
        },
      };
      mkdirSync(cache.dir, { recursive: true });
      writeFileSync(manifestPath(cache.dir), JSON.stringify(stale), 'utf8');

      const result = lintBare(cache);
      // The old manifest must be discarded, not served.
      expect(result.filesFromCache).toBe(0);
      expect(result.diagnostics).toHaveLength(3);
      for (const d of result.diagnostics) {
        expect(d.suggestion).toContain('heading');
        expect(d.docsUrl).toContain('required-sections');
      }
    });

    it('warm cache round-trips suggestion and docsUrl intact', () => {
      const cache = cacheConfig();
      const cold = lintBare(cache);
      expect(cold.filesFromCache).toBe(0);

      const warm = lintBare(cache);
      expect(warm.filesFromCache).toBe(1);
      expect(warm.diagnostics).toHaveLength(3);
      for (const d of warm.diagnostics) {
        expect(d.suggestion).toContain('heading');
        expect(d.docsUrl).toBe(
          'https://knktkc.github.io/madr-lint/rules/required-sections/',
        );
      }
    });
  });
});
