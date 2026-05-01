---
status: accepted
date: 2026-05-01
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0005: Project rule API design

## Context and Problem Statement

M2 introduces cross-file rules: numbering uniqueness, supersedes-bidirectional integrity, link rot. None of these can be expressed as `Rule<TOptions>` (per-file shape) because they need to see all files at once.

ADR-0002 promised a "two-tier rule API": `perFile` rules and `project` rules. The `RuleMeta.type` field already exists with both values, but only the `perFile` path was wired through M1. M2 needs the `project` path implemented and committed to before more cross-file rules can land.

## Decision Drivers

- M2 has 4 candidate cross-file rules; all need access to multiple files' paths/frontmatter/AST simultaneously
- Per-file rules pay zero parse cost when filename-style; project rules need ALL files parsed eagerly
- Existing `Rule<TOptions>` API is per-file shaped (`create(context: RuleContext)` per file) — incompatible with cross-file logic
- `Diagnostic.path` is per-file context for `Rule`; `ProjectRule` needs to attach diagnostics to specific files explicitly
- Type safety: a single union of "per-file or project" forces narrowing at every consumer site

## Considered Options

1. **Extend `Rule<TOptions>` with a `meta.type === 'project'` discriminant; same `create()` shape, called once with all files**
2. **Introduce separate `ProjectRule<TOptions>` interface with a `check(context: ProjectRuleContext)` method** — this decision
3. **Use AST visitor `exit:'root'` on every file + accumulator pattern** (single rule type, project rules implemented as per-file rules with shared mutable state)

## Decision Outcome

Adopted: **Option 2 — separate `ProjectRule<TOptions>` interface**

### Rationale

- **Type safety**: `Rule` and `ProjectRule` have different context shapes (`RuleContext` with single `FileContext` vs `ProjectRuleContext` with `readonly ProjectFile[]`). Union'ing them under one type forces narrowing in every consumer.
- **Distinct runtimes**: per-file rules go through `runRulesOnFile` (single-pass AST per file, lazy parse path); project rules go through `runRulesOnProject` (eager all-files parse + single check call). Distinct functions match distinct semantics.
- **Different `report()` contract**: per-file `RuleContext.report()` auto-fills `path` from the current file. `ProjectRuleContext.report()` requires the caller to specify `path` because the rule may report on any file. This contract is incompatible with a unified type.
- **Ecosystem precedent**: ESLint's project-level concerns (e.g. cross-file no-cycle) are handled via plugins or external tooling, not the per-file Rule API. Biome's graph-aware analyses are also separately wired.

### Rejected alternatives

- **Option 1 (discriminated union)**: `meta.type` discrimination forces narrowing at every consumer; the `report()` API differs anyway, so the unification is shallow. Net cost without the benefit.
- **Option 3 (visitor accumulator)**: every project rule re-implements file aggregation; AST `exit:'root'` fires per-file, not after-all-files. Rules would need module-level mutable state to accumulate, which conflicts with the runner's per-call isolation guarantees.

## API surface

```typescript
// src/core/types.ts (post-decision)

export interface ProjectFile {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  ast: Root;
}

export interface ProjectRuleContext<TOptions = Record<string, unknown>> {
  files: readonly ProjectFile[];
  options: TOptions;
  /** path is REQUIRED — runner has no current-file context. */
  report(diagnostic: Omit<Diagnostic, 'ruleName' | 'severity'>): void;
}

export interface ProjectRule<TOptions = Record<string, unknown>> {
  meta: RuleMeta<TOptions>;  // meta.type === 'project'
  check(context: ProjectRuleContext<TOptions>): void;
}

export type AnyRule<TOptions = ...> = Rule<TOptions> | ProjectRule<TOptions>;

export function isProjectRule(rule: AnyRule): rule is ProjectRule { ... }
```

`runRulesOnProject(rules, files, runtime)` in `src/core/runner.ts`:

- Validates each rule's options via AJV (same WeakMap-cached validators as `runRulesOnFile`)
- For each rule: try `rule.check(context)` catch as `core/internal-error` diagnostic with `operation: 'check'`
- Caller is responsible for pre-parsing files into `ProjectFile`. Helper `buildProjectFile()` exposed for tests.

`lint.ts` orchestration:

- Reads each file's content once
- Partitions rules via `isProjectRule`: `Rule[]` go to per-file pass, `ProjectRule[]` go to project pass
- Per-file pass: existing `runRulesOnFile` for each file, grouped by severity
- Project pass: build all `ProjectFile`s, run `runRulesOnProject` once per severity group

## Consequences

### Positive

- Type-safe API; minimal narrowing at consumer sites
- Distinct runner functions — per-file vs all-files-aggregated semantics are explicit
- Each project rule sees a stable `ProjectFile` shape (path, content, frontmatter, AST) without re-parsing
- Existing per-file rules and tests unaffected
- `report({ path })` makes diagnostic attribution explicit for cross-file rules

### Negative

- Two rule "kinds" in the registry — registry consumers must handle both
- Eager parsing for the project pass (no lazy path) — perf cost at scale, addressed in M2 milestones (5000-file target)
- `recommended` preset uniform `Record<string, RuleSeverity>` — rule ID alone does not reveal the kind (must inspect the rule object)

## Implementation status (M2 in progress)

| Aspect | Status |
|---|---|
| `ProjectRule` / `ProjectRuleContext` / `ProjectFile` / `AnyRule` / `isProjectRule` types | **wired** in `src/core/types.ts` |
| `buildProjectFile()` helper (eager parse) | **wired** in `src/core/runner.ts` |
| `runRulesOnProject(rules, files, runtime)` | **wired** in `src/core/runner.ts` (5 tests in `tests/core/runner.test.ts`) |
| `lint.ts` partitioning | **wired** — file content read once, shared between passes |
| `madr/no-duplicate-numbering` (first project rule) | **wired** (7 tests) |
| `madr/supersedes-bidirectional` | **pending** (M2) |
| `madr/no-broken-links` | **pending** (M2) |
| `madr/no-numbering-gap` (warning, opt-in) | **pending** (M2) |

## Links

- ADR-0002: AST parsing strategy (the original two-tier promise)
- src/core/types.ts (type definitions)
- src/core/runner.ts (runRulesOnProject)
- docs/rules/no-duplicate-numbering.md (first project rule)
