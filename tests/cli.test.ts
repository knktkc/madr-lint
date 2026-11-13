import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recommended } from '../src/configs/recommended.js';
import { computeConfigHash } from '../src/core/cache.js';

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

// spawnSync (not execFileSync) so stderr is captured on SUCCESS runs too —
// e.g. --fix-dry-run routes the diff to stderr for structured formats while
// exiting 0. Exec's success path only returns stdout.
function runCli(cwd: string, args: string[]): CliResult {
  const r = spawnSync(NODE, [`--import=${TSX_ESM}`, CLI, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
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

// status-enum under caseSensitive:true flags `Accepted` and can mechanically
// lowercase a v2 list-sourced value — the seed for the --fix e2e tests.
function setupFixable(d: string) {
  writeFileSync(
    join(d, '.madrlintrc.json'),
    JSON.stringify({
      rules: { 'madr/status-enum': ['error', { caseSensitive: true }] },
    }),
  );
  writeFileSync(join(d, '0001-a.md'), '# T\n\n- Status: Accepted\n');
}

// The exact reproduction from issue #206: a typo'd preset and a typo'd rule ID.
const ISSUE_206_CONFIG = JSON.stringify({
  extends: ['madr-lint:recomended'],
  rules: { 'madr/status-enmu': 'error' },
});

function expectIssue206Error(r: CliResult): void {
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('"madr-lint:recomended"');
  expect(r.stderr).toContain('Did you mean "madr-lint:recommended"?');
  expect(r.stderr).toContain('"madr/status-enmu"');
  expect(r.stderr).toContain('Did you mean "madr/status-enum"?');
  expect(r.stdout).toBe('');
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

  // ──────────────────────────────────────────────────────────────────────────
  // recommended fallback for an auto-detected config without rules (#205)
  // The fallback fills in the rules only; every other setting in the file
  // must survive it.
  // ──────────────────────────────────────────────────────────────────────────

  describe('recommended fallback (auto-detected config without rules)', () => {
    it('lints adrDir from the file with the recommended rules', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify({ adrDir: 'decisions' }));
      mkdirSync(join(dir, 'decisions'));
      // wrong.md breaks madr/filename-format, which recommended sets to error.
      writeFileSync(join(dir, 'decisions', 'wrong.md'), '# x\n');

      const r = runCli(dir, ['--no-cache']);
      expect(r.stdout).not.toContain('No .md files to lint');
      expect(r.stdout).toContain('madr/filename-format');
      expect(r.status).toBe(1);
    }, 30_000);

    it('keeps ignorePatterns from the file', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ ignorePatterns: ['wrong.md'] }),
      );
      mkdirSync(join(dir, 'docs', 'adr'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'adr', 'wrong.md'), '# x\n');

      const r = runCli(dir, ['--no-cache']);
      expect(r.stdout).toContain('No .md files to lint in docs/adr (1 ignored by config)');
      expect(r.status).toBe(0);
    }, 30_000);

    it('keeps cacheLocation from the file', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ cacheLocation: 'custom-cache' }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');

      runCli(dir, ['wrong.md']);
      expect(existsSync(join(dir, 'custom-cache', 'manifest.json'))).toBe(true);
      expect(existsSync(join(dir, '.madr-lint', 'cache'))).toBe(false);
    }, 30_000);

    it('keeps cache: false from the file', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify({ cache: false }));
      writeFileSync(join(dir, 'wrong.md'), '# x\n');

      const r = runCli(dir, ['wrong.md']);
      expect(r.status).toBe(1); // still linted with recommended
      expect(existsSync(join(dir, '.madr-lint', 'cache'))).toBe(false);
    }, 30_000);

    it('keeps madrVersion from the file (observable through the cache configHash)', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ madrVersion: 'v3' }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');

      runCli(dir, ['wrong.md']);
      const manifest = JSON.parse(
        readFileSync(join(dir, '.madr-lint', 'cache', 'manifest.json'), 'utf8'),
      ) as { configHash: string };
      expect(manifest.configHash).toBe(
        computeConfigHash({
          rules: { ...recommended },
          ignorePatterns: [],
          madrVersion: 'v3',
        }),
      );
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // baseline × --quiet / --max-warnings interplay
  // lintFiles subtracts the baseline BEFORE returning diagnostics, so
  // baselined warnings never count toward --max-warnings, and
  // summary.baselineHidden counts ONLY baseline-absorbed diagnostics —
  // quiet-filtered warnings are not "hidden by baseline".
  // ──────────────────────────────────────────────────────────────────────────

  describe('baseline × --quiet / --max-warnings', () => {
    // Baseline wrong.md's filename-format warning via --update-baseline, so
    // subsequent runs see it as inherited debt.
    function setupBaselinedWarn() {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'warn' } }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const u = runCli(dir, ['wrong.md', '--no-cache', '--update-baseline']);
      expect(u.status).toBe(0);
    }

    it('baselined warnings do NOT count toward --max-warnings', () => {
      setupBaselinedWarn();
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--max-warnings', '0']);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toMatch(/exceeds --max-warnings/);
    }, 30_000);

    it('threshold counts only post-baseline warnings (1 fresh of 2 total)', () => {
      setupBaselinedWarn();
      writeFileSync(join(dir, 'bad.md'), '# y\n'); // fresh, unbaselined warning
      const r = runCli(dir, ['wrong.md', 'bad.md', '--no-cache', '--max-warnings', '0']);
      expect(r.status).toBe(1);
      // "1", not "2": the baselined warning was subtracted before the count
      expect(r.stderr).toMatch(/1 warning\(s\) found, exceeds --max-warnings 0/);
    }, 30_000);

    it('--quiet × baseline in one run: json baselineHidden counts only baseline-absorbed', () => {
      setupBaselinedWarn();
      writeFileSync(join(dir, 'bad.md'), '# y\n');
      const r = runCli(dir, [
        'wrong.md', 'bad.md', '--no-cache', '--quiet', '--format', 'json',
      ]);
      expect(r.status).toBe(0); // warnings never fail a run without --max-warnings
      const payload = JSON.parse(r.stdout) as {
        summary: { warnings: number; baselineHidden: number };
      };
      expect(payload.summary.baselineHidden).toBe(1); // NOT 2 — quiet-filtered ≠ baselined
      expect(payload.summary.warnings).toBe(0); // quiet filtered the fresh warning
    }, 30_000);

    it('text baseline footer still shown under --quiet', () => {
      setupBaselinedWarn();
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/hidden by baseline/);
    }, 30_000);

    it('baseline hides all and the run passes: All clear AND footer coexist', () => {
      setupBaselinedWarn();
      const r = runCli(dir, ['wrong.md', '--no-cache']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/all clear/i);
      expect(r.stdout).toMatch(/hidden by baseline/);
    }, 30_000);

    it('threshold fails under --quiet: no All clear banner, footer still printed', () => {
      setupBaselinedWarn();
      writeFileSync(join(dir, 'bad.md'), '# y\n');
      const r = runCli(dir, [
        'wrong.md', 'bad.md', '--no-cache', '--quiet', '--max-warnings', '0',
      ]);
      expect(r.status).toBe(1);
      expect(r.stdout).not.toMatch(/all clear/i);
      expect(r.stdout).toMatch(/hidden by baseline/);
      expect(r.stderr).toMatch(/exceeds --max-warnings 0/);
    }, 30_000);

    it('--no-baseline resurfaces absorbed warnings into the threshold count', () => {
      setupBaselinedWarn(); // wrong.md's warning is in the baseline file
      const r = runCli(dir, [
        'wrong.md', '--no-cache', '--no-baseline', '--quiet', '--max-warnings', '0',
      ]);
      // Baseline ignored → the absorbed warning reappears and trips the limit
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/1 warning\(s\) found, exceeds --max-warnings 0/);
      expect(r.stdout).not.toMatch(/all clear/i);
    }, 30_000);

    it('--update-baseline --quiet writes the baseline and exits 0', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'warn' } }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const r = runCli(dir, ['wrong.md', '--no-cache', '--quiet', '--update-baseline']);
      expect(r.status).toBe(0);
      expect(existsSync(join(dir, '.madr-lint/baseline.json'))).toBe(true);
    }, 30_000);

    it('--update-baseline --max-warnings 0 exits 0 despite warnings (update mode wins)', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'warn' } }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const r = runCli(dir, [
        'wrong.md', '--no-cache', '--max-warnings', '0', '--update-baseline',
      ]);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toMatch(/exceeds --max-warnings/);
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // --fix / --fix-dry-run (autofix framework, #28)
  // ──────────────────────────────────────────────────────────────────────────

  describe('--fix', () => {
    it('rewrites the file in place and exits 0 (remaining clean)', () => {
      setupFixable(dir);
      const r = runCli(dir, ['0001-a.md', '--fix', '--no-cache']);
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, '0001-a.md'), 'utf8')).toBe(
        '# T\n\n- Status: accepted\n',
      );
    }, 30_000);

    it('--fix-dry-run prints a diff, writes nothing, and exits as if applied', () => {
      setupFixable(dir);
      const r = runCli(dir, ['0001-a.md', '--fix-dry-run', '--no-cache']);
      expect(r.status).toBe(0);
      // File is untouched on disk.
      expect(readFileSync(join(dir, '0001-a.md'), 'utf8')).toBe(
        '# T\n\n- Status: Accepted\n',
      );
      // A unified diff is printed.
      expect(r.stdout).toContain('--- a/0001-a.md');
      expect(r.stdout).toContain('+- Status: accepted');
    }, 30_000);

    it('--update-baseline --fix is a usage error (exit 2)', () => {
      setupFixable(dir);
      const r = runCli(dir, ['0001-a.md', '--fix', '--update-baseline', '--no-cache']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--fix/);
    }, 30_000);

    it('fix → warm run: a stale cached diagnostic never leaks after --fix', () => {
      setupFixable(dir);
      // 1) Cold run (cache ON): records the invalid file's diagnostics.
      const r1 = runCli(dir, ['0001-a.md']);
      expect(r1.status).toBe(1);
      // 2) --fix rewrites the file (new content hash).
      const r2 = runCli(dir, ['0001-a.md', '--fix']);
      expect(r2.status).toBe(0);
      expect(readFileSync(join(dir, '0001-a.md'), 'utf8')).toContain('accepted');
      // 3) Warm run: the old-hash cache entry must not be served for new content.
      const r3 = runCli(dir, ['0001-a.md']);
      expect(r3.status).toBe(0);
    }, 30_000);

    // Machine-readable stdout must stay parseable under --fix-dry-run: the raw
    // diff is embedded in the json payload (top-level `diffs`) and routed to
    // stderr for the other structured formats — never mixed into their stdout.
    it('--fix-dry-run --format json keeps stdout pure JSON and embeds the diff', () => {
      setupFixable(dir);
      const r = runCli(dir, ['0001-a.md', '--fix-dry-run', '--no-cache', '--format', 'json']);
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout) as {
        summary: { fixed: number };
        diffs: Array<{ path: string; diff: string }>;
      };
      expect(parsed.summary.fixed).toBe(1);
      expect(parsed.diffs).toHaveLength(1);
      expect(parsed.diffs[0]?.path).toBe('0001-a.md');
      expect(parsed.diffs[0]?.diff).toContain('+- Status: accepted');
      // File is untouched on disk.
      expect(readFileSync(join(dir, '0001-a.md'), 'utf8')).toBe(
        '# T\n\n- Status: Accepted\n',
      );
    }, 30_000);

    it('--fix-dry-run --format sarif keeps stdout parseable; the diff goes to stderr', () => {
      setupFixable(dir);
      const r = runCli(dir, ['0001-a.md', '--fix-dry-run', '--no-cache', '--format', 'sarif']);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
      expect(r.stdout).not.toContain('--- a/0001-a.md');
      expect(r.stderr).toContain('+- Status: accepted');
    }, 30_000);
  });

  describe('madrVersion from the config (#207)', () => {
    // A v2 body-list ADR whose status is a fixable typo.
    const V2 = '# A\n\n- Status: depricated\n- Date: 2026-11-11\n';

    function setup(madrVersion: string): string {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ madrVersion, rules: { 'madr/status-enum': 'error' } }),
      );
      const file = join(dir, '0001-a.md');
      writeFileSync(file, V2);
      return file;
    }

    function messageIds(r: CliResult): string[] {
      const out = JSON.parse(r.stdout) as { results: Array<{ messageId: string }> };
      return out.results.map((d) => d.messageId);
    }

    it('rejects an unknown madrVersion with exit 2', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify({ madrVersion: 'V3' }));
      writeFileSync(join(dir, '0001-a.md'), V2);
      const r = runCli(dir, ['--no-cache', '0001-a.md']);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('madrVersion');
    }, 30_000);

    it('rejects an unknown madrVersion in an explicit --config with exit 2', () => {
      writeFileSync(join(dir, 'custom.json'), JSON.stringify({ madrVersion: 'v5' }));
      writeFileSync(join(dir, '0001-a.md'), V2);
      const r = runCli(dir, ['--no-cache', '--config', 'custom.json', '0001-a.md']);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('madrVersion');
    }, 30_000);

    it('reads the body list under auto', () => {
      setup('auto');
      const r = runCli(dir, ['--no-cache', '--format', 'json', '0001-a.md']);
      expect(messageIds(r)).toEqual(['invalidStatus']);
    }, 30_000);

    it('reads only frontmatter under v4', () => {
      setup('v4');
      const r = runCli(dir, ['--no-cache', '--format', 'json', '0001-a.md']);
      expect(messageIds(r)).toEqual(['missingStatus']);
    }, 30_000);

    it.for([
      ['auto', V2.replace('depricated', 'deprecated')],
      ['v4', V2],
    ] as const)('applies to --fix under %s', { timeout: 30_000 }, ([madrVersion, expected]) => {
      const file = setup(madrVersion);
      runCli(dir, ['--no-cache', '--fix', '0001-a.md']);
      expect(readFileSync(file, 'utf8')).toBe(expected);
    });
  });

  // Before #206 this config checked nothing and exited 0.
  describe('unknown rule IDs and extends entries (#206)', () => {
    it('exits 2 for the issue reproduction in a discovered config', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), ISSUE_206_CONFIG);
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      expectIssue206Error(runCli(dir, ['--no-cache', 'wrong.md']));
    }, 30_000);

    it('exits 2 for the issue reproduction in an explicit --config', () => {
      writeFileSync(join(dir, 'custom.json'), ISSUE_206_CONFIG);
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      expectIssue206Error(
        runCli(dir, ['--no-cache', '--config', 'custom.json', 'wrong.md']),
      );
    }, 30_000);

    it('exits 2 when a reserved core/ ID is configured', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'core/internal-error': 'off' } }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const r = runCli(dir, ['--no-cache', 'wrong.md']);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('"core/internal-error"');
      expect(r.stderr).toMatch(/reserved/);
    }, 30_000);

    // --config skips the no-rules fallback, so if the bare string were dropped
    // no rule would run and this would exit 0.
    it('still lints with a bare-string extends of the recommended preset', () => {
      writeFileSync(
        join(dir, 'custom.json'),
        JSON.stringify({ extends: 'madr-lint:recommended' }),
      );
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const r = runCli(dir, [
        '--no-cache',
        '--config',
        'custom.json',
        '--format',
        'json',
        'wrong.md',
      ]);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('madr/filename-format');
    }, 30_000);

    it('exits 2, not 1, for a config value that JSON cannot serialize', () => {
      writeFileSync(join(dir, 'madr-lint.config.mjs'), 'export default { extends: [10n] };\n');
      writeFileSync(join(dir, 'wrong.md'), '# x\n');
      const r = runCli(dir, ['--no-cache', 'wrong.md']);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('Unknown preset 10n in extends.');
      expect(r.stderr).not.toContain('TypeError');
    }, 30_000);

    it('exits 0 for extends: null in a discovered config', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify({ extends: null }));
      writeFileSync(join(dir, '0001-a.md'), '# x\n');
      const r = runCli(dir, ['--no-cache', '--config', '.madrlintrc.json', '0001-a.md']);
      expect(r.status).toBe(0);
    }, 30_000);
  });
});
