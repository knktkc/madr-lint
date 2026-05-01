---
name: add-rule
description: TDD-gated scaffold for a new madr-lint rule. Generates spec, fixtures, failing test (RED), runs vitest to confirm RED, then scaffolds rule stub + bench stub. Refuses to write the implementation — that is the user's job (GREEN). Use whenever adding a new lint rule such as madr/filename-format or madr/required-sections.
allowed-tools: Bash(pnpm:*), Bash(mkdir:*), Bash(git:*), Bash(node:*), Read, Write, Edit
---

# add-rule — TDD-gated scaffold for a new madr-lint rule

This skill enforces strict Red-Green-Refactor TDD discipline per ADR-0003. The skill writes the *spec*, the *fixtures*, the *failing test*, and an *empty rule stub*. The implementation that turns the test green is the user's job. The skill mechanically refuses to bypass the RED state.

## Inputs

Ask the user (or infer from invocation args):

1. **Rule ID** — kebab-case, must start with `madr/`. Example: `madr/filename-format`.
2. **Rule type** — `perFile` (default) or `project` (cross-file).
3. **MADR version compat** — array of `v2`, `v3`, `v4` (default: all three).
4. **Recommended preset severity** — should this rule be enabled in `recommended` by default? (`error` / `warn` / `off`, default `error` for spec-grounded rules).

If any are unclear, ask the user before proceeding. Never guess the rule ID.

Throughout this document, `<kebab>` means the part after `madr/` (e.g. for `madr/filename-format`, `<kebab>` is `filename-format`). `<camel>` is the camelCase of `<kebab>`.

## Procedure

### Step 1: Verify project state

- Confirm cwd is the madr-lint repo root (look for `package.json` with `"name": "madr-lint"`).
- Confirm working tree is clean (`git status --porcelain` is empty). If not clean, stop and ask the user to commit or stash.
- Confirm `pnpm` and `vitest` are usable (`pnpm exec vitest --version`). If not, run dependency install first.

### Step 2: Create directories

```bash
mkdir -p src/rules/<kebab>
mkdir -p tests/rules
mkdir -p tests/fixtures/<kebab>/valid
mkdir -p tests/fixtures/<kebab>/invalid
mkdir -p benchmarks/<kebab>/fixtures
mkdir -p docs/rules
```

### Step 3: Generate the RED-phase files

Write these files. The test file MUST fail when run (no impl exists).

**`src/rules/<kebab>/spec.md`** — plain-prose Given/When/Then. Lay out:
- The MADR aspect this rule enforces (cite spec source if applicable)
- For each version in `versionCompat`, what is valid vs invalid
- Diagnostic shape: messageId(s), `data` payload fields, default severity
- Concrete examples (good / bad) — these become fixtures in step 4

**`src/rules/<kebab>/schema.json`** — AJV options schema. Default skeleton:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**`tests/fixtures/<kebab>/valid/<slug>.md`** and **`invalid/<slug>.md`** — concrete ADR markdown matching the spec.md examples. One file per scenario. Valid fixtures: zero diagnostics. Invalid fixtures: exactly the diagnostic in spec.md.

**`tests/rules/<kebab>.test.ts`** — vitest using the `runRule` helper:

```typescript
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/<kebab>/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures/<kebab>');

describe('madr/<kebab>', () => {
  describe('valid fixtures produce no diagnostics', () => {
    for (const file of readdirSync(join(fixturesDir, 'valid'))) {
      it(file, () => {
        const content = readFileSync(join(fixturesDir, 'valid', file), 'utf8');
        const diagnostics = runRule(rule, { content, path: file });
        expect(diagnostics).toEqual([]);
      });
    }
  });

  describe('invalid fixtures produce expected diagnostics', () => {
    for (const file of readdirSync(join(fixturesDir, 'invalid'))) {
      it(file, () => {
        const content = readFileSync(join(fixturesDir, 'invalid', file), 'utf8');
        const diagnostics = runRule(rule, { content, path: file });
        expect(diagnostics).toMatchInlineSnapshot();
      });
    }
  });
});
```

The import of `../../src/rules/<kebab>/index.js` deliberately fails — that is RED.

### Step 4: Confirm RED (gate #1)

```bash
pnpm vitest run tests/rules/<kebab>.test.ts
```

Expected: **exit code != 0** (import fails or assertions fail). This is RED.

If exit code == 0: **skill failure**. Either the test imports nothing meaningful or fixtures are empty. Stop and report to the user; do not proceed.

### Step 5: Generate the rule stub (intentionally produces a *different* RED)

Write `src/rules/<kebab>/index.ts` with type-correct meta and an empty `create()` returning no diagnostics. This makes the import resolve but does NOT implement the rule.

```typescript
import type { Rule } from '../../core/rule.js';

const rule: Rule = {
  meta: {
    name: 'madr/<kebab>',
    type: '<perFile|project>',
    versionCompat: ['<v2|v3|v4>'],
    docs: {
      description: '<one-line description>',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/<kebab>.md',
      recommended: <true|false>,
    },
    messages: {
      // <messageId>: '<template with {{placeholders}}>'
    },
    defaultOptions: {},
    schema: () => import('./schema.json', { with: { type: 'json' } }),
  },
  create(_context) {
    // GREEN phase: the user (or Claude in a later turn) implements this.
    return {};
  },
};

export default rule;
```

### Step 6: Ensure helpers exist

If `tests/helpers/run-rule.ts` doesn't exist, create a minimal version that constructs a fresh runner instance per invocation, parses the file with `gray-matter` + `mdast-util-from-markdown`, dispatches to the rule's visitor (or per-file callback), and collects diagnostics. Reference `CLAUDE.md` § Architecture principles for the runner contract.

If the runner core itself doesn't exist yet (this is the very first rule), create a minimum runner first — but apply the same TDD discipline: write a test for the runner first, confirm RED, then implement.

### Step 7: Generate the benchmark stub

`benchmarks/<kebab>/bench.ts`:

```typescript
import { Bench } from 'tinybench';
import { readFileSync } from 'node:fs';
import { runRule } from '../../tests/helpers/run-rule.js';
import rule from '../../src/rules/<kebab>/index.js';

const tiny = readFileSync(new URL('./fixtures/tiny.md', import.meta.url), 'utf8');
const typical = readFileSync(new URL('./fixtures/typical.md', import.meta.url), 'utf8');

const bench = new Bench({ time: 500 });
bench
  .add('madr/<kebab> — tiny', () => runRule(rule, { content: tiny, path: 'tiny.md' }))
  .add('madr/<kebab> — typical', () => runRule(rule, { content: typical, path: 'typical.md' }));

await bench.run();
console.table(bench.table());
```

Plus minimal `benchmarks/<kebab>/fixtures/{tiny,typical}.md` corpora.

### Step 8: Update registry and recommended preset

- Append `export { default as <camel> } from './<kebab>/index.js';` to `src/rules/index.ts`.
- Append the severity entry (input #4) to `src/configs/recommended.ts`.

### Step 9: Generate the docs stub

`docs/rules/<kebab>.md` with sections: Description, Rationale, Examples (good/bad), Options, MADR version compat table, When to disable.

### Step 10: Re-run vitest — confirm *different* RED (gate #2)

```bash
pnpm vitest run tests/rules/<kebab>.test.ts
```

Expected: tests now execute (imports resolve) but invalid fixtures produce empty `[]` instead of the expected diagnostic. Inline snapshots are still empty. This is RED-prime — proves the test is exercising the rule.

If tests pass at this point: **skill failure**. Either fixtures are wrong or the snapshot was pre-filled. Stop and report.

### Step 11: Hand off to user

Print:

```
Scaffold complete for madr/<kebab>.

Files created:
  - src/rules/<kebab>/{spec.md, index.ts, schema.json}
  - tests/rules/<kebab>.test.ts
  - tests/fixtures/<kebab>/{valid,invalid}/*.md
  - benchmarks/<kebab>/{bench.ts, fixtures/*.md}
  - docs/rules/<kebab>.md
Registry & recommended preset updated.

RED state confirmed (N tests failing). Next steps (GREEN phase):
  1. Implement src/rules/<kebab>/index.ts so each invalid fixture
     produces the expected diagnostic.
  2. Run `pnpm vitest run tests/rules/<kebab>.test.ts -u` to lock
     inline snapshots after the diagnostics are correct.
  3. Verify all valid fixtures still produce zero diagnostics.

Discipline: do NOT modify tests/rules/<kebab>.test.ts after this point
except via `vitest -u` snapshot updates — and only after the impl is correct.
```

## Hard rules

- MUST run vitest at Step 4 (gate #1) and Step 10 (gate #2). Skipping either breaks TDD.
- MUST NOT write the rule's implementation logic. `create()` body stays empty until the user takes over.
- MUST refuse to proceed if Step 4 produces a green test.
- MUST NOT modify `tests/rules/<kebab>.test.ts` after Step 4, except snapshot updates after impl is verified.

## When to invoke

User says:
- "add a new rule X"
- "create rule madr/X"
- "implement madr/X" (start here, hand off for impl)

## When NOT to invoke

- Bug in an existing rule → use `add-fixture-case` (to be created)
- Renaming/deprecating a rule → use `deprecate-rule` (to be created)
- Adding a utility (not a rule) → write tests directly, no scaffolding needed
