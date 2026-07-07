import { describe, it, expect } from 'vitest';
import * as madrLint from '../src/index.js';

// Public API export-surface test (package root, `src/index.ts`). Every
// programmatic export the docs (website/src/content/docs/guides/api.md) or a
// changeset advertises must actually be importable from the package root —
// npm consumers only ever see `src/index.ts`'s re-exports, never internal
// module paths like `src/core/fix.ts`.
describe('src/index.ts — public API export surface', () => {
  it('re-exports the autofix applier primitives, including the project-fix helpers', () => {
    // Sibling per-file autofix helpers, already exported — sanity check the
    // baseline before asserting on the ones under test.
    expect(typeof madrLint.applyEdits).toBe('function');
    expect(typeof madrLint.makeFixer).toBe('function');
    expect(typeof madrLint.collectFixes).toBe('function');
    expect(typeof madrLint.fixFileContent).toBe('function');
    expect(typeof madrLint.unifiedDiff).toBe('function');
    expect(typeof madrLint.MAX_FIX_PASSES).toBe('number');

    // .changeset/fixable-rules.md advertises these as programmatic API
    // (project-rule fixes, #29) — they must be importable from the package
    // root, not just `src/core/fix.ts`.
    expect(typeof madrLint.collectProjectFixes).toBe('function');
    expect(typeof madrLint.applyEditsCounted).toBe('function');
  });
});
