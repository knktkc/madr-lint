import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lintFiles } from '../../src/core/lint.js';
import filenameFormat from '../../src/rules/filename-format/index.js';
import noDuplicateNumbering from '../../src/rules/no-duplicate-numbering/index.js';
import requiredSections from '../../src/rules/required-sections/index.js';

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
});
