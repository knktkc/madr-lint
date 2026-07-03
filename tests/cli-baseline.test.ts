import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Same node + tsx ESM hook invocation as tests/cli.test.ts — avoids the
// .cmd wrapper that execFileSync cannot run on Windows.
const NODE = process.execPath;
const TSX_ESM = pathToFileURL(
  join(import.meta.dirname, '../node_modules/tsx/dist/esm/index.mjs'),
).href;
const CLI = join(import.meta.dirname, '../src/cli.ts');

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(cwd: string, args: string[]): CliResult {
  try {
    const stdout = execFileSync(NODE, [`--import=${TSX_ESM}`, CLI, ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// A bare heading trips madr/required-sections three times.
const BARE = '# Just a heading\n\nNo required sections.\n';

describe('cli — baseline (end-to-end)', () => {
  let dir: string;
  const baselineFile = () => join(dir, '.madr-lint', 'baseline.json');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-clibase-'));
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({ rules: { 'madr/required-sections': 'error' } }),
    );
    writeFileSync(join(dir, '0001-a.md'), BARE);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--update-baseline writes deterministic sorted JSON and exits 0', () => {
    const r = runCli(dir, ['0001-a.md', '--no-cache', '--update-baseline']);
    expect(r.status).toBe(0);
    expect(existsSync(baselineFile())).toBe(true);

    const text = readFileSync(baselineFile(), 'utf8');
    // 2-space indent + trailing newline (clean git diffs).
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  ');
    const parsed = JSON.parse(text) as {
      entries: Record<string, Record<string, Record<string, number>>>;
    };
    expect(parsed.entries['0001-a.md']?.['madr/required-sections']?.['missingSection']).toBe(3);
    // Summary line mentions the file and the path.
    expect(r.stdout).toContain('.madr-lint/baseline.json');
  }, 30_000);

  it('default run subtracts an existing baseline (exit 0, hidden summary printed)', () => {
    runCli(dir, ['0001-a.md', '--no-cache', '--update-baseline']);
    const r = runCli(dir, ['0001-a.md', '--no-cache']);
    expect(r.status).toBe(0); // all three errors are baselined
    expect(r.stdout).toContain('hidden by baseline');
  }, 30_000);

  it('--no-baseline shows everything and exits 1 even when a baseline exists', () => {
    runCli(dir, ['0001-a.md', '--no-cache', '--update-baseline']);
    const r = runCli(dir, ['0001-a.md', '--no-cache', '--no-baseline']);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('hidden by baseline');
  }, 30_000);

  it('a NEW violation added after baselining fails the run (exit 1)', () => {
    runCli(dir, ['0001-a.md', '--no-cache', '--update-baseline']);
    // Second file was never baselined — its errors must surface.
    writeFileSync(join(dir, '0002-b.md'), BARE);
    const r = runCli(dir, ['0001-a.md', '0002-b.md', '--no-cache']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('0002-b.md');
  }, 30_000);

  it('absent baseline file is a no-op (errors surface, exit 1)', () => {
    const r = runCli(dir, ['0001-a.md', '--no-cache']);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('hidden by baseline');
  }, 30_000);
});
