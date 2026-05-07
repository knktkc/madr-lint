---
status: accepted
date: 2026-05-07
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0006: v2 bold-list metadata bridge

## Context and Problem Statement

MADR v2 ADRs declare metadata as a **bold-list** in the body:

```markdown
# ADR-0001: Title

- **Status**: Proposed
- **Date**: 2026-05-01
- **Deciders**: knktkc

## Context and Problem Statement
...
```

MADR v3/v4 moved to YAML **frontmatter**:

```markdown
---
status: proposed
date: 2026-05-01
decision-makers:
  - knktkc
---

# ADR-0001: Title
...
```

The current runner (`src/core/runner.ts`) exposes only `context.frontmatter` — populated from YAML via `gray-matter`. Two M1 rules (`madr/status-enum`, `madr/date-iso8601`) read it directly and treat its absence as `missingStatus` / `missingDate`. As a result, every v2 ADR triggers spurious diagnostics from those rules.

The parent project `frontend-implementation-boilerplate` uses **v2 bold-list** format, so these rules are currently unusable there. The roadmap M4 milestone is "Frontmatter v3/v4 full support + v2 bold-list compatibility" — this ADR addresses the v2 side.

## Decision Drivers

- **Parent project compatibility**: `frontend-implementation-boilerplate` ships ADRs in v2 form. The linter must work there to satisfy M5.
- **Single rule, multiple formats**: rule authors should not implement v2 vs v4 branching in every rule.
- **Don't conflate semantics**: `context.frontmatter` historically meant "YAML metadata"; users with mixed-mode files (rare but valid) should be able to distinguish.
- **Bounded scope**: v2 metadata is structurally simple (a flat list of `Key: value` pairs). A general-purpose Markdown body parser is overkill.

## Considered Options

1. **Bridge in runner** — extract bold-list and inject into `context.frontmatter`. Rules see one field regardless of format.
2. **Per-rule branch** — each rule reads `context.madrVersion` and implements its own bold-list extraction.
3. **Hybrid (chosen)** — runner exposes BOTH `frontmatter` (YAML only, current semantics preserved) AND a new `metadata` field that combines frontmatter with extracted bold-list. Rules choose which to read.

## Decision Outcome

Adopted: **Option 3 — `context.metadata` as a combined view**

### Rationale

- **`frontmatter` semantics preserved**: rules that intentionally validate YAML-only behavior (e.g. a hypothetical `madr/frontmatter-shape`) keep working unchanged.
- **`metadata` is the "everyday" field**: rules that don't care about format (status enum, date format, decision-makers presence) read `metadata` and become version-agnostic.
- **Per-rule choice is explicit**: rule authors pick the field name based on intent. No magic.
- **Composable with future formats**: a hypothetical v5 with TOML frontmatter or HTML comments could feed into `metadata` without changing rule code.

### Rejected alternatives

- **Option 1 (overload `frontmatter`)**: lossy. A v3 ADR with empty bold-list and full frontmatter would behave identically to a v2 ADR with no frontmatter — but the user-facing "what format am I using?" semantics would be erased. Plus rules that currently treat frontmatter absence as a signal would silently change behavior.
- **Option 2 (per-rule branch)**: every rule reimplements list traversal + key normalization, leading to subtle disagreements (e.g. case sensitivity of `Decision-makers` vs `decision-makers`). Centralizing in the runner enforces one canonical form.

## API surface

### Types (`src/core/types.ts`)

```typescript
export interface RuleContext<TOptions = ...> {
  file: FileContext;
  /** YAML frontmatter (v3/v4). null if absent. UNCHANGED. */
  frontmatter: Record<string, unknown> | null;
  /**
   * Combined metadata: YAML frontmatter merged with v2 bold-list
   * extracted from body. Frontmatter wins on key conflict.
   * null only when both are absent.
   */
  metadata: Record<string, unknown> | null;
  options: TOptions;
  report(diagnostic: Omit<Diagnostic, 'ruleName' | 'severity' | 'path'>): void;
}

export interface ProjectFile {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;  // unchanged
  metadata: Record<string, unknown> | null;      // new
  ast: Root;
}
```

`ProjectRuleContext.files[i]` thus exposes both `frontmatter` and `metadata`.

### Parser (`src/core/parser.ts`)

```typescript
export interface ParsedFile {
  frontmatter: Record<string, unknown> | null;
  boldListMetadata: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null; // merged view
  ast: Root;
  body: string;
}

export function parseFile(content: string): ParsedFile;
```

Backward compat: existing `parseFile` callers that read `frontmatter` and `ast` keep working. The new `boldListMetadata` and `metadata` fields are additive.

### Runner

`runRulesOnFile` and `runRulesOnProject` populate `context.metadata` lazily (same pattern as `context.frontmatter` getter). Project rules' `ProjectFile` instances get `metadata` eagerly populated by `buildProjectFile`.

## Bold-list extraction rules

The extractor walks the mdast root and:

1. Find the first `list` node before any heading deeper than H1 (i.e. before `## ...`).
2. For each `listItem` in that list:
   - First child must be a `paragraph`.
   - Paragraph's children must start with a `strong` node containing exactly one `text` child whose value matches `^[A-Za-z][A-Za-z0-9 \-_]*$` (Key).
   - Following the strong, expect a `text` node whose value starts with `: ` or `:` (separator).
   - Remaining inline content (including links, emphasis, code) is joined via `mdast-util-to-string` and trimmed → Value.
3. Key normalization: trim → lowercase → spaces become hyphens (`Decision Makers` → `decision-makers`, matching v4 frontmatter).
4. Multiple items with the same normalized key: first wins (stable across re-parse). Document this in the rule docs that depend on it.

The extractor is a pure function — testable in isolation against mdast inputs.

## Conflict resolution

When a single ADR has BOTH frontmatter AND a bold-list (rare, but possible during migration):

- `metadata = { ...boldListMetadata, ...frontmatter }` — **frontmatter wins**.
- Rationale: frontmatter is structured + validated by YAML; bold-list is a heuristic. The more robust source takes precedence.
- A future rule (`madr/no-mixed-metadata`) can flag this configuration if teams want to enforce one or the other; out of scope for M4.

## Consequences

### Positive

- v2 / v3 / v4 ADRs all linted by the same rules
- Existing `context.frontmatter` semantics preserved (no migration burden for strict YAML-validators)
- Centralized bold-list parsing — one canonical key normalization
- Roadmap M5 (production use in `frontend-implementation-boilerplate`) becomes possible
- The change is additive to `RuleContext` and `ProjectFile` — no breaking API change

### Negative

- Two metadata fields in context (slight cognitive load — eased by docs and the spec.md template)
- Bold-list parsing has heuristic edge cases (multi-line values, nested lists, code in keys) — out of scope, but worth documenting
- Mixed-format ADRs need a clear policy (this ADR locks in "frontmatter wins")

### Rule migration

Two rules need to switch from `context.frontmatter` to `context.metadata`:

- `madr/status-enum`: change `fm.status` → `meta.status`. Add `'v2'` to `versionCompat`.
- `madr/date-iso8601`: change `fm[options.field]` → `meta[options.field]`. Add `'v2'` to `versionCompat`.

The spec.md and docs/rules/*.md for both should be updated to reflect that v2 is now supported.

## Implementation status (M4 in progress)

| Aspect | Status |
|---|---|
| `metadata` field on `RuleContext` and `ProjectFile` | **pending** |
| Bold-list extractor in `parser.ts` | **pending** |
| `parseFile` returning `ParsedFile.metadata` | **pending** |
| Runner populates `context.metadata` | **pending** |
| `madr/status-enum` migrated to `metadata` + v2 fixtures | **pending** |
| `madr/date-iso8601` migrated to `metadata` + v2 fixtures | **pending** |
| Tests: extractor unit tests + v2 fixture tests for both rules | **pending** |
| `add-rule` skill template documents `metadata` for Shape B rules | **pending** |
| Conflict-resolution test (mixed-mode ADR) | **pending** |

## Out of scope

- v2-style `Status: superseded by ADR-NNNN` parsing in `madr/supersedes-bidirectional` (separate concern, would require parsing the value text)
- v2 link rot detection — `madr/no-broken-links` already works against any AST, no v2-specific work needed
- `madr/no-mixed-metadata` rule — defer to M4 follow-up if user demand emerges
- A migration rule that auto-converts v2 → v3 frontmatter — not a linter concern

## Links

- [ADR-0002](./0002-ast-parsing-strategy.md): AST parsing strategy
- [ADR-0005](./0005-project-rule-api.md): project rule API
- MADR v2 template: `https://github.com/adr/madr/tree/v2.1.2`
- MADR v3+ template: `https://github.com/adr/madr/blob/develop/template/adr-template.md`
- Parent project (v2 ADRs): `https://github.com/xtone/frontend-implementation-boilerplate`
