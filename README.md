# madr-lint

A linter for [MADR](https://adr.github.io/madr/) (Markdown Architectural Decision Records).

> **Status**: Early development. Not yet ready for production use.

## Why

[MADR](https://github.com/adr/madr) does not ship an official linter — the closest tooling is `markdownlint-cli2` for Markdown style and `lychee` for link rot. Structural validation, numbering continuity, `Supersedes` integrity, ISO 8601 date checks, and status enum validation are not covered by any official or widely-adopted Node.js tool.

`madr-lint` fills that gap, written in TypeScript for the Node.js ecosystem.

## Planned features

- File naming convention check (`NNNN-kebab-case-title.md`)
- Required section validation (Status, Context, Decision, Consequences)
- Status enum validation (Proposed / Accepted / Deprecated / Superseded / Rejected)
- ISO 8601 date validation
- Numbering duplicate / gap detection
- `Supersedes` / `Superseded by` bidirectional integrity
- Inter-ADR link rot check
- MADR v2 (bold-list) and v3+/v4 (frontmatter) format support, selectable per project
- CLI / Library / GitHub Action distribution
- Configurable rules with `error` / `warn` / `off` severity, ESLint-style

## Roadmap

- [x] M0: Repository scaffold (CLAUDE.md, ADRs, types, build pipeline)
- [ ] M1: MVP — 4 core rules + CLI runtime
  - [x] `madr/filename-format` (the only rule that exists today)
  - [ ] `madr/required-sections`
  - [ ] `madr/status-enum`
  - [ ] `madr/date-iso8601`
  - [ ] CLI runtime (citty stub exists, lint logic pending)
- [ ] M2: Cross-file integrity rules (numbering, supersedes, link rot)
- [ ] M3: GitHub Action distribution
- [ ] M4: Frontmatter (v3/v4) full support
- [ ] M5: Production use in `frontend-implementation-boilerplate`
- [ ] M6: v1.0.0 stable release

> **What works today** (M0 + post-review fixes through R8):
> - One rule (`madr/filename-format`) with hard-asserted test shape (11 tests)
> - Single-pass AST runner (`src/core/runner.ts`) — gray-matter +
>   `mdast-util-from-markdown` direct, lazy frontmatter via
>   `context.frontmatter`, `RuleListeners` enter/exit dispatch (root included)
> - AJV-validated rule options (`strict: true`, WeakMap-cached validators
>   per schema, throws typed `RuleOptionsError`)
> - Per-rule error isolation — buggy rules captured as `core/internal-error`
>   diagnostics (always severity `error`), other rules continue
> - Public API: `runRule`, `runRulesOnFile`, `parseFile`, `RuleOptionsError`,
>   `MdastNode` exported from `src/index.ts`
> - Generic `Rule<TOptions>` type, dual-entry tsup ESM build
>
> The runner is ready for the first AST-using rule
> (`madr/required-sections`).

## Requirements

- Node.js 22+ (pinned to 22.11.0 in `mise.toml`)
- pnpm 10+ (pinned to 10.28.0 in `mise.toml`; see [ADR-0004](docs/adr/0004-pnpm-10-and-vitest-4.md))
- [mise](https://mise.jdx.dev/) for tool version management

## License

MIT © 2026 t.kaneko
