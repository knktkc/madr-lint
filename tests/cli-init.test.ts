import { execFileSync, spawnSync } from 'node:child_process';
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

// execFileSync discards stderr on a zero exit, so stderr assertions on
// SUCCESSFUL runs (e.g. --force shadow notes) need spawnSync instead.
function runCliCapture(cwd: string, args: string[]): CliResult {
  const r = spawnSync(NODE, [`--import=${TSX_ESM}`, CLI, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

function writeAdr(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const VALID_V3_ADR = `---
status: accepted
date: 2026-01-01
deciders: alice
---

# 0001-example

## Context and Problem Statement

x

## Decision Outcome

y

## Consequences

z
`;

describe('cli init (end-to-end)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-init-cli-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scaffolds .madrlintrc.json in a fresh (non-TS) directory', () => {
    const r = runCli(dir, ['init']);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, '.madrlintrc.json'))).toBe(true);
    const config = JSON.parse(
      readFileSync(join(dir, '.madrlintrc.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(config.extends).toEqual(['madr-lint:recommended']);
    expect(config.adrDir).toBe('docs/adr');
    expect(config.madrVersion).toBeUndefined();
    expect(r.stdout).toMatch(/docs\/adr/);
    expect(r.stdout).toMatch(/created nothing yet/i);
  }, 30_000);

  it('scaffolds madr-lint.config.ts in a TS-ish project and detects the ADR dir + version', () => {
    writeFileSync(join(dir, 'tsconfig.json'), '{}');
    writeAdr(dir, 'docs/adr/0001-example.md', VALID_V3_ADR);

    const r = runCli(dir, ['init']);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, 'madr-lint.config.ts'))).toBe(true);
    expect(existsSync(join(dir, '.madrlintrc.json'))).toBe(false);

    const content = readFileSync(join(dir, 'madr-lint.config.ts'), 'utf8');
    expect(content).toContain("import { defineConfig } from 'madr-lint';");
    expect(content).toContain("adrDir: 'docs/adr'");
    expect(content).toContain("madrVersion: 'v3'");
    expect(r.stdout).toMatch(/docs\/adr/);
  }, 30_000);

  it('refuses to overwrite an existing config without --force (exit 2)', () => {
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({ rules: { 'madr/filename-format': 'off' } }),
    );
    const before = readFileSync(join(dir, '.madrlintrc.json'), 'utf8');

    const r = runCli(dir, ['init']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/already exists/i);
    // The pre-existing config is untouched.
    expect(readFileSync(join(dir, '.madrlintrc.json'), 'utf8')).toBe(before);
  }, 30_000);

  it('--force overwrites an existing config', () => {
    writeFileSync(
      join(dir, '.madrlintrc.json'),
      JSON.stringify({ rules: { 'madr/filename-format': 'off' } }),
    );

    const r = runCli(dir, ['init', '--force']);
    expect(r.status).toBe(0);
    const config = JSON.parse(
      readFileSync(join(dir, '.madrlintrc.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(config.extends).toEqual(['madr-lint:recommended']);
  }, 30_000);

  it('--dir overrides ADR directory detection', () => {
    const r = runCli(dir, ['init', '--dir', 'services/api/docs/adr']);
    expect(r.status).toBe(0);
    const config = JSON.parse(
      readFileSync(join(dir, '.madrlintrc.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(config.adrDir).toBe('services/api/docs/adr');
    expect(r.stdout).toMatch(/--dir/);
  }, 30_000);

  it('--json emits a machine-readable summary and still writes the config', () => {
    const r = runCli(dir, ['init', '--json']);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, '.madrlintrc.json'))).toBe(true);
    const payload = JSON.parse(r.stdout) as {
      written: boolean;
      configPath: string;
      configFormat: string;
      adrDir: string;
      adrDirSource: string;
      madrVersion: string;
      filesChecked: number;
      errors: number;
      warnings: number;
      suggestUpdateBaseline: boolean;
      docsUrl: string;
    };
    expect(payload.written).toBe(true);
    expect(payload.configPath).toBe('.madrlintrc.json');
    expect(payload.configFormat).toBe('json');
    expect(payload.adrDir).toBe('docs/adr');
    expect(payload.adrDirSource).toBe('fallback');
    expect(payload.madrVersion).toBe('auto');
    expect(payload.filesChecked).toBe(0);
    expect(payload.suggestUpdateBaseline).toBe(false);
    expect(payload.docsUrl).toMatch(/^https:\/\//);
  }, 30_000);

  it('suggests --update-baseline in the epilogue when the initial lint finds violations', () => {
    writeAdr(dir, 'docs/adr/0001-example.md', VALID_V3_ADR);
    // Violates madr/filename-format (no NNNN- prefix).
    writeAdr(dir, 'docs/adr/bad.md', '# not a real adr\n');

    const r = runCli(dir, ['init']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--update-baseline/);
  }, 30_000);

  it('does not suggest --update-baseline when the initial lint is clean', () => {
    writeAdr(dir, 'docs/adr/0001-example.md', VALID_V3_ADR);

    const r = runCli(dir, ['init']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/--update-baseline/);
  }, 30_000);

  // ──────────────────────────────────────────────────────────────────────
  // --force leftover-config notes must state the ACTUAL discovery outcome.
  // CONFIG_FILES order decides which file wins; the note's direction has to
  // follow it, not assume the old file always precedes the new one.
  // ──────────────────────────────────────────────────────────────────────

  describe('--force shadow notes (direction-aware)', () => {
    it('new config wins discovery: notes the OLD file is shadowed, never "remove it to take effect"', () => {
      // Stale low-priority config (madr-lint.config.js) in a non-TS project:
      // init writes .madrlintrc.json, which PRECEDES it in CONFIG_FILES, so
      // the new config already takes effect — claiming otherwise is wrong.
      writeFileSync(join(dir, 'madr-lint.config.js'), 'export default {};\n');

      const r = runCliCapture(dir, ['init', '--force']);
      expect(r.status).toBe(0);
      expect(existsSync(join(dir, '.madrlintrc.json'))).toBe(true);
      expect(r.stderr).toMatch(/shadowed/i);
      expect(r.stderr).not.toMatch(/remove it to make the new config take effect/i);
    }, 30_000);

    it('old config wins discovery: warns it precedes the new one and must be removed', () => {
      // TS project with a stale .madrlintrc.json: init writes
      // madr-lint.config.ts, but .madrlintrc.json still wins discovery.
      writeFileSync(join(dir, 'tsconfig.json'), '{}');
      writeFileSync(join(dir, '.madrlintrc.json'), '{}');

      const r = runCliCapture(dir, ['init', '--force']);
      expect(r.status).toBe(0);
      expect(existsSync(join(dir, 'madr-lint.config.ts'))).toBe(true);
      expect(r.stderr).toMatch(/precedes/i);
      expect(r.stderr).toMatch(/remove/i);
      expect(r.stderr).not.toMatch(/shadowed by/i);
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Fallback note vs recursive lint: findAdrFiles() is recursive, so a
  // nested-only ADR tree falls back on detection (top-level scan) yet still
  // yields lint findings — the epilogue must not claim emptiness then.
  // ──────────────────────────────────────────────────────────────────────

  it('nested-only ADR dir: fallback note must not claim nothing exists while reporting findings', () => {
    // No top-level NNNN-*.md anywhere → detectAdrDir falls back to docs/adr,
    // but the recursive initial lint still finds (and flags) the nested file.
    writeAdr(dir, 'docs/adr/2026/0001-nested.md', '# x\n\nno sections here\n');

    const r = runCli(dir, ['init']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--update-baseline/);
    expect(r.stdout).not.toMatch(/created nothing yet/i);
  }, 30_000);

  // ──────────────────────────────────────────────────────────────────────
  // --dir usage errors: an empty value must not silently fall through to
  // auto-detection (same footgun class as --max-warnings "").
  // ──────────────────────────────────────────────────────────────────────

  describe('--dir validation', () => {
    it('exits 2 when --dir value is empty (must not silently auto-detect)', () => {
      const r = runCli(dir, ['init', '--dir', '']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--dir/);
      // Usage error: nothing may have been written.
      expect(existsSync(join(dir, '.madrlintrc.json'))).toBe(false);
    }, 30_000);

    it('exits 2 when --dir value is whitespace-only', () => {
      const r = runCli(dir, ['init', '--dir', '   ']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--dir/);
      expect(existsSync(join(dir, '.madrlintrc.json'))).toBe(false);
    }, 30_000);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Regression: the plain (non-init) command must keep working exactly as
  // before now that `init` is wired up. citty's runCommand() treats ANY
  // unmatched leading non-flag token as an attempted subcommand name and
  // throws "Unknown command" when `subCommands` is set directly on the
  // command that also owns the free-form `paths` positional — verified by
  // probing citty 0.2.2 directly. cli.ts therefore dispatches to the `init`
  // subcommand manually (only when the literal first raw arg is "init"),
  // instead of via citty's `cmd.subCommands` field on the main command.
  // These tests guard against that regression reappearing.
  // ──────────────────────────────────────────────────────────────────────

  describe('default command regression (init must not break it)', () => {
    it('a plain positional path (first arg, no leading flag) still lints normally', () => {
      // Disable all rules explicitly (an empty `rules: {}` would still fall
      // back to `recommended` per cli.ts) so this test only asserts routing
      // behavior, not a particular rule's verdict on trivial content.
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ rules: { 'madr/filename-format': 'off' } }),
      );
      writeFileSync(join(dir, '0001-a.md'), '# x\n');
      const r = runCli(dir, ['0001-a.md', '--no-cache']);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toMatch(/unknown command/i);
    }, 30_000);

    it('a directory positional that is not "init" still lints normally', () => {
      writeAdr(dir, 'docs/adr/0001-a.md', VALID_V3_ADR);
      const r = runCli(dir, ['docs/adr', '--no-cache']);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toMatch(/unknown command/i);
    }, 30_000);

    it('no args still falls back to config.adrDir (unchanged default behavior)', () => {
      const r = runCli(dir, ['--no-cache']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/No \.md files to lint/);
    }, 30_000);
  });
});
