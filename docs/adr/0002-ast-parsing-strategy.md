---
status: accepted
date: 2026-05-01
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0002: AST parsing strategy — single-pass + mdast-util-from-markdown

## Context and Problem Statement

A linter parses each input file once and runs many rules over the resulting AST. Two architectural decisions in this space have outsized performance impact and are very expensive to retrofit:

1. Markdown parser choice (`unified+remark` vs alternatives)
2. AST traversal model (per-rule re-walk vs single-pass with visitor registry)

Investigation in May 2026 found:

- `unified+remark` is ~25-29x slower than `markdown-it-ts` for raw parse on small documents (March 2026 benchmarks published with `markdown-it-ts`)
- ESLint's "per-rule re-walk via context.getAncestors()" model is the dominant overhead in the JS linter ecosystem; Biome and oxlint both dispatch via shared single-pass walks (Biome's analyzer system, oxlint's AstTypesBitset)
- madr-lint's planned scale is 5000+ ADR monorepos — both decisions must favor performance

## Decision Drivers

- **Performance budgets**: M2 needs <100ms cold for 100 ADRs, M3 needs <4s for 5000 ADRs (CLAUDE.md)
- **Retrofit cost**: changing the AST traversal model later means rewriting every rule
- **Plugin needs**: madr-lint does not need GFM/MDX/HTML extensions — only standard CommonMark + YAML frontmatter
- **Bundle size**: `unified+remark` pulls a large transitive tree
- **Engineering effort**: must remain feasible for a solo maintainer

## Considered Options

1. `unified+remark` pipeline + per-rule `unist-util-visit` — ESLint-shaped, conventional but slow
2. **`mdast-util-from-markdown` direct + single-pass visitor registry** — this decision
3. `markdown-it-ts` direct + custom AST adapter — fastest but loses mdast ecosystem
4. `micromark` direct (lower-level than mdast) + custom AST construction

## Decision Outcome

採択: **Option 2 — `mdast-util-from-markdown` direct + single-pass visitor registry**

### Rationale

- Skips the `unified` Processor overhead while retaining mdast (the de facto Markdown AST in JS)
- `gray-matter` for frontmatter extraction → body to `fromMarkdown` → single mdast tree per file
- Rules export `{ enter: { heading, link, ... } }` keyed by mdast node type
- Runner walks the tree once per file, dispatching to all subscribed rules
- `perFile` rules are pure (parallelizable); `project` rules consume a pre-built index — locks in parallelism from day one for the future `--workers=N` flag (M3)
- Best balance of speed, ecosystem familiarity, and engineering effort

### Rejected alternatives

- **Option 1 (`unified+remark`)**: too slow at scale; we don't need the plugin pipeline
- **Option 3 (`markdown-it-ts`)**: loses the mdast ecosystem; every rule needs an AST shape adapter
- **Option 4 (`micromark`)**: too low-level; reinvents mdast construction for marginal gain

## Implementation status

This ADR was adopted on 2026-05-01. Implementation lands incrementally:

| Aspect | Status (as of 2026-05-01, M0) |
|---|---|
| `RuleListeners` type with enter/exit | **defined** in `src/core/types.ts` |
| Generic `Rule<TOptions>` accepting `RuleListeners \| void` | **wired** (`madr/filename-format` returns void) |
| Single-pass runner walking mdast and dispatching to listeners | **pending** (M1, with first AST-using rule) |
| `mdast-util-from-markdown` direct call | dependency **installed**, not yet imported |
| `gray-matter` for frontmatter | dependency **installed**, not yet imported |
| `perFile` rule path | **wired** (filename-format) |
| `project` rule path | **pending** (M2 cross-file rules) |
| Pre-compiled AJV options validation | dependency **installed**, integration **pending** (Round 3 of post-review fixes) |
| `safe-regex2` ReDoS guard in CI | dependency **installed**, CI integration **pending** |
| Content-hash cache | **pending** (M2+) |

The first AST-using rule (`madr/required-sections`) is the trigger for the runner to grow: parse pipeline, single-pass dispatch, listener invocation. Until then, `runRule` in `tests/helpers/run-rule.ts` accepts only filename / metadata-style rules that report from `create()` directly.

## Consequences

### Positive

- ~25-29x faster parse vs `unified+remark`
- Single mdast tree shared by all rules per file → eliminates per-rule re-walk overhead
- `perFile`/`project` rule split locks in file-level parallelism for `--workers=N` flag
- Smaller transitive dependency tree
- Rule API maps cleanly onto known patterns (similar to ESLint's `enter/exit` but with shared dispatch)

### Negative / Trade-offs

- No `remark-gfm`, `remark-frontmatter`, `remark-lint-*` plugin reuse — must implement extensions manually if needed
- Rule API differs from ESLint convention — slight learning curve for ESLint plugin authors
- `mdast-util-from-markdown` is a lower-level API than `unified` — less example documentation; we mitigate by maintaining `docs/rules/_template.md` and inline JSDoc

### Mitigations

- madr-lint focuses on standard CommonMark + YAML frontmatter; no GFM table/strikethrough needed for ADR validation
- Rule API is documented in `CLAUDE.md` and a `docs/rules/_template.md` template
- If a future requirement needs a remark plugin specifically, we can adapt that plugin's logic into a visitor without re-pipelining

## Links

- ADR-0001: TypeScript + Node 22 + pnpm runtime
- mdast-util-from-markdown: https://github.com/syntax-tree/mdast-util-from-markdown
- gray-matter: https://github.com/jonschlinkert/gray-matter
- markdown-it-ts (March 2026 benchmark): https://www.npmjs.com/package/markdown-it-ts
- Biome architecture: https://deepwiki.com/biomejs/biome/4-analyzer-and-linter-system
- oxlint architecture: https://oxc.rs/docs/guide/usage/linter
- Inside Oxlint: Linter Architecture and Rule System: https://readoss.com/en/oxc-project/oxc/inside-oxlint-linter-architecture-and-rule-system
