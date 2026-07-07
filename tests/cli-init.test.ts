import { execFileSync } from 'node:child_process';
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
