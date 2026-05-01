---
name: add-rule
description: TDD-gated scaffold for a new madr-lint rule. Generates spec, fixtures, failing test (RED), runs vitest to confirm RED, then scaffolds rule stub + bench stub. Refuses to write the implementation — that is the user's job (GREEN). Use whenever adding a new lint rule such as madr/filename-format or madr/required-sections.
allowed-tools: Bash(pnpm:*), Bash(mise:*), Bash(mkdir:*), Bash(git:*), Bash(node:*), Read, Write, Edit
---

# add-rule — TDD-gated scaffold for a new madr-lint rule

This skill enforces strict Red-Green-Refactor TDD discipline per ADR-0003. The skill writes the *spec*, the *fixtures*, the *failing test*, and an *empty rule stub* + *bench stub*. The implementation that turns the test green is the user's job. Two RED gates are enforced mechanically — the skill refuses to proceed if either gate produces a green result, because that would mean the test is not actually exercising the rule.

## Inputs

Ask the user (or infer from invocation args):

1. **Rule ID** — kebab-case, must start with `madr/`. Example: `madr/filename-format`.
2. **Rule type** — `perFile` (default) or `project` (cross-file).
3. **MADR version compat** — array of `v2`, `v3`, `v4` (default: all three).
4. **Recommended preset severity** — `error` (default for spec-grounded rules), `warn`, or `off`.

If any are unclear, ask the user before proceeding. Never guess the rule ID.

`<kebab>` below is the part after `madr/`. `<camel>` is the camelCase form.

## Procedure

### Step 1: Verify project state

- cwd is madr-lint repo root (look for `package.json` with `"name": "madr-lint"`)
- working tree is clean (`git status --porcelain` empty); abort if dirty
- `mise exec -- pnpm exec vitest --version` works (else run `mise exec -- pnpm install` first)

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

Write these files. The test file MUST fail when run (no impl exists yet).

**`src/rules/<kebab>/spec.md`** — Given/When/Then in plain prose:

- The MADR aspect this rule enforces (cite spec source if applicable)
- For each version in `versionCompat`, what is valid vs invalid
- Diagnostic shape: `messageId`, `data` payload fields, default severity
- Concrete examples (good / bad) — these become fixtures

**`src/rules/<kebab>/schema.json`** — AJV schema for options:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**`tests/fixtures/<kebab>/valid/<slug>.md`** and **`invalid/<slug>.md`** — concrete ADR markdown files. Valid: zero diagnostics. Invalid: exactly the diagnostic from spec.md.

**`tests/rules/<kebab>.test.ts`** — DO NOT use bare `toMatchInlineSnapshot()` for invalid cases. vitest auto-fills empty snapshots on first run, defeating the RED gate. Use **hard assertions** instead:

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.ts';
import rule from '../../src/rules/<kebab>/index.ts';

const fixturesDir = join(import.meta.dirname, '../fixtures/<kebab>');

describe('madr/<kebab>', () => {
  describe('valid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'valid'))) {
      it(`${file} produces no diagnostics`, () => {
        const content = readFileSync(join(fixturesDir, 'valid', file), 'utf8');
        expect(runRule(rule, { content, path: file })).toEqual([]);
      });
    }
  });

  describe('invalid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'invalid'))) {
      it(`${file} produces <messageId> diagnostic`, () => {
        const content = readFileSync(join(fixturesDir, 'invalid', file), 'utf8');
        const diagnostics = runRule(rule, { content, path: file });
        expect(diagnostics, `expected exactly one diagnostic for ${file}`).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleName: 'madr/<kebab>',
          messageId: '<messageId>',
          severity: 'error',
          path: file,
          data: { /* spec-defined data fields, e.g. filename, expected */ },
        });
      });
    }
  });
});
```

The `toHaveLength(1)` + `toMatchObject({ data: { ... } })` shape is **mandatory** — it is what makes the second RED gate (Step 10) actually fire when the impl is empty.

### Step 4: Confirm RED — gate #1

```bash
mise exec -- pnpm vitest run tests/rules/<kebab>.test.ts
```

Expected: **exit code != 0** (import fails: `Cannot find module '../../src/rules/<kebab>/index.ts'`).

Verify using `vitest`'s output, NOT exit code alone — a typo in the test path also yields non-zero. Specifically check:

- vitest reports "Failed Suites" or "Failed Tests" (not "no tests found")
- the failure reason is the import error or assertion failure (substantive)

If exit code 0: **skill failure**. Stop, report to user.

### Step 5: Generate the rule stub (intentionally still RED)

Write `src/rules/<kebab>/index.ts`. This makes the import resolve but produces no diagnostics, so invalid fixtures will still fail at Step 10.

```typescript
import type { Rule } from '../../core/types.ts';

interface <Camel>Options extends Record<string, unknown> {
  // <option fields per spec.md>
}

const rule: Rule<<Camel>Options> = {
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
    defaultOptions: {
      // <defaults>
    },
    schema: () => import('./schema.json', { with: { type: 'json' } }),
  },
  create(_context) {
    // GREEN phase: the user (or Claude in a later turn) implements this.
  },
};

export default rule;
```

### Step 6: Ensure helpers exist

`tests/helpers/run-rule.ts` already exists for filename/metadata-style rules. For the **first** AST-based rule, the helper needs to grow:

- parse frontmatter with `gray-matter`
- parse body with `mdast-util-from-markdown`
- walk the tree once, calling listeners returned by `rule.create()` (`enter` / `exit` keyed by mdast node type — see `RuleListeners` in `src/core/types.ts`)

If the AST step is the new work for this rule, scope a separate task:
write a failing test for the AST traversal helper itself first, then implement.

### Step 7: Generate the benchmark stub

`benchmarks/<kebab>/bench.ts`:

```typescript
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.ts';
import rule from '../../src/rules/<kebab>/index.ts';

const tiny = readFileSync(new URL('./fixtures/tiny.md', import.meta.url), 'utf8');
const typical = readFileSync(new URL('./fixtures/typical.md', import.meta.url), 'utf8');

const bench = new Bench({ time: 500 });
bench
  .add('madr/<kebab> — tiny', () => {
    runRule(rule, { content: tiny, path: '0001-bench.md' });
  })
  .add('madr/<kebab> — typical', () => {
    runRule(rule, { content: typical, path: '0001-bench.md' });
  });

await bench.run();
console.table(bench.table());

// Emit JSON for bench-rule + perf-regression-check skills to consume.
const sha = execSync('git rev-parse --short HEAD').toString().trim();
const results = bench.tasks.map((t) => ({
  name: t.name,
  hz: t.result?.hz,
  mean: t.result?.mean,
  rme: t.result?.rme,
  samples: t.result?.samples.length,
}));
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(results, null, 2),
);
```

Plus minimal `benchmarks/<kebab>/fixtures/{tiny,typical}.md` corpora.

### Step 8: Update registry and recommended preset

- Append `export { default as <camel> } from './<kebab>/index.ts';` to `src/rules/index.ts`.
- Append the severity entry (input #4) to `src/configs/recommended.ts`.

### Step 9: Generate the docs stub

`docs/rules/<kebab>.md` with sections: Description, Rationale, Examples (good/bad), Options table, MADR version compat table, When to disable.

### Step 10: Re-run vitest — confirm *different* RED — gate #2

```bash
mise exec -- pnpm vitest run tests/rules/<kebab>.test.ts
```

Expected: tests now execute (imports resolve) but invalid fixtures fail at `toHaveLength(1)` because the empty `create()` produces no diagnostics. Valid fixtures pass (empty diagnostics array equals empty). This is the second RED state.

If all tests pass: **skill failure**. Either the test was generated with an auto-filling snapshot, or fixtures are empty. Stop and report.

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

RED state confirmed (N tests failing at toHaveLength(1)).
Next steps (GREEN phase):
  1. Implement src/rules/<kebab>/index.ts so each invalid fixture
     produces the expected diagnostic with the data shape from spec.md.
  2. Run `mise exec -- pnpm vitest run tests/rules/<kebab>.test.ts`
     until all tests pass.
  3. Verify all valid fixtures still produce zero diagnostics.

Discipline: do NOT modify tests/rules/<kebab>.test.ts after this point —
the test is the contract, the impl follows it.
```

## Hard rules

- MUST run vitest at Step 4 (gate #1) and Step 10 (gate #2). Skipping either breaks TDD.
- MUST NOT write the rule's implementation logic. `create()` body stays empty until the user takes over.
- MUST NOT use bare `toMatchInlineSnapshot()` in the generated test — only hard assertions (`toHaveLength` + `toMatchObject({ data: {...} })`). Snapshot-based assertions can be added LATER, only after the impl is correct, via `vitest -u`.
- MUST refuse to proceed if either RED gate produces a green test.

## When to invoke

User says:
- "add a new rule X"
- "create rule madr/X"
- "implement madr/X" (start here, hand off for impl)

## When NOT to invoke

- Bug in an existing rule → use `add-fixture-case` (to be created)
- Renaming/deprecating a rule → use `deprecate-rule` (to be created)
- Adding a utility (not a rule) → write tests directly, no scaffolding needed
