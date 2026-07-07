import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADR_DIR_CANDIDATES,
  GETTING_STARTED_URL,
  buildEpilogue,
  detectAdrDir,
  detectConfigFormat,
  detectMadrVersion,
  findExistingConfigFile,
  renderConfig,
} from '../../src/core/init.js';

function writeAdr(dir: string, filename: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content);
}

const V4_FRONTMATTER = `---
status: accepted
date: 2026-01-01
decision-makers:
  - alice
---

# 0001-example

## Context and Problem Statement

x
`;

const V3_FRONTMATTER = `---
status: accepted
date: 2026-01-01
deciders: alice
---

# 0001-example

## Context and Problem Statement

x
`;

const V2_BODY_LIST = `# 0001-example

* Status: accepted
* Date: 2026-01-01
* Deciders: alice

## Context and Problem Statement

x
`;

const NO_METADATA = `# 0001-example

## Context and Problem Statement

x
`;

describe('core/init', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-init-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('ADR_DIR_CANDIDATES', () => {
    it('is the fixed priority order from the issue spec', () => {
      expect(ADR_DIR_CANDIDATES).toEqual([
        'docs/adr',
        'docs/decisions',
        'doc/adr',
        'adr',
        'docs/architecture/decisions',
      ]);
    });
  });

  describe('detectAdrDir', () => {
    it('falls back to docs/adr with source "fallback" when nothing is found', () => {
      const result = detectAdrDir(dir);
      expect(result).toEqual({ adrDir: 'docs/adr', source: 'fallback' });
    });

    it('detects docs/adr when it contains an NNNN-*.md file', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-use-x.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result).toEqual({ adrDir: 'docs/adr', source: 'detected' });
    });

    it('detects docs/decisions when docs/adr is absent', () => {
      writeAdr(join(dir, 'docs/decisions'), '0001-use-x.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result).toEqual({ adrDir: 'docs/decisions', source: 'detected' });
    });

    it('prefers docs/adr over docs/decisions when both are present', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', NO_METADATA);
      writeAdr(join(dir, 'docs/decisions'), '0001-b.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result.adrDir).toBe('docs/adr');
    });

    it('detects doc/adr when earlier candidates are absent', () => {
      writeAdr(join(dir, 'doc/adr'), '0001-a.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result).toEqual({ adrDir: 'doc/adr', source: 'detected' });
    });

    it('detects adr/ when earlier candidates are absent', () => {
      writeAdr(join(dir, 'adr'), '0001-a.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result).toEqual({ adrDir: 'adr', source: 'detected' });
    });

    it('detects docs/architecture/decisions as the last-resort candidate', () => {
      writeAdr(join(dir, 'docs/architecture/decisions'), '0001-a.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result).toEqual({
        adrDir: 'docs/architecture/decisions',
        source: 'detected',
      });
    });

    it('ignores files that do not match the NNNN-*.md pattern', () => {
      writeAdr(join(dir, 'docs/adr'), 'README.md', NO_METADATA);
      const result = detectAdrDir(dir);
      expect(result).toEqual({ adrDir: 'docs/adr', source: 'fallback' });
    });

    it('does not scan recursively (top-level only, matches maxdepth 1)', () => {
      writeAdr(join(dir, 'docs/adr/nested'), '0001-a.md', NO_METADATA);
      const result = detectAdrDir(dir);
      // The only NNNN-*.md file is one level too deep under docs/adr/nested,
      // so docs/adr itself does not qualify — falls back.
      expect(result).toEqual({ adrDir: 'docs/adr', source: 'fallback' });
    });
  });

  describe('detectMadrVersion', () => {
    it('returns "auto" when the ADR dir has no files', () => {
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('auto');
    });

    it('returns "auto" when the ADR dir does not exist', () => {
      expect(detectMadrVersion(dir, 'does/not/exist')).toBe('auto');
    });

    it('detects v4 from frontmatter with decision-makers', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', V4_FRONTMATTER);
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('v4');
    });

    it('detects v3 from frontmatter without decision-makers', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', V3_FRONTMATTER);
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('v3');
    });

    it('detects v2 from body-list metadata with no frontmatter', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', V2_BODY_LIST);
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('v2');
    });

    it('majority wins across a mixed-vintage sample', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', V3_FRONTMATTER);
      writeAdr(join(dir, 'docs/adr'), '0002-b.md', V3_FRONTMATTER);
      writeAdr(join(dir, 'docs/adr'), '0003-c.md', V3_FRONTMATTER);
      writeAdr(join(dir, 'docs/adr'), '0004-d.md', V2_BODY_LIST);
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('v3');
    });

    it('returns "auto" on an exact tie', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', V3_FRONTMATTER);
      writeAdr(join(dir, 'docs/adr'), '0002-b.md', V2_BODY_LIST);
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('auto');
    });

    it('returns "auto" when no sampled file carries recognizable metadata', () => {
      writeAdr(join(dir, 'docs/adr'), '0001-a.md', NO_METADATA);
      writeAdr(join(dir, 'docs/adr'), '0002-b.md', NO_METADATA);
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('auto');
    });

    it('samples at most 20 files (lexicographically first)', () => {
      // 20 v2 files (0001-0020) + 5 v4 files (0021-0025). Only the first 20
      // (lexicographic order) are sampled, so v2 must win even though v4
      // files exist further down the directory listing.
      for (let i = 1; i <= 20; i++) {
        const name = `${String(i).padStart(4, '0')}-v2.md`;
        writeAdr(join(dir, 'docs/adr'), name, V2_BODY_LIST);
      }
      for (let i = 21; i <= 25; i++) {
        const name = `${String(i).padStart(4, '0')}-v4.md`;
        writeAdr(join(dir, 'docs/adr'), name, V4_FRONTMATTER);
      }
      expect(detectMadrVersion(dir, 'docs/adr')).toBe('v2');
    });
  });

  describe('detectConfigFormat', () => {
    it('returns "json" when there is no tsconfig.json and no package.json', () => {
      expect(detectConfigFormat(dir)).toBe('json');
    });

    it('returns "ts" when tsconfig.json is present', () => {
      writeFileSync(join(dir, 'tsconfig.json'), '{}');
      expect(detectConfigFormat(dir)).toBe('ts');
    });

    it('returns "ts" when package.json has typescript in devDependencies', () => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }),
      );
      expect(detectConfigFormat(dir)).toBe('ts');
    });

    it('returns "ts" when package.json has typescript in dependencies', () => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } }),
      );
      expect(detectConfigFormat(dir)).toBe('ts');
    });

    it('returns "json" when package.json has neither tsconfig nor typescript', () => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.0.0' } }),
      );
      expect(detectConfigFormat(dir)).toBe('json');
    });

    it('returns "json" (does not throw) on a malformed package.json', () => {
      writeFileSync(join(dir, 'package.json'), '{ not valid json');
      expect(() => detectConfigFormat(dir)).not.toThrow();
      expect(detectConfigFormat(dir)).toBe('json');
    });
  });

  describe('findExistingConfigFile', () => {
    it('returns null when no config file exists', () => {
      expect(findExistingConfigFile(dir)).toBeNull();
    });

    it('finds .madrlintrc.json', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), '{}');
      expect(findExistingConfigFile(dir)).toBe('.madrlintrc.json');
    });

    it('finds madr-lint.config.ts', () => {
      writeFileSync(join(dir, 'madr-lint.config.ts'), 'export default {};');
      expect(findExistingConfigFile(dir)).toBe('madr-lint.config.ts');
    });

    it('resolves priority order when multiple config files exist', () => {
      writeFileSync(join(dir, 'madr-lint.config.ts'), 'export default {};');
      writeFileSync(join(dir, '.madrlintrc.json'), '{}');
      // .madrlintrc.json precedes madr-lint.config.ts in CONFIG_FILES.
      expect(findExistingConfigFile(dir)).toBe('.madrlintrc.json');
    });
  });

  describe('renderConfig', () => {
    it('renders JSON without a madrVersion key when version is "auto"', () => {
      const content = renderConfig('json', { adrDir: 'docs/adr', madrVersion: 'auto' });
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed.extends).toEqual(['madr-lint:recommended']);
      expect(parsed.adrDir).toBe('docs/adr');
      expect(parsed.madrVersion).toBeUndefined();
    });

    it('renders JSON with an explicit madrVersion', () => {
      const content = renderConfig('json', { adrDir: 'docs/adr', madrVersion: 'v4' });
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed.madrVersion).toBe('v4');
    });

    it('renders a TS config extending madr-lint:recommended', () => {
      const content = renderConfig('ts', { adrDir: 'docs/decisions', madrVersion: 'auto' });
      expect(content).toContain("import { defineConfig } from 'madr-lint';");
      expect(content).toContain("extends: ['madr-lint:recommended']");
      expect(content).toContain("adrDir: 'docs/decisions'");
      expect(content).not.toContain('madrVersion');
    });

    it('renders a TS config with an explicit madrVersion', () => {
      const content = renderConfig('ts', { adrDir: 'docs/adr', madrVersion: 'v2' });
      expect(content).toContain("madrVersion: 'v2'");
    });
  });

  describe('buildEpilogue', () => {
    it('mentions the fallback default and that nothing was created', () => {
      const text = buildEpilogue({
        adrDir: 'docs/adr',
        adrDirSource: 'fallback',
        configPath: '.madrlintrc.json',
        filesChecked: 0,
        errors: 0,
        warnings: 0,
      });
      expect(text).toMatch(/docs\/adr/);
      expect(text).toMatch(/created nothing yet/i);
      expect(text).toContain(GETTING_STARTED_URL);
    });

    it('mentions the detected ADR directory', () => {
      const text = buildEpilogue({
        adrDir: 'docs/decisions',
        adrDirSource: 'detected',
        configPath: '.madrlintrc.json',
        filesChecked: 3,
        errors: 0,
        warnings: 0,
      });
      expect(text).toMatch(/detect/i);
      expect(text).toMatch(/docs\/decisions/);
    });

    it('mentions --dir when the directory was overridden', () => {
      const text = buildEpilogue({
        adrDir: 'custom/adr',
        adrDirSource: 'override',
        configPath: '.madrlintrc.json',
        filesChecked: 1,
        errors: 0,
        warnings: 0,
      });
      expect(text).toMatch(/--dir/);
    });

    it('suggests --update-baseline when violations are present', () => {
      const text = buildEpilogue({
        adrDir: 'docs/adr',
        adrDirSource: 'detected',
        configPath: '.madrlintrc.json',
        filesChecked: 5,
        errors: 2,
        warnings: 1,
      });
      expect(text).toMatch(/--update-baseline/);
    });

    it('does not suggest --update-baseline when there are no violations', () => {
      const text = buildEpilogue({
        adrDir: 'docs/adr',
        adrDirSource: 'detected',
        configPath: '.madrlintrc.json',
        filesChecked: 5,
        errors: 0,
        warnings: 0,
      });
      expect(text).not.toMatch(/--update-baseline/);
    });

    it('does not suggest --update-baseline when no files were linted yet', () => {
      const text = buildEpilogue({
        adrDir: 'docs/adr',
        adrDirSource: 'fallback',
        configPath: '.madrlintrc.json',
        filesChecked: 0,
        errors: 0,
        warnings: 0,
      });
      expect(text).not.toMatch(/--update-baseline/);
    });

    it('fallback with files found by the recursive lint must not claim nothing exists', () => {
      // detectAdrDir scans top-level only, but the initial lint is recursive:
      // a nested-only ADR tree is source 'fallback' WITH filesChecked > 0.
      // "created nothing yet" beside "found 5 error(s)" would contradict.
      const text = buildEpilogue({
        adrDir: 'docs/adr',
        adrDirSource: 'fallback',
        configPath: '.madrlintrc.json',
        filesChecked: 1,
        errors: 5,
        warnings: 0,
      });
      expect(text).not.toMatch(/created nothing yet/i);
      expect(text).not.toMatch(/no existing ADRs found/i);
      expect(text).toMatch(/docs\/adr/);
      expect(text).toMatch(/--update-baseline/);
    });
  });
});
