---
name: add-rule
description: TDD-gated scaffold for a new madr-lint rule. Generates spec, fixtures, failing test (RED), runs vitest to confirm RED, then scaffolds an empty rule stub + bench stub. Refuses to write the implementation — that is the user's job (GREEN). Use whenever adding a new lint rule such as madr/required-sections or madr/status-enum.
allowed-tools: Bash(pnpm:*), Bash(mise:*), Bash(mkdir:*), Bash(git:*), Bash(node:*), Read, Write, Edit
---

# add-rule — TDD-gated scaffold for a new madr-lint rule

Enforces strict Red-Green-Refactor TDD discipline per ADR-0003.

The skill writes the *spec*, *fixtures*, *failing test*, *empty rule stub*, *bench stub*, *docs stub*, and updates the registry. The implementation that turns the test green is the user's job. Two RED gates are enforced mechanically.

> **Conventions** (must match HEAD):
> - Project-internal imports use the **`.js` extension** (Node ESM idiom). tsc + tsup resolve them to the `.ts` source.
> - Rule meta `schema` is a plain object via `import schema from './schema.json' with { type: 'json' }`. NOT an async loader.
> - Test assertions on invalid fixtures use **hard `toHaveLength(N)` + `toMatchObject({ data: {...} })`** — never bare `toMatchInlineSnapshot()` (auto-fills, defeats the gate).
> - All vitest invocations go through `mise exec -- pnpm vitest run …` for tool-version consistency.

## Inputs

Ask the user (or infer from invocation args):

1. **Rule ID** — kebab-case, must start with `madr/`. Example: `madr/required-sections`.
2. **Rule type** — `perFile` (default) or `project` (cross-file).
3. **Rule shape** — pick one:
   - `A` — filename / metadata-only (per-file, returns void)
   - `B` — frontmatter-only (per-file, returns void)
   - `C` — AST traversal (per-file, returns RuleListeners)
   - `D` — project rule (cross-file, ProjectRule.check())
   See Step 5 for examples. Shapes A/B/C → `type: 'perFile'`, Shape D → `type: 'project'`.
4. **MADR version compat** — array of `v2`, `v3`, `v4` (default: all three).
5. **Recommended preset severity** — `error` (default for spec-grounded rules), `warn`, or `off`.

If the rule needs to validate something across versions where MADR conventions differ (e.g. v2 uses `## Context and Problem Statement` but v3+ moved sections around — verify against the upstream MADR template before writing the spec), explicitly enumerate per-version expectations in spec.md.

`<kebab>` is the part after `madr/`. `<camel>` is camelCase (e.g. `required-sections` → `requiredSections`, `no-broken-links` → `noBrokenLinks`).

## Procedure

### Step 1: Verify project state

- cwd is the madr-lint repo root (look for `package.json` with `"name": "madr-lint"`)
- working tree is clean (`git status --porcelain` empty); abort if dirty
- `mise exec -- pnpm vitest --version` works (else run `mise exec -- pnpm install` first)
- `src/rules/<kebab>/` does not already exist (else stop and ask the user — re-running the skill would overwrite)

### Step 2: Create directories

```bash
mkdir -p src/rules/<kebab>
mkdir -p tests/rules
mkdir -p tests/fixtures/<kebab>/valid
mkdir -p tests/fixtures/<kebab>/invalid
mkdir -p benchmarks/<kebab>/fixtures
```

### Step 3: Generate the RED-phase files

The CONTENTS depend on the chosen rule shape. The skeletons below stay empty enough that gate #2 (Step 10) fires correctly when the user has not yet implemented the rule.

**`src/rules/<kebab>/spec.md`** — Given/When/Then in plain prose:

- The MADR aspect this rule enforces. **Cite the MADR template URL for each version in your `versionCompat`** (e.g. https://github.com/adr/madr/blob/develop/template/adr-template.md). Do not infer from memory.
- For each version, list the EXACT valid section names / status values / date format / etc. that count as "valid" for this rule.
- Diagnostic shape: `messageId(s)`, `data` payload fields (define them — do NOT copy filename-format's `{ filename, expected }`; pick the shape your spec needs), default severity.
- Concrete examples (good / bad) — these become the fixtures.

**`src/rules/<kebab>/schema.json`** — AJV draft-07 schema. **The schema must declare every option key listed in `defaultOptions`** (see the option/schema/default coupling check at Step 3.5). Skeleton:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "<optionName>": {
      "type": "<type>",
      "description": "<what it controls>"
    }
  }
}
```

**`tests/fixtures/<kebab>/valid/<slug>.md`** and **`invalid/<slug>.md`** — concrete ADR markdown files. Valid: zero diagnostics. Invalid: exactly the diagnostic from spec.md.

**`tests/rules/<kebab>.test.ts`** — for **per-file rules (Shape A/B/C)** use the directory-based valid/invalid pattern below. For **project rules (Shape D)** use the inline-files pattern (see `tests/rules/no-duplicate-numbering.test.ts` as the canonical example).

For **per-file rules**:

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/<kebab>/index.js';

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
        expect(diagnostics, `expected at least one diagnostic for ${file}`).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleName: 'madr/<kebab>',
          messageId: '<messageId>',
          severity: 'error',
          path: file,
          data: {
            // Replace this with the EXACT data fields your spec.md
            // declared. Do NOT keep this comment in the committed file.
          },
        });
      });
    }
  });
});
```

For **project rules (Shape D)** — fixtures are constructed inline because the rule sees multiple files at once:

```typescript
import { describe, it, expect } from 'vitest';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/<kebab>/index.js';

function file(path: string, content = '# x\n') {
  return buildProjectFile({ path, content });
}

describe('madr/<kebab>', () => {
  it('valid project — no diagnostics', () => {
    const files = [file('0001-a.md'), file('0002-b.md')];
    expect(runRulesOnProject([rule], files)).toEqual([]);
  });

  it('invalid project — reports <messageId>', () => {
    const files = [/* ... a configuration that should trigger ... */];
    const diagnostics = runRulesOnProject([rule], files);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      ruleName: 'madr/<kebab>',
      messageId: '<messageId>',
      severity: 'error',
      path: '<which file the diagnostic attaches to>',
      data: { /* spec-defined fields */ },
    });
  });
});
```

### Step 3.5: Schema / defaultOptions / fixture coupling check

Before invoking vitest, sanity-check three things — getting them out of sync makes Step 10 RED for the wrong reason:

1. **Every key in `defaultOptions` must be declared in `schema.json` `properties`.** AJV runs in `strict: true` mode and rejects unknown options because of `additionalProperties: false`. If `defaultOptions: { sections: [...] }` but `schema.json: { properties: {} }`, AJV throws `RuleOptionsError` at runtime (not a `toHaveLength` failure — different RED, masks the real problem).

2. **Invalid fixtures must trigger the rule's logic with `defaultOptions` only** (the test does not pass per-rule `options`). For Shape C rules requiring options, set the values in `defaultOptions` so a fresh `runRule` call exercises the rule.

3. **Fixture file names in `valid/` and `invalid/` should not collide with each other** (vitest `it()` titles are filenames; duplicates across describe blocks are allowed but confusing).

### Step 4: Confirm RED — gate #1

```bash
mise exec -- pnpm vitest run tests/rules/<kebab>.test.ts
```

Look for ONE of these in output:
- `Failed Suites N` (import error — expected)
- `Tests  N failed` (assertion failure — expected)

If the output says `Tests  no tests` or `0 tests`: **skill failure** — the test was generated but never imported the rule (typo in path). Stop, fix, retry.

If exit code 0: **skill failure** — the test passed without an impl, meaning it does not exercise the rule. Stop, report.

### Step 5: Generate the rule stub (intentionally still RED)

Pick the matching shape for input #3. The stub MUST stay empty — do not write impl logic. The user (or Claude in a later turn) implements GREEN.

Four shapes are supported. **Shapes A, B, C are per-file rules** (`Rule<TOptions>` with `create()`); **Shape D is the cross-file project rule** (`ProjectRule<TOptions>` with `check()`). Project rules go through a different runner (`runRulesOnProject`) — `meta.type` must be `'project'`.

**Shape A — filename / metadata-only:**

```typescript
import type { Rule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface <Camel>Options extends Record<string, unknown> {
  // <option fields per spec.md>
}

const rule: Rule<<Camel>Options> = {
  meta: { /* ...common shape below, type: 'perFile'... */ },
  create(_context) {
    // GREEN phase: read context.file.path / context.options, call context.report().
  },
};

export default rule;
```

**Shape B — frontmatter / metadata-only:**

```typescript
create(_context) {
  // GREEN phase: read context.metadata (combined frontmatter + v2 bold-list,
  // see ADR-0006), validate fields, call context.report().
  //
  // Use context.frontmatter ONLY when the rule must validate strict YAML
  // shape (e.g. a hypothetical `frontmatter-shape` rule). For format-
  // agnostic field reads (status, date, decision-makers) use metadata —
  // it gives the rule v2 + v3 + v4 compatibility for free.
}
```

**Shape C — AST traversal:**

```typescript
import type { Rule, RuleListeners, MdastNode } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface <Camel>Options extends Record<string, unknown> {
  // <option fields>
}

const rule: Rule<<Camel>Options> = {
  meta: { /* ...common shape below, type: 'perFile'... */ },
  create(_context): RuleListeners {
    // GREEN phase: return { enter: { ... }, exit: { ... } } subscribing to
    // mdast node types. See "Shapes" appendix for a worked example.
    return {};
  },
};

export default rule;
```

**Shape D — project rule (cross-file):** for rules that need access to ALL files at once (numbering uniqueness, supersedes graphs, link rot).

```typescript
import type { ProjectRule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface <Camel>Options extends Record<string, unknown> {
  // <option fields>
}

const rule: ProjectRule<<Camel>Options> = {
  meta: { /* ...common shape below, type: 'project'... */ },
  check(_context) {
    // GREEN phase: read _context.files (each ProjectFile has path,
    // content, frontmatter, ast). Build any needed cross-file index,
    // then iterate and report. Use _context.report({ messageId, path,
    // data }) — `path` is REQUIRED (no current-file context).
  },
};

export default rule;
```

**Project rule API differences (vs per-file)**:
- `meta.type === 'project'`, no `'perFile'`
- `check(context)` instead of `create(context)`; called once with all files
- `context.files: readonly ProjectFile[]` — each pre-parsed (frontmatter + AST)
- `context.report({ messageId, path, data })` — **`path` is required**; the runner does not auto-fill it because there is no current-file context
- See [ADR-0005](../../../docs/adr/0005-project-rule-api.md) and `src/rules/no-duplicate-numbering/index.ts` for a worked example

**Common meta shape:**

```typescript
const rule: Rule<<Camel>Options> = {
  meta: {
    name: 'madr/<kebab>',
    type: '<perFile|project>',
    versionCompat: ['<v2|v3|v4>'],
    docs: {
      description: '<one-line description>',
      url: 'https://knktkc.github.io/madr-lint/rules/<kebab>/',
      recommended: <true|false>,
    },
    messages: {
      // <messageId>: '<template with {{placeholders}}>'
    },
    defaultOptions: {
      // <defaults — every key must be in schema.json>
    },
    schema,
  },
  create(_context) {
    // GREEN phase: see shape-specific body above.
  },
};
```

### Step 6: Helpers — already wired

The runner in `src/core/runner.ts` already handles everything an AST-based rule needs: gray-matter frontmatter parsing, `mdast-util-from-markdown` body parsing (per ADR-0002), single-pass visitor dispatch from listeners returned by `create()`, AJV-validated options, and per-rule error isolation (a buggy rule throws → captured as `core/internal-error` diagnostic, other rules continue).

For **project rules (Shape D)**, the runner exposes `runRulesOnProject(rules, files, runtime)` and `buildProjectFile({ path, content })`. Tests construct file arrays inline (see `tests/rules/no-duplicate-numbering.test.ts`). The orchestrator in `src/core/lint.ts` partitions rules by kind via `isProjectRule` and dispatches to the right runner — no helper changes needed when adding a rule, regardless of shape.

### Step 7: Generate the benchmark stub

For **per-file rules (Shape A/B/C)** — `benchmarks/<kebab>/bench.ts`:

```typescript
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.js';
import rule from '../../src/rules/<kebab>/index.js';

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

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
```

Plus minimal `benchmarks/<kebab>/fixtures/{tiny,typical}.md` corpora.

For **project rules (Shape D)** — `benchmarks/<kebab>/bench.ts`:

```typescript
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/<kebab>/index.js';
import type { ProjectFile } from '../../src/core/types.js';

// Synthesize a ProjectFile[] corpus of N ADRs for the rule under test.
// Adjust frontmatter/content per the rule's input dependencies (e.g.
// supersedes graph, link content). See benchmarks/no-duplicate-numbering/
// or benchmarks/supersedes-bidirectional/ for working examples.
function makeCorpus(count: number): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (let i = 1; i <= count; i++) {
    const num = i.toString().padStart(4, '0');
    files.push(buildProjectFile({ path: `${num}-bench.md`, content: '# x\n' }));
  }
  return files;
}

const tiny = makeCorpus(10);
const typical = makeCorpus(100);

const bench = new Bench({ time: 500 });
bench
  .add('madr/<kebab> — 10 files', () => {
    runRulesOnProject([rule], tiny);
  })
  .add('madr/<kebab> — 100 files', () => {
    runRulesOnProject([rule], typical);
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
```

Project rules don't need separate fixture files — the corpus is synthesized in code.

### Step 8: Update registry and recommended preset

- Append to `src/rules/index.ts`:
  ```typescript
  export { default as <camel> } from './<kebab>/index.js';
  ```
  Example for `madr/required-sections`:
  ```typescript
  export { default as requiredSections } from './required-sections/index.js';
  ```
- Append the severity entry (input #5) to `src/configs/recommended.ts`:
  ```typescript
  'madr/<kebab>': '<severity>',
  ```

### Step 9: Generate the docs stub

`website/src/content/docs/rules/<kebab>.md` AND its JA translation `website/src/content/docs/ja/rules/<kebab>.md` with: Description, Rationale, Examples (good/bad — one example per fixture, with a one-line "why" each), Options table, MADR version compat table, "When to disable", and the standard inline-suppression note. Add both pages to the sidebar in `website/astro.config.mjs`.

### Step 10: Re-run vitest — confirm *different* RED — gate #2

```bash
mise exec -- pnpm vitest run tests/rules/<kebab>.test.ts
```

For an empty stub:
- **Shape A/B**: invalid fixtures fail at `toHaveLength(1)` (no diagnostics emitted). Valid fixtures pass.
- **Shape C**: `create()` returns `{}` — `runRulesOnFile` sees a non-undefined return, walks the AST, but no listeners fire. invalid fixtures still fail at `toHaveLength(1)`.

If all tests pass at this point: **skill failure**. Either the test asserts nothing meaningful, or the stub silently emits something. Stop and report.

### Step 11: Hand off to user

Print:

```
Scaffold complete for madr/<kebab>.

Files created:
  - src/rules/<kebab>/{spec.md, index.ts, schema.json}
  - tests/rules/<kebab>.test.ts
  - tests/fixtures/<kebab>/{valid,invalid}/*.md
  - benchmarks/<kebab>/{bench.ts, fixtures/*.md}
  - website/src/content/docs/{,ja/}rules/<kebab>.md
Registry & recommended preset updated.

RED state confirmed (N tests failing at toHaveLength(1)).
Next steps (GREEN phase):
  1. Implement src/rules/<kebab>/index.ts so each invalid fixture
     produces the expected diagnostic with the data shape from spec.md.
  2. Run `mise exec -- pnpm vitest run tests/rules/<kebab>.test.ts`
     until all tests pass.

Discipline: do NOT modify tests/rules/<kebab>.test.ts after this point —
the test is the contract, the impl follows it.
```

## Hard rules

- MUST run vitest at Step 4 (gate #1) and Step 10 (gate #2). Skipping either breaks TDD.
- MUST NOT write the rule's implementation logic. `create()` body stays empty (or `return {}` for Shape C) until the user takes over.
- MUST NOT use bare `toMatchInlineSnapshot()` in the generated test — only hard assertions (`toHaveLength` + `toMatchObject({ data: {...} })`).
- MUST refuse to proceed if either RED gate produces a green test.
- MUST use `.js` extensions in all generated imports.
- MUST use static `import schema from './schema.json' with { type: 'json' }` — never the async-loader form.
- MUST verify Step 3.5 coupling before running the gates (avoids `RuleOptionsError`-as-RED false signal).

## Shapes — worked references (for the user during GREEN)

> These are GREEN-phase examples to consult AFTER the skill exits and you start implementing. They are NOT generated as part of the stub.

### Shape C — extracting heading text robustly

A heading like `## **Status**` has `heading > strong > text` shape. The naive `node.children?.[0]?.type === 'text'` skips this. Either narrow first or use `mdast-util-to-string`:

```typescript
import { toString } from 'mdast-util-to-string';

create(context): RuleListeners {
  const seen: string[] = [];
  return {
    enter: {
      heading(node) {
        if (node.type === 'heading') {
          seen.push(toString(node).trim());
        }
      },
    },
    exit: {
      root() {
        const required = (context.options.sections as string[] | undefined) ?? [];
        for (const section of required) {
          if (!seen.includes(section)) {
            context.report({
              messageId: 'missingSection',
              data: { section, found: seen },
            });
          }
        }
      },
    },
  };
}
```

If `mdast-util-to-string` is not yet installed, add it as a runtime dep before implementing the rule:

```bash
mise exec -- pnpm add mdast-util-to-string
```

The narrowing `if (node.type === 'heading')` is required for TypeScript to discriminate `MdastNode` (the union of `Root | Nodes`).

## When to invoke

- "add a new rule X"
- "create rule madr/X"
- "implement madr/X" (start here, hand off for impl)

## When NOT to invoke

- Bug in an existing rule → use `add-fixture-case` (to be created)
- Renaming/deprecating a rule → use `deprecate-rule` (to be created)
- Adding a utility (not a rule) → write tests directly, no scaffolding needed
