import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBaseline } from '../../src/core/baseline.js';
import { lintFiles, type CacheConfig } from '../../src/core/lint.js';
import requiredSections from '../../src/rules/required-sections/index.js';

// A bare heading with no MADR sections trips madr/required-sections three
// times (Context / Decision Outcome / Consequences all missing).
const BARE = '# Just a heading\n\nNo sections here.\n';

describe('core/lint — baseline subtraction', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'madr-lint-lintbase-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function lintOnce(baseline: Parameters<typeof lintFiles>[0]['baseline'], cache?: CacheConfig | null) {
    const file = join(dir, '0001-a.md');
    writeFileSync(file, BARE);
    return lintFiles({
      rules: [requiredSections],
      ruleSeverity: { 'madr/required-sections': 'error' },
      files: [file],
      cwd: dir,
      baseline,
      cache,
    });
  }

  it('no baseline is a no-op (all diagnostics kept, baselineHidden 0)', () => {
    const result = lintOnce(null);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.baselineHidden).toBe(0);
  });

  it('subtracts baselined diagnostics and counts how many were hidden', () => {
    // Baseline the full set of current diagnostics.
    const raw = lintOnce(null);
    const baseline = buildBaseline(raw.diagnostics);

    const result = lintOnce(baseline);
    expect(result.diagnostics).toEqual([]);
    expect(result.baselineHidden).toBe(3);
  });

  it('reports only the NEW violation when the baseline covers only part of the count', () => {
    const raw = lintOnce(null);
    // Baseline only two of the three current diagnostics.
    const baseline = buildBaseline(raw.diagnostics.slice(0, 2));
    const result = lintOnce(baseline);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.baselineHidden).toBe(2);
  });

  it('still subtracts on a WARM cache — cache stores pre-baseline diagnostics', () => {
    const cacheDir = join(dir, '.madr-lint', 'cache');
    const cache: CacheConfig = {
      dir: cacheDir,
      configHash: 'h',
      pkgVersion: '0.0.0-test',
    };
    // Cold run with no baseline populates the cache with the full (pre-baseline) set.
    const cold = lintOnce(null, cache);
    expect(cold.filesFromCache).toBe(0);
    expect(cold.diagnostics).toHaveLength(3);

    const baseline = buildBaseline(cold.diagnostics);
    // Warm run: per-file diagnostics come from cache, yet baseline still subtracts.
    const warm = lintOnce(baseline, cache);
    expect(warm.filesFromCache).toBe(1);
    expect(warm.diagnostics).toEqual([]);
    expect(warm.baselineHidden).toBe(3);
  });
});
