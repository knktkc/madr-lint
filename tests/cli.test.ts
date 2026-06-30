import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Run the real CLI through the local tsx binary (absolute path, so it resolves
// regardless of the temp cwd) — this covers the process.exit / stderr paths
// that the in-process lintFiles tests cannot.
const TSX = join(import.meta.dirname, '../node_modules/.bin/tsx');
const CLI = join(import.meta.dirname, '../src/cli.ts');

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(cwd: string, args: string[]): CliResult {
  try {
    const stdout = execFileSync(TSX, [CLI, ...args], { cwd, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('cli (end-to-end)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-cli-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits 2 with a clear message on an invalid config option', () => {
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({
        rules: { 'madr/filename-format': ['error', { pattern: 123 }] },
      }),
    );
    writeFileSync(join(dir, '0001-a.md'), '# x\n');

    const r = runCli(dir, ['0001-a.md', '--no-cache']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Invalid rule options in config');
  }, 30_000);

  it('applies a valid config pattern option (custom-named file passes, exit 0)', () => {
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({
        rules: {
          'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
        },
      }),
    );
    writeFileSync(join(dir, 'ADR-001.md'), '# x\n');

    const r = runCli(dir, ['ADR-001.md', '--no-cache']);
    expect(r.status).toBe(0);
  }, 30_000);

  it('exits 1 when the configured pattern does not match', () => {
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({
        rules: {
          'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
        },
      }),
    );
    writeFileSync(join(dir, '0001-a.md'), '# x\n');

    const r = runCli(dir, ['0001-a.md', '--no-cache']);
    expect(r.status).toBe(1);
  }, 30_000);
});
