# Contributing to madr-lint

Thanks for considering a contribution. `madr-lint` is small but opinionated — please read this before opening a substantive PR.

## Development setup

```bash
# Tools (Node 22 + pnpm 10) are pinned in mise.toml
mise install
pnpm install

# Verify the local checkout
pnpm test          # vitest test suite
pnpm typecheck
pnpm lint
pnpm build
```

The project uses [TDD discipline (ADR-0003)](docs/adr/0003-tdd-discipline.md). New rules MUST start with a failing test. The `add-rule` skill (under `.claude/skills/`) automates the scaffold for both per-file and project rules.

## Adding a new rule

Pick a shape:
- **A. Filename / metadata-only** (e.g. `madr/filename-format`)
- **B. Frontmatter / metadata-only** (reads `context.metadata`; works for v2/v3/v4)
- **C. AST traversal** (returns `RuleListeners`)
- **D. Project (cross-file)** — `ProjectRule.check()` over `context.files`

See `CLAUDE.md` "Rule authoring conventions" for shape details, and `docs/adr/0005-project-rule-api.md` + `docs/adr/0006-v2-bold-list-bridge.md` for the API contracts.

Per-rule deliverables:
- `src/rules/<name>/{index.ts, schema.json, spec.md}`
- `meta.suggestions` in `index.ts` for each messageId that has a mechanical
  remediation — a map parallel to `meta.messages`, keyed the same way and
  interpolated identically. Omit a messageId when the fix is contextual
  (see `CLAUDE.md` "Rule authoring conventions").
- `tests/rules/<name>.test.ts` with hard assertions on diagnostic data shape (NEVER bare `toMatchInlineSnapshot()`)
- `tests/fixtures/<name>/{valid,invalid}/*.md` (per-file rules) or inline files (project rules)
- `benchmarks/<name>/bench.ts`
- A rule doc page at `website/src/content/docs/rules/<name>.md` (+ the Japanese
  translation at `website/src/content/docs/ja/rules/<name>.md`) — the live site
  is the per-rule doc deliverable; `meta.docs.url` points there.
- Registry entry in `src/rules/index.ts`
- Severity entry in `src/configs/recommended.ts`

## Performance baselines

Each rule has a `benchmarks/<name>/bench.ts` driven by `tinybench`. Running it produces a per-commit `<sha>.json` (gitignored) plus a long-lived `benchmarks/<name>/baseline.json` that CI compares against.

- `pnpm perf:check` runs every bench and fails on a ≥10% throughput regression vs `baseline.json` (warns at 5–10%).
- After an intentional perf change, regenerate the baseline:

  ```bash
  pnpm exec tsx benchmarks/<rule>/bench.ts
  cp benchmarks/<rule>/$(git rev-parse --short HEAD).json benchmarks/<rule>/baseline.json
  git add -f benchmarks/<rule>/baseline.json
  ```

Justify the new numbers in the PR description so the reviewer can rubber-stamp the baseline change rather than re-running the bench themselves.

## Pull requests

- One concept per PR. Mixed feature + cleanup PRs get split.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`. Scope is encouraged: `feat(rules):` or `fix(core):`.
- Add a [changeset](https://github.com/changesets/changesets) for any user-visible change: `pnpm changeset` — choose `patch`/`minor`/`major` and write a one-line summary.
- All CI jobs (Node 22 + 24 × ubuntu/macos/windows matrix, lint, typecheck,
  test, build, plus the perf-regression and ReDoS checks) must pass.

## Architectural decisions

Substantive design changes go through an **ADR** under `docs/adr/`. The format is MADR v4 frontmatter (this project dogfoods its own linter against its own ADRs). Look at `docs/adr/0001-typescript-node22-runtime.md` for a worked example.

Existing ADRs:

- ADR-0001: TypeScript + Node 22 + pnpm
- ADR-0002: AST parsing strategy (`mdast-util-from-markdown` direct + single-pass visitor)
- ADR-0003: TDD discipline as project convention
- ADR-0004: pnpm 10 + vitest 4 tooling baseline
- ADR-0005: Project rule API design (cross-file rules)
- ADR-0006: v2 bold-list metadata bridge (combined `context.metadata` field)
- ADR-0007: Baseline fingerprint design (gradual adoption)

## Sign-off (DCO)

PRs are accepted under the [Developer Certificate of Origin](https://developercertificate.org/). Add `Signed-off-by: Your Name <email>` to your commits (`git commit -s`). No CLA, no separate paperwork.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By participating, you agree to abide by it.

## Questions

Open an issue with the `question` label, or for security-sensitive topics see [SECURITY.md](SECURITY.md).
