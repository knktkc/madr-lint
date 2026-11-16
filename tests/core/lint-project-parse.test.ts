import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lintAndFix, lintFiles } from '../../src/core/lint.js';
import { buildProjectFile } from '../../src/core/runner.js';
import noDuplicateNumbering from '../../src/rules/no-duplicate-numbering/index.js';
import supersedesBidirectional from '../../src/rules/supersedes-bidirectional/index.js';

// Wrap the real project-file parser so a test can see whether the project pass
// parsed anything. Kept in its own file so the mock touches no other test.
vi.mock('../../src/core/runner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/runner.js')>();
  return { ...actual, buildProjectFile: vi.fn(actual.buildProjectFile) };
});

describe('core/lint — project parse is skipped for version-excluded project rules', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-project-parse-'));
    file = join(dir, '0001-a.md');
    writeFileSync(file, '---\nstatus: accepted\n---\n\n# A\n');
    vi.mocked(buildProjectFile).mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = {
    lintFiles: (opts: Parameters<typeof lintFiles>[0]) => lintFiles(opts),
    lintAndFix: (opts: Parameters<typeof lintAndFix>[0]) => lintAndFix(opts),
  };

  describe.for(['lintFiles', 'lintAndFix'] as const)('%s', (name) => {
    it('parses no file when the fixed version excludes every enabled project rule', () => {
      run[name]({
        rules: [supersedesBidirectional],
        ruleSeverity: { 'madr/supersedes-bidirectional': 'error' },
        files: [file],
        cwd: dir,
        madrVersion: 'v2',
      });
      expect(buildProjectFile).not.toHaveBeenCalled();
    });

    it('parses the files under auto', () => {
      run[name]({
        rules: [supersedesBidirectional],
        ruleSeverity: { 'madr/supersedes-bidirectional': 'error' },
        files: [file],
        cwd: dir,
        madrVersion: 'auto',
      });
      expect(buildProjectFile).toHaveBeenCalled();
    });

    it('parses the files under v2 when another enabled project rule supports v2', () => {
      run[name]({
        rules: [supersedesBidirectional, noDuplicateNumbering],
        ruleSeverity: {
          'madr/supersedes-bidirectional': 'error',
          'madr/no-duplicate-numbering': 'error',
        },
        files: [file],
        cwd: dir,
        madrVersion: 'v2',
      });
      expect(buildProjectFile).toHaveBeenCalled();
    });
  });
});
