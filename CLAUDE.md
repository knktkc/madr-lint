# madr-lint Project Conventions

This file is auto-attached to every Claude Code session in this repository. It captures the project-wide conventions, architectural decisions, and development discipline.

## Project overview

`madr-lint` is a TypeScript linter for [MADR](https://adr.github.io/madr/) (Markdown Architectural Decision Records). It validates ADR file structure, naming, status enums, dates, and cross-file integrity.

- **Distribution**: npm CLI, library, GitHub Action
- **License**: MIT
- **Status**: Pre-1.0 development. Currently Private repo, going Public at v0.1.0.

## Architecture principles (locked at v0.1.0)

These decisions are very expensive to retrofit. They are baked into the rule API and runner from day one. Implementation lands incrementally — the **Status** lines below show what is shipped today vs aspirational.

> **Status legend**:
> - **defined** — type / interface declared in code, not yet exercised at runtime
> - **wired** — actually invoked at runtime
> - **pending** — dependency installed but not yet integrated, or not yet started

1. **Single-pass AST traversal with visitor registry**. Rules export `RuleListeners { enter, exit }` keyed by mdast node type (see `src/core/types.ts`). The runner walks each file's tree once, dispatching to all subscribed rules. Never `unist-util-visit` per-rule. See ADR-0002.
   - **Status (M0)**: type **defined**; runner **pending** (lands with first AST-using rule in M1)

2. **`mdast-util-from-markdown` direct, NOT `unified+remark`**. Skip the `unified` Processor overhead (~25-29x slower per March 2026 benchmarks). Use `gray-matter` for frontmatter, then feed body to `fromMarkdown`. See ADR-0002.
   - **Status (M0)**: dependencies **installed**; not yet wired into the runner

3. **Two-tier rule API**: `perFile` rules are pure (file content + AST → diagnostics, parallelizable). `project` rules (numbering uniqueness, supersedes graph, link rot) consume a pre-built index built once from per-file outputs. Locks in parallelism from day one.
   - **Status (M0)**: `RuleMeta.type` field **defined**; perFile path **wired** (`madr/filename-format`); project path **pending**

4. **Pre-compile AJV schemas + regex at config load time**. ReDoS-guarded via `safe-regex2` in CI. Per-file regex execution has a 5ms soft budget.
   - **Status (M0)**: AJV and safe-regex2 **installed**; AJV integration **pending** (post-review Round 3); ReDoS check **pending** CI integration

5. **Content-hash cache** at `.madr-lint/cache/`, key = `sha1(content + rule-version-vector + config-hash)`. Persistent across runs.
   - **Status (M0)**: **pending**; targeted at M2+

## TDD discipline (ADR-0003)

**Strict Red-Green-Refactor.** Every rule, every utility, every bug fix:

1. Write a failing test first. Run vitest. Confirm RED.
2. Write the minimum code to pass. Run vitest. Confirm GREEN.
3. Refactor with all tests green. Run vitest after each step.

The `add-rule` skill enforces RED mechanically: it scaffolds spec + fixtures + failing test, runs vitest, refuses to proceed if RED is not produced.

Use `tdd-loop` skill (vitest --watch) during active rule development.

## Performance discipline

Linters live or die by speed. Performance is treated as a feature, not an afterthought.

**Targets:**

| Milestone | Cold lint | Warm (cache hit) | Memory |
|---|---|---|---|
| M1 (v0.1.0) | bench framework live, trend collection | — | — |
| M2 (v0.2.0) | 100 ADRs <100ms p95, 1000 ADRs <800ms | <30ms (100 ADRs) | — |
| M3 (v0.3.0) | 5000-file monorepo <4s | <500ms | RSS <500MB |

**Discipline:**

- Every rule has a benchmark stub at `benchmarks/<rule>/bench.ts`
- `perf-regression-check` runs in CI; PR blocks at ≥10% slowdown, warns at 5-10%
- Baselines committed in-repo at `benchmarks/<rule>/baseline.json`. CI never auto-updates baselines (manual via `bench-rule --update-baseline`)

## Rule authoring conventions

- **ID format**: `madr/<kebab-case>`, e.g., `madr/required-sections`. ESLint-style. No `MADR001` numbering.
- **Severity**: every rule supports `error | warn | off`. Defaults set in `recommended` preset.
- **Options**: every rule accepts an options object validated by an AJV schema. Defaults defined in rule meta.
- **MADR version awareness**: rules respect the configured `madrVersion` (`v2 | v3 | v4 | auto`). Use `versionMap[version]` for spec lookup.

## Directory structure

```
src/
├── core/          # Runner, parser, reporter, cache, severity resolver
├── rules/         # One subdir per rule: index.ts + schema.json + spec.md
├── configs/       # Preset configs (recommended.ts)
├── versions/      # MADR v2/v3/v4 spec maps
└── cli.ts         # citty entry point

tests/
├── rules/         # vitest tests, one file per rule
├── fixtures/      # File-per-case ADR fixtures
└── helpers/       # runRule(), loadFixture()

benchmarks/        # tinybench/mitata, baseline.json per rule
profiles/          # 0x flamegraphs (gitignored except baseline)
docs/
├── adr/           # This project's own ADRs (dogfooding, MADR v4 frontmatter)
└── rules/         # Per-rule documentation
```

## Configuration file

`madr-lint.config.ts` (TypeScript, ESM) is canonical. JSON `.madrlintrc.json` is supported as a fallback.

```typescript
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  madrVersion: 'auto',
  adrDir: 'docs/adr',
  rules: {
    'madr/required-sections': 'error',
    'madr/no-numbering-gap': 'off',
  },
});
```

## Workflow

- **Branching**: feature branches off main, PR review (solo for now). All PRs run lint + typecheck + test + perf-regression-check.
- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`). Co-Authored-By for Claude assistance.
- **Releases**: changesets-driven via `release-cut` skill. npm OIDC trusted publishing + provenance. No long-lived NPM_TOKEN.

## Coding style

- TypeScript strict mode, `verbatimModuleSyntax: true`
- ESM only (Node 23+ can `require()` ESM, dual-package hazard avoided)
- No barrel exports of internal modules — explicit imports
- No `any`. Use `unknown` + narrowing
- Comments only for non-obvious WHY (not WHAT)

## Tooling

- pnpm (mise-managed)
- tsup for build (ESM, dual entry: `index` + `cli`)
- vitest for tests (with `expect.soft`, `test.for`, `toMatchInlineSnapshot`)
- oxlint for code lint
- AJV for JSON Schema (pre-compiled)
- citty for CLI
- tinybench / mitata for benchmarks
- 0x or clinic.js for flame graphs (dev-only)
- safe-regex2 in CI for ReDoS detection

## ADR index (own dogfooding)

ADRs use **MADR v4 frontmatter** format (this project's recommended target).

- ADR-0001: TypeScript + Node 22 + pnpm runtime
- ADR-0002: AST parsing strategy (single-pass + mdast-util-from-markdown)
- ADR-0003: TDD discipline as project convention
- ADR-0004: Tooling adjustments (pnpm 10, vitest 4)
