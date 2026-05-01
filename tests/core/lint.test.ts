import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lintFiles } from '../../src/core/lint.js';
import filenameFormat from '../../src/rules/filename-format/index.js';
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
});
