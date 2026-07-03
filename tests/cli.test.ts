import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Run the real CLI via node + tsx ESM hook. We avoid node_modules/.bin/tsx
// because on Windows those are .cmd wrapper scripts that execFileSync cannot
// execute directly (no shell). Instead, point node at the tsx ESM loader
// via an absolute file:// URL so resolution never depends on cwd or PATH.
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
    const stdout = execFileSync(
      NODE,
      [`--import=${TSX_ESM}`, CLI, ...args],
      { cwd, encoding: 'utf8' },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// Helper: write a JSON config and a file that violates filename-format at the
// given severity level. The file 'wrong.md' does not match the default
// pattern ^[0-9]{4}-[a-z0-9-]+\.md$, so it always triggers the rule.
function setupWarnFixture(dir: string, severity: 'warn' | 'error' = 'warn') {
  writeFileSync(
    join(dir, '.madrlintrc.json'),
    JSON.stringify({ rules: { 'madr/filename-format': severity } }),
  );
  writeFileSync(join(dir, 'wrong.md'), '# x\n');
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

  // ──────────────────────────────────────────────────────────────────────────
  // --quiet
  // ──────────────────────────────────────────────────────────────────────────

  describe('--quiet', () => {
    it('suppresses warning lines from text output and exits 0 (no errors)', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet']);
      expect(r.status).toBe(0);
      // The 'warn' token must not appear anywhere in stdout
      expect(r.stdout).not.toMatch(/\bwarn\b/i);
    }, 30_000);

    it('still shows errors with --quiet (only warnings are hidden)', () => {
      // Configure filename-format as error → produces 1 error for wrong.md
      setupWarnFixture(dir, 'error');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet']);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/\berror\b/i);
    }, 30_000);

    it('suppresses warnings from JSON output', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--format', 'json']);
      expect(r.status).toBe(0);
      const payload = JSON.parse(r.stdout) as {
        summary: { warnings: number };
        results: { severity: string }[];
      };
      expect(payload.summary.warnings).toBe(0);
      expect(payload.results.filter((x) => x.severity === 'warn')).toHaveLength(0);
    }, 30_000);

    it('suppresses warnings from SARIF output', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--format', 'sarif']);
      expect(r.status).toBe(0);
      const sarif = JSON.parse(r.stdout) as { runs: { results: { level: string }[] }[] };
      const results = sarif.runs[0]?.results ?? [];
      expect(results.filter((x) => x.level === 'warning')).toHaveLength(0);
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // --max-warnings
  // ──────────────────────────────────────────────────────────────────────────

  describe('--max-warnings', () => {
    it('--max-warnings 0 exits 1 when there is at least one warning', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', '0']);
      expect(r.status).toBe(1);
    }, 30_000);

    it('--max-warnings 1 exits 0 when warning count is exactly at the limit', () => {
      setupWarnFixture(dir, 'warn'); // 1 warning
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', '1']);
      expect(r.status).toBe(0);
    }, 30_000);

    it('--max-warnings 0 exits 0 when there are no warnings', () => {
      // Clean file: 0001-a.md passes the default filename-format pattern
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'warn' } }),
      );
      writeFileSync(join(dir, '0001-a.md'), '# x\n');
      const r = runCli(dir, ['0001-a.md', '--no-cache', '--max-warnings', '0']);
      expect(r.status).toBe(0);
    }, 30_000);

    it('exits 2 with usage message when --max-warnings value is non-numeric', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', 'foo']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/max-warnings/i);
    }, 30_000);

    it('exits 2 when --max-warnings value is a float (non-integer)', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', '1.5']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/max-warnings/i);
    }, 30_000);

    it('exits 2 when --max-warnings value is empty (Number("") is 0 — must not become strictest)', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', '']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/max-warnings/i);
    }, 30_000);

    it('exits 2 when --max-warnings value is whitespace-only', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', '  ']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/max-warnings/i);
    }, 30_000);

    it('prints the threshold verdict to stderr when warnings exceed the limit (no --quiet)', () => {
      setupWarnFixture(dir, 'warn'); // 1 warning
      const r = runCli(dir, ['wrong.md', '--no-cache', '--max-warnings', '0']);
      expect(r.status).toBe(1);
      // Warnings stay visible in stdout, and stderr states WHY the run failed
      expect(r.stdout).toMatch(/\bwarn\b/i);
      expect(r.stderr).toMatch(/exceeds --max-warnings 0/);
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // --quiet × --max-warnings interplay
  // Mirror ESLint: --quiet filters OUTPUT, but --max-warnings still checks
  // the ORIGINAL (pre-quiet) warning count. Warnings hidden ≠ warnings ignored.
  // ──────────────────────────────────────────────────────────────────────────

  describe('--quiet × --max-warnings', () => {
    it('--quiet --max-warnings 0: warns not shown but still counted → exit 1', () => {
      setupWarnFixture(dir, 'warn'); // 1 warning produced
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--max-warnings', '0']);
      expect(r.status).toBe(1); // warning count (1) > limit (0)
      // Despite exit 1, no warning text in output (quiet suppressed it)
      expect(r.stdout).not.toMatch(/\bwarn\b/i);
    }, 30_000);

    it('--quiet --max-warnings 1: 1 warning at limit → exit 0, no warn output', () => {
      setupWarnFixture(dir, 'warn'); // 1 warning
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--max-warnings', '1']);
      expect(r.status).toBe(0);
      expect(r.stdout).not.toMatch(/\bwarn\b/i);
    }, 30_000);

    it('over-limit under --quiet: stderr explains the threshold, no "All clear" banner beside exit 1', () => {
      setupWarnFixture(dir, 'warn'); // 1 warning, quiet hides it
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--max-warnings', '0']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/exceeds --max-warnings 0/);
      // A success banner next to a failing exit code would lie
      expect(r.stdout).not.toMatch(/all clear/i);
    }, 30_000);

    it('over-limit with --format json --quiet: stdout stays valid JSON, stderr carries the verdict', () => {
      setupWarnFixture(dir, 'warn');
      const r = runCli(dir, [
        'wrong.md', '--no-cache', '--quiet', '--format', 'json', '--max-warnings', '0',
      ]);
      expect(r.status).toBe(1);
      const payload = JSON.parse(r.stdout) as { summary: { warnings: number } };
      expect(payload.summary.warnings).toBe(0); // quiet-filtered payload
      expect(r.stderr).toMatch(/exceeds --max-warnings 0/);
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // --config
  // ──────────────────────────────────────────────────────────────────────────

  describe('--config', () => {
    it('loads a JSON config from the given path, bypassing discovery', () => {
      // Write a config that allows the file (no rules → no violations)
      const cfgPath = join(dir, 'custom.json');
      writeFileSync(cfgPath, JSON.stringify({ rules: {} }));
      // Also write a stricter discovered config that would fail
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'error' } }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');

      const r = runCli(dir, ['wrong.md', '--no-cache', '--config', cfgPath]);
      // custom.json has no rules → no errors → exit 0
      expect(r.status).toBe(0);
    }, 30_000);

    it('loads a TS config from the given path, bypassing discovery', () => {
      const cfgPath = join(dir, 'custom.config.ts');
      // Plain default-export object — no defineConfig import needed; jiti
      // handles the interopDefault unwrapping in loadConfigFromPath.
      writeFileSync(cfgPath, `export default { rules: {} };\n`);
      // Discovered config that would fail if used
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'error' } }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');

      const r = runCli(dir, ['wrong.md', '--no-cache', '--config', cfgPath]);
      expect(r.status).toBe(0);
    }, 30_000);

    it('exits 2 with a clear message when the config file does not exist', () => {
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--config', '/does/not/exist.json']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/not found|no such file|cannot find/i);
    }, 30_000);

    it('exits 2 when the config file contains invalid JSON', () => {
      const cfgPath = join(dir, 'bad.json');
      writeFileSync(cfgPath, '{ invalid json }');
      writeFileSync(join(dir, 'wrong.md'), '# x\n');

      const r = runCli(dir, ['wrong.md', '--no-cache', '--config', cfgPath]);
      expect(r.status).toBe(2);
    }, 30_000);

    it('exits 2 with an honest message when --config points at a directory', () => {
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      // Passing the fixture dir itself: existsSync passes, jiti would say
      // "Cannot find module" — we want a clear directory-specific message.
      const r = runCli(dir, ['wrong.md', '--no-cache', '--config', dir]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/directory, not a file/i);
    }, 30_000);

    it('works combined with positional paths', () => {
      const cfgPath = join(dir, 'custom.json');
      writeFileSync(cfgPath, JSON.stringify({ rules: {} }));
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      writeFileSync(join(dir, '0001-a.md'), '# y\n');

      const r = runCli(dir, ['wrong.md', '0001-a.md', '--no-cache', '--config', cfgPath]);
      expect(r.status).toBe(0);
    }, 30_000);
  });
});
