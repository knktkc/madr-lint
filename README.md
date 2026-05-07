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
- [x] **M1: MVP — 4 core rules + CLI runtime**
  - [x] `madr/filename-format`
  - [x] `madr/required-sections`
  - [x] `madr/status-enum`
  - [x] `madr/date-iso8601`
  - [x] CLI runtime (Phase 1: text reporter, JSON config, file or directory targets)
- [x] **M2: Cross-file integrity rules**
  - [x] `madr/no-duplicate-numbering`
  - [x] `madr/supersedes-bidirectional`
  - [x] `madr/no-broken-links`
  - [x] `madr/no-numbering-gap` (opt-in)
  - [x] Project rule API (ADR-0005)
- [ ] M3: GitHub Action distribution
- [ ] M4: Frontmatter v3/v4 full support + v2 bold-list compatibility
- [ ] M5: Production use in `frontend-implementation-boilerplate`
- [ ] M6: v1.0.0 stable release

> **What works today** (M0 + M1 + post-review fixes through R8):
> - **4 lint rules** (all in the `recommended` preset, severity `error`):
>   `madr/filename-format`, `madr/required-sections`, `madr/status-enum`,
>   `madr/date-iso8601`
> - **CLI runtime** — `madr-lint <dir-or-file>` produces text reports
>   with file grouping and {{placeholder}}-rendered messages. Loads
>   `.madrlintrc.json` config; falls back to `recommended` preset.
>   Exit 0/1 for clean/errors.
> - **Single-pass AST runner** (`src/core/runner.ts`) — gray-matter +
>   `mdast-util-from-markdown` direct, lazy `context.frontmatter`,
>   `RuleListeners` enter/exit dispatch including `root`
> - **AJV-validated options** (`strict: true`, WeakMap-cached, typed
>   `RuleOptionsError` on failure)
> - **Per-rule error isolation** — buggy rules captured as
>   `core/internal-error` diagnostics, other rules continue
> - **Property-based testing** — `fast-check` exercises `madr/date-iso8601`
>   against random Dates and malformed strings (200 runs each)
> - **Public API** — `runRule`, `runRulesOnFile`, `parseFile`,
>   `RuleOptionsError`, `MdastNode` exported from the package entry

### Quick start

```bash
# Lint a directory
madr-lint docs/adr

# Lint a single file
madr-lint docs/adr/0001-example.md

# Custom config (`.madrlintrc.json`)
{
  "extends": ["madr-lint:recommended"],
  "adrDir": "docs/decisions",
  "rules": {
    "madr/required-sections": ["error", {
      "sections": ["Context", "Decision", "Consequences"],
      "matchMode": "startsWith"
    }]
  }
}
```

## Requirements

- Node.js 22+ (pinned to 22.11.0 in `mise.toml`)
- pnpm 10+ (pinned to 10.28.0 in `mise.toml`; see [ADR-0004](docs/adr/0004-pnpm-10-and-vitest-4.md))
- [mise](https://mise.jdx.dev/) for tool version management

## License

MIT © 2026 t.kaneko
