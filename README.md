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
- [x] **M3: GitHub Actions CI/CD** (lint+typecheck+test+build matrix, npm OIDC trusted publishing, dependabot)
- [x] **M4: Frontmatter v3/v4 + v2 bold-list compatibility** (metadata bridge — ADR-0006)
- [x] **M5: Production use in `frontend-implementation-boilerplate`** (real v2 ADRs lint clean)
- [ ] M6: v1.0.0 stable release

> **What works today** (M0 → M5, post-review fixes through R10):
>
> **8 lint rules** (4 per-file + 4 project, 7 enabled in `recommended`,
> 1 opt-in):
> - **Per-file**: `madr/filename-format`, `madr/required-sections`,
>   `madr/status-enum`, `madr/date-iso8601`
> - **Project (cross-file)**: `madr/no-duplicate-numbering`,
>   `madr/supersedes-bidirectional`, `madr/no-broken-links`,
>   `madr/no-numbering-gap` (opt-in)
>
> **MADR format coverage**:
> - **v3 / v4** — YAML frontmatter (`status:`, `date:`, etc.)
> - **v2** — bold-list (`- **Status**: …`, `- **Date**: …`) via the
>   metadata bridge ([ADR-0006](docs/adr/0006-v2-bold-list-bridge.md))
>
> **Runtime / CLI**:
> - `madr-lint <dir-or-file>` text reports with file grouping +
>   `{{placeholder}}`-rendered messages, exit 0/1
> - `.madrlintrc.json` config: `extends`, `adrDir`, `rules`,
>   `ignorePatterns`. Falls back to `recommended` preset
> - Cross-platform POSIX path normalization
>
> **Engine**:
> - Single-pass AST runner with `RuleListeners` enter/exit dispatch
> - Project rule runner (`runRulesOnProject`) with eager-parsed
>   `ProjectFile[]`, per-rule error isolation
> - AJV-validated options (`strict: true`, WeakMap-cached, typed
>   `RuleOptionsError`)
> - Property-based testing (`fast-check` against `madr/date-iso8601`)
>
> **Public API**: `runRule`, `runRulesOnFile`, `runRulesOnProject`,
> `buildProjectFile`, `parseFile`, `extractBoldListMetadata`,
> `RuleOptionsError`, `INTERNAL_ERROR_RULE_NAME`, plus types
> (`Rule`, `ProjectRule`, `RuleContext`, `ProjectRuleContext`,
> `ProjectFile`, `MdastNode`, `RuleSeverity`, `MadrLintConfig`).

## Installation

```bash
pnpm add -D madr-lint
# or:
npm i -D madr-lint
```

Requires Node.js 22+. ESM-only.

### Quick start

```bash
# Lint a directory (defaults to docs/adr)
npx madr-lint docs/adr

# Lint a single file
npx madr-lint docs/adr/0001-example.md
```

### Configuration (`.madrlintrc.json`)

```json
{
  "extends": ["madr-lint:recommended"],
  "adrDir": "docs/adr",
  "ignorePatterns": ["README.md", "template.md", "9999-*"],
  "rules": {
    "madr/required-sections": ["error", {
      "sections": ["Context", "Decision", "Consequences"],
      "matchMode": "startsWith"
    }],
    "madr/no-numbering-gap": "error"
  }
}
```

`ignorePatterns` supports exact basename, full relative path, path suffix, and trailing wildcard (`9999-*`). Full glob support is on the roadmap.

## Requirements

- Node.js 22+ (pinned to 22.11.0 in `mise.toml`)
- pnpm 10+ (pinned to 10.28.0 in `mise.toml`; see [ADR-0004](docs/adr/0004-pnpm-10-and-vitest-4.md))
- [mise](https://mise.jdx.dev/) for tool version management

## License

MIT © 2026 t.kaneko
