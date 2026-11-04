import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TSX_ESM = pathToFileURL(
  join(import.meta.dirname, '../node_modules/tsx/dist/esm/index.mjs'),
).href;
const CLI = join(import.meta.dirname, '../src/cli.ts');

function runCli(cwd: string, args: string[]) {
  const r = spawnSync(process.execPath, [`--import=${TSX_ESM}`, CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

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

const MANIFEST = '.madr-lint/cache/manifest.json';
const ADR = '---\nstatus: accepted\ndate: 2026-01-01\n---\n\n# A\n';

describe('CLI cache settings', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-cli-cache-'));
    mkdirSync(join(dir, 'docs/adr'), { recursive: true });
    writeFileSync(join(dir, 'docs/adr/0001-a.md'), ADR);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes the cache by default', () => {
    runCli(dir, ['docs/adr']);
    expect(existsSync(join(dir, MANIFEST))).toBe(true);
  });

  it('honours cache: false from the config', () => {
    writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify({ extends: ['madr-lint:recommended'], cache: false }));
    runCli(dir, ['docs/adr']);
    expect(existsSync(join(dir, MANIFEST))).toBe(false);
  });

  it('lets --cache override cache: false', () => {
    writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify({ extends: ['madr-lint:recommended'], cache: false }));
    runCli(dir, ['docs/adr', '--cache']);
    expect(existsSync(join(dir, MANIFEST))).toBe(true);
  });

  it.for([['--no-cache'], ['--no-cache', '--no-cache']])('disables the cache with %j', (flags) => {
    runCli(dir, ['docs/adr', ...flags]);
    expect(existsSync(join(dir, MANIFEST))).toBe(false);
  });

  it('ignores a config cacheLocation outside the working directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'madr-lint-cli-outside-'));
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({ extends: ['madr-lint:recommended'], cacheLocation: join(outside, 'c') }),
    );
    const r = runCli(dir, ['docs/adr']);
    expect(existsSync(join(outside, 'c'))).toBe(false);
    expect(r.stderr).toMatch(/cacheLocation/);
    rmSync(outside, { recursive: true, force: true });
  });

  it('keeps --cache-dir outside the working directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'madr-lint-cli-outside-'));
    runCli(dir, ['docs/adr', '--cache-dir', join(outside, 'c')]);
    expect(existsSync(join(outside, 'c/manifest.json'))).toBe(true);
    rmSync(outside, { recursive: true, force: true });
  });
});

describe('CLI invalid frontmatter', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-cli-yaml-'));
    mkdirSync(join(dir, 'docs/adr'), { recursive: true });
    writeFileSync(join(dir, 'docs/adr/0001-bad.md'), '---\nkey: CANARY_ABOVE\nbad: [x\nother: CANARY_BELOW\n---\n\n# Bad\n');
    writeFileSync(join(dir, 'docs/adr/0002-good.md'), '---\nstatus: bogus\n---\n\n# Good\n');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.for(['text', 'json', 'github', 'sarif'])('names the file without printing its content in %s', (format) => {
    const r = runCli(dir, ['docs/adr', '--no-cache', '--format', format]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toMatch(/CANARY_/);
    expect(r.stdout).toMatch(/0001-bad\.md/);
    expect(r.stdout).toMatch(/Invalid frontmatter/);
    expect(r.stdout).toMatch(/madr\/status-enum|bogus/);
  });

  it('does the same with --fix-dry-run', () => {
    const r = runCli(dir, ['docs/adr', '--fix-dry-run']);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toMatch(/CANARY_/);
    expect(r.stdout).toMatch(/Invalid frontmatter/);
  });
});

describe('CLI init with scalar frontmatter', () => {
  it('finishes without printing the content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'madr-lint-cli-scalar-'));
    mkdirSync(join(dir, 'docs/adr'), { recursive: true });
    writeFileSync(join(dir, 'docs/adr/0001-a.md'), '---\nCANARY\n---\n\n# A\n');
    const r = runCli(dir, ['init']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(/CANARY/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe.skipIf(!canSymlink())('CLI symlink handling', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'madr-lint-cli-link-')));
    root = join(base, 'root');
    outside = join(base, 'outside');
    mkdirSync(join(root, 'docs/adr'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(root, 'docs/adr/0001-a.md'), ADR);
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('finishes with two self-referential links', () => {
    symlinkSync('.', join(root, 'docs/adr/s1'));
    symlinkSync('.', join(root, 'docs/adr/s2'));
    const r = runCli(root, ['docs/adr', '--no-cache']);
    expect(r.status).not.toBeNull();
    expect(r.stdout).not.toMatch(/docs\/adr\/s1/);
  });

  it('exits 2 for a linked start directory outside the working directory', () => {
    symlinkSync(outside, join(root, 'linked'));
    const r = runCli(root, ['linked', '--no-cache']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/outside the working directory/);
  });

  it('--fix leaves a file behind a rejected link untouched', () => {
    const external = '* Status: depricated\n\n# X\n';
    writeFileSync(join(outside, '0002-x.md'), external);
    symlinkSync(join(outside, '0002-x.md'), join(root, 'docs/adr/0002-x.md'));
    const r = runCli(root, ['docs/adr/0002-x.md', '--fix']);
    expect(r.status).toBe(2);
    expect(readFileSync(join(outside, '0002-x.md'), 'utf8')).toBe(external);
  });

  it('--fix does not rewrite files in a linked directory during a walk', () => {
    const external = '* Status: depricated\n\n# X\n';
    writeFileSync(join(outside, '0002-x.md'), external);
    symlinkSync(outside, join(root, 'docs/adr/linked'));
    runCli(root, ['docs/adr', '--fix']);
    expect(readFileSync(join(outside, '0002-x.md'), 'utf8')).toBe(external);
  });

  it('does not report values from a linked directory', () => {
    writeFileSync(join(outside, '0002-x.md'), '---\nstatus: CANARY_STATUS\n---\n\n# X\n');
    symlinkSync(outside, join(root, 'docs/adr/linked'));
    const r = runCli(root, ['docs/adr', '--no-cache', '--format', 'github']);
    expect(r.stdout).not.toMatch(/CANARY_STATUS/);
  });

  it('a normal run does not write through a linked manifest', () => {
    mkdirSync(join(root, '.madr-lint/cache'), { recursive: true });
    writeFileSync(join(outside, 'target.txt'), 'ORIGINAL');
    symlinkSync(join(outside, 'target.txt'), join(root, MANIFEST));
    runCli(root, ['docs/adr']);
    expect(readFileSync(join(outside, 'target.txt'), 'utf8')).toBe('ORIGINAL');
  });

  it('warns and finishes when .madr-lint is a link', () => {
    symlinkSync(outside, join(root, '.madr-lint'));
    const r = runCli(root, ['docs/adr']);
    expect(r.status).not.toBeNull();
    expect(r.stderr).toMatch(/cache was not saved/i);
    expect(existsSync(join(outside, 'cache'))).toBe(false);
  });

  it('--update-baseline exits 2 when .madr-lint is a link', () => {
    symlinkSync(outside, join(root, '.madr-lint'));
    const r = runCli(root, ['docs/adr', '--no-cache', '--update-baseline']);
    expect(r.status).toBe(2);
    expect(existsSync(join(outside, 'baseline.json'))).toBe(false);
  });

  it('init refuses a dangling config link without --force', () => {
    symlinkSync(join(outside, 'created.json'), join(root, '.madrlintrc.json'));
    const r = runCli(root, ['init', '--adr-dir', 'docs/adr']);
    expect(r.status).toBe(2);
    expect(existsSync(join(outside, 'created.json'))).toBe(false);
  });

  it('init --force replaces a config link instead of writing through it', () => {
    writeFileSync(join(outside, 'target.json'), 'ORIGINAL');
    symlinkSync(join(outside, 'target.json'), join(root, '.madrlintrc.json'));
    const r = runCli(root, ['init', '--force', '--adr-dir', 'docs/adr']);
    expect(r.status).toBe(0);
    expect(readFileSync(join(outside, 'target.json'), 'utf8')).toBe('ORIGINAL');
    expect(lstatSync(join(root, '.madrlintrc.json')).isSymbolicLink()).toBe(false);
  });
});
