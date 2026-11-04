import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBaseline, writeBaseline } from '../../src/core/baseline.js';
import { loadManifest, saveManifest, CACHE_SCHEMA_VERSION, type CacheManifest } from '../../src/core/cache.js';
import { findAdrFiles, findAdrFilesWithinRoot, PathOutsideRootError } from '../../src/core/discover.js';
import { detectAdrDir, detectConfigFormat, detectMadrVersion } from '../../src/core/init.js';
import { lintFiles } from '../../src/core/lint.js';
import { SymlinkedPathError } from '../../src/core/safe-fs.js';
import * as builtinRules from '../../src/rules/index.js';

function canSymlink(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'madr-lint-can-link-'));
  try {
    symlinkSync('.', join(dir, 'probe'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const manifest: CacheManifest = {
  schemaVersion: CACHE_SCHEMA_VERSION,
  version: '0.0.0',
  configHash: 'hash',
  files: {},
};

describe.skipIf(!canSymlink())('symlink handling', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'madr-lint-symlink-')));
    root = join(base, 'root');
    outside = join(base, 'outside');
    mkdirSync(join(root, 'docs/adr'), { recursive: true });
    mkdirSync(outside);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  describe('findAdrFiles', () => {
    it('does not descend into a symlinked directory', () => {
      writeFileSync(join(root, 'docs/adr/0001-a.md'), '# a');
      writeFileSync(join(outside, '0002-b.md'), '# b');
      symlinkSync(outside, join(root, 'docs/adr/linked'));
      expect(findAdrFiles(join(root, 'docs/adr'))).toEqual([
        join(root, 'docs/adr/0001-a.md'),
      ]);
    });

    it('terminates with two self-referential links', () => {
      writeFileSync(join(root, 'docs/adr/0001-a.md'), '# a');
      symlinkSync('.', join(root, 'docs/adr/s1'));
      symlinkSync('.', join(root, 'docs/adr/s2'));
      expect(findAdrFiles(join(root, 'docs/adr'))).toEqual([
        join(root, 'docs/adr/0001-a.md'),
      ]);
    });

    it('still walks real nested directories', () => {
      mkdirSync(join(root, 'docs/adr/nested'));
      writeFileSync(join(root, 'docs/adr/nested/0001-a.md'), '# a');
      expect(findAdrFiles(join(root, 'docs/adr'))).toEqual([
        join(root, 'docs/adr/nested/0001-a.md'),
      ]);
    });

    it('skips an explicit .md link whose target is not .md', () => {
      writeFileSync(join(root, 'notes.txt'), 'x');
      symlinkSync(join(root, 'notes.txt'), join(root, 'docs/adr/0001-a.md'));
      expect(findAdrFiles(join(root, 'docs/adr/0001-a.md'))).toEqual([]);
    });
  });

  describe('findAdrFilesWithinRoot', () => {
    it('rejects an explicit .md link that resolves outside the root', () => {
      writeFileSync(join(outside, 'x.md'), '# x');
      symlinkSync(join(outside, 'x.md'), join(root, 'docs/adr/0001-a.md'));
      expect(() => findAdrFilesWithinRoot('docs/adr/0001-a.md', root)).toThrow(
        PathOutsideRootError,
      );
    });

    it('rejects a linked start directory that resolves outside the root', () => {
      symlinkSync(outside, join(root, 'linked'));
      expect(() => findAdrFilesWithinRoot('linked', root)).toThrow(PathOutsideRootError);
    });

    it('rejects a path through a link in an absolute argument', () => {
      symlinkSync(outside, join(root, 'linked'));
      writeFileSync(join(outside, 'x.md'), '# x');
      expect(() => findAdrFilesWithinRoot(join(root, 'linked/x.md'), root)).toThrow(
        PathOutsideRootError,
      );
    });

    it('accepts a start directory linked inside the root', () => {
      writeFileSync(join(root, 'docs/adr/0001-a.md'), '# a');
      symlinkSync(join(root, 'docs/adr'), join(root, 'adr-link'));
      expect(findAdrFilesWithinRoot('adr-link', root)).toHaveLength(1);
    });

    it('accepts a path outside the root that contains no link', () => {
      writeFileSync(join(outside, '0001-a.md'), '# a');
      expect(findAdrFilesWithinRoot('../outside', root)).toHaveLength(1);
    });

    it('accepts a root that is itself reached through a link', () => {
      writeFileSync(join(root, 'docs/adr/0001-a.md'), '# a');
      symlinkSync(root, join(base, 'root-link'));
      expect(findAdrFilesWithinRoot('docs/adr', join(base, 'root-link'))).toHaveLength(1);
    });

    it.for(['missing.md', 'dangling.md'])('returns nothing for %s', (name) => {
      symlinkSync(join(outside, 'gone.md'), join(root, 'dangling.md'));
      expect(findAdrFilesWithinRoot(name, root)).toEqual([]);
    });
  });

  describe('saveManifest', () => {
    it("leaves a symlinked manifest.json's target untouched", () => {
      const cache = join(root, '.madr-lint/cache');
      mkdirSync(cache, { recursive: true });
      writeFileSync(join(outside, 'target.txt'), 'ORIGINAL');
      symlinkSync(join(outside, 'target.txt'), join(cache, 'manifest.json'));

      saveManifest(join(cache, 'manifest.json'), manifest, root);

      expect(readFileSync(join(outside, 'target.txt'), 'utf8')).toBe('ORIGINAL');
      expect(lstatSync(join(cache, 'manifest.json')).isSymbolicLink()).toBe(false);
      expect(JSON.parse(readFileSync(join(cache, 'manifest.json'), 'utf8'))).toEqual(manifest);
    });

    it('does not create a file through a dangling link', () => {
      const cache = join(root, '.madr-lint/cache');
      mkdirSync(cache, { recursive: true });
      symlinkSync(join(outside, 'created.txt'), join(cache, 'manifest.json'));

      saveManifest(join(cache, 'manifest.json'), manifest, root);

      expect(existsSync(join(outside, 'created.txt'))).toBe(false);
    });

    it.for(['.madr-lint', '.madr-lint/cache'])('refuses a symlinked parent at %s', (linked) => {
      mkdirSync(dirname(join(root, linked)), { recursive: true });
      symlinkSync(outside, join(root, linked));

      expect(() =>
        saveManifest(join(root, '.madr-lint/cache/manifest.json'), manifest, root),
      ).toThrow(SymlinkedPathError);
      expect(existsSync(join(outside, 'manifest.json'))).toBe(false);
      expect(existsSync(join(outside, 'cache'))).toBe(false);
    });

    it('allows a link above the root', () => {
      symlinkSync(root, join(base, 'root-link'));
      const path = join(base, 'root-link/.madr-lint/cache/manifest.json');
      saveManifest(path, manifest, join(base, 'root-link'));
      expect(existsSync(join(root, '.madr-lint/cache/manifest.json'))).toBe(true);
    });

    it('leaves no temporary file when the destination is a directory', () => {
      const cache = join(root, '.madr-lint/cache');
      mkdirSync(join(cache, 'manifest.json'), { recursive: true });
      expect(() => saveManifest(join(cache, 'manifest.json'), manifest, root)).toThrow();
      expect(spawnSync('ls', ['-A', cache], { encoding: 'utf8' }).stdout.trim()).toBe('manifest.json');
    });
  });

  describe('loadManifest and loadBaseline', () => {
    it('treat a link as absent', () => {
      writeFileSync(join(outside, 'm.json'), JSON.stringify(manifest));
      symlinkSync(join(outside, 'm.json'), join(root, 'link.json'));
      expect(loadManifest(join(root, 'link.json'))).toBeNull();
      writeFileSync(join(outside, 'b.json'), JSON.stringify({ version: 1, entries: {} }));
      symlinkSync(join(outside, 'b.json'), join(root, 'b-link.json'));
      expect(loadBaseline(join(root, 'b-link.json'))).toBeNull();
    });

    it('do not hang on a link to a FIFO', () => {
      const made = spawnSync('mkfifo', [join(outside, 'fifo')]);
      if (made.status !== 0) return;
      symlinkSync(join(outside, 'fifo'), join(root, 'link.json'));
      expect(loadManifest(join(root, 'link.json'))).toBeNull();
      expect(loadBaseline(join(root, 'link.json'))).toBeNull();
    });
  });

  describe('reads through a linked parent', () => {
    it('loadManifest and loadBaseline treat the file as absent', () => {
      writeFileSync(join(outside, 'manifest.json'), JSON.stringify(manifest));
      writeFileSync(join(outside, 'baseline.json'), JSON.stringify({ version: 1, entries: {} }));
      symlinkSync(outside, join(root, '.madr-lint'));
      expect(loadManifest(join(root, '.madr-lint/manifest.json'), root)).toBeNull();
      expect(loadBaseline(join(root, '.madr-lint/baseline.json'), root)).toBeNull();
    });
  });

  describe('init detection', () => {
    const adr = '* Status: accepted\n\n# X\n';

    it('does not detect or sample a linked ADR directory', () => {
      rmSync(join(root, 'docs/adr'), { recursive: true });
      writeFileSync(join(outside, '0001-x.md'), adr);
      symlinkSync(outside, join(root, 'docs/adr'));
      expect(detectAdrDir(root)).toEqual({ adrDir: 'docs/adr', source: 'fallback' });
      expect(detectMadrVersion(root, 'docs/adr')).toBe('auto');
    });

    it('does not sample through a linked parent', () => {
      rmSync(join(root, 'docs'), { recursive: true });
      mkdirSync(join(outside, 'adr'));
      writeFileSync(join(outside, 'adr/0001-x.md'), adr);
      symlinkSync(outside, join(root, 'docs'));
      expect(detectMadrVersion(root, 'docs/adr')).toBe('auto');
    });

    it('does not read a linked package.json', () => {
      writeFileSync(join(outside, 'p.json'), JSON.stringify({ devDependencies: { typescript: '1' } }));
      symlinkSync(join(outside, 'p.json'), join(root, 'package.json'));
      expect(detectConfigFormat(root)).toBe('json');
    });
  });

  describe('writeBaseline', () => {
    it('leaves a symlinked target untouched', () => {
      mkdirSync(join(root, '.madr-lint'));
      writeFileSync(join(outside, 'target.txt'), 'ORIGINAL');
      symlinkSync(join(outside, 'target.txt'), join(root, '.madr-lint/baseline.json'));

      writeBaseline(join(root, '.madr-lint/baseline.json'), { version: 1, entries: {} }, root);

      expect(readFileSync(join(outside, 'target.txt'), 'utf8')).toBe('ORIGINAL');
      expect(lstatSync(join(root, '.madr-lint/baseline.json')).isSymbolicLink()).toBe(false);
    });

    it('refuses a symlinked .madr-lint', () => {
      symlinkSync(outside, join(root, '.madr-lint'));
      expect(() =>
        writeBaseline(join(root, '.madr-lint/baseline.json'), { version: 1, entries: {} }, root),
      ).toThrow(SymlinkedPathError);
      expect(existsSync(join(outside, 'baseline.json'))).toBe(false);
    });

    it.skipIf(process.platform === 'win32')('keeps the mode of an existing file', () => {
      const path = join(root, 'baseline.json');
      writeFileSync(path, '{}', { mode: 0o640 });
      writeBaseline(path, { version: 1, entries: {} }, root);
      expect(statSync(path).mode & 0o777).toBe(0o640);
    });
  });

  describe('lintFiles', () => {
    it('finishes the lint when the cache cannot be saved through a linked .madr-lint', () => {
      const file = join(root, 'docs/adr/0001-a.md');
      writeFileSync(file, '# a\n');
      symlinkSync(outside, join(root, '.madr-lint'));

      const result = lintFiles({
        rules: Object.values(builtinRules),
        ruleSeverity: { 'madr/filename-format': 'error' },
        files: [file],
        cwd: root,
        cache: { dir: join(root, '.madr-lint/cache'), configHash: 'h', pkgVersion: '0' },
        baseline: null,
      });

      expect(result.diagnostics).toEqual([]);
      expect(existsSync(join(outside, 'cache'))).toBe(false);
    });
  });
});
