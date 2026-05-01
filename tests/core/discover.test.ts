import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findAdrFiles } from '../../src/core/discover.js';

describe('core/discover', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-discover-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds .md files at the top level', () => {
    writeFileSync(join(dir, '0001-x.md'), '# x');
    writeFileSync(join(dir, '0002-y.md'), '# y');
    expect(findAdrFiles(dir)).toHaveLength(2);
  });

  it('finds .md files recursively', () => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, '0001-x.md'), '# x');
    writeFileSync(join(dir, 'sub', '0002-y.md'), '# y');
    expect(findAdrFiles(dir)).toHaveLength(2);
  });

  it('ignores non-.md files', () => {
    writeFileSync(join(dir, '0001-x.md'), '# x');
    writeFileSync(join(dir, 'README.txt'), 'x');
    writeFileSync(join(dir, '.gitignore'), 'x');
    expect(findAdrFiles(dir)).toHaveLength(1);
  });

  it('returns sorted absolute paths', () => {
    writeFileSync(join(dir, '0002-b.md'), '# b');
    writeFileSync(join(dir, '0001-a.md'), '# a');
    const files = findAdrFiles(dir);
    expect(files[0]).toMatch(/0001-a\.md$/);
    expect(files[1]).toMatch(/0002-b\.md$/);
  });

  it('returns empty array for empty directory', () => {
    expect(findAdrFiles(dir)).toEqual([]);
  });

  it('returns empty array for non-existent directory', () => {
    expect(findAdrFiles(join(dir, 'does-not-exist'))).toEqual([]);
  });
});
