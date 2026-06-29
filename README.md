# madr-lint

[![CI](https://github.com/knktkc/madr-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/knktkc/madr-lint/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/madr-lint.svg)](https://www.npmjs.com/package/madr-lint)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/madr-lint.svg)](https://nodejs.org/)

A linter for [MADR](https://adr.github.io/madr/) (Markdown Architectural Decision Records).

> **Status**: Alpha. Self-dogfood and one external repo (private) lint clean. The 1.0 stability gate is adoption feedback — until then, treat each minor bump as potentially breaking.

## Why

[MADR](https://github.com/adr/madr) does not ship an official linter. The closest existing tools each cover only part of what an ADR collection actually needs:

| Tool | Markdown style | Inter-doc links | ADR numbering | Status enum | Date format | Supersedes graph | v2 bold-list |
|---|---|---|---|---|---|---|---|
| [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) | yes | no | no | no | no | no | n/a |
| [lychee](https://github.com/lycheeverse/lychee) | no | yes | no | no | no | no | n/a |
| [adrs (rust)](https://crates.io/crates/adrs) | no | no | yes (init) | no | no | partial | no |
| **madr-lint** | **no** (defer to markdownlint-cli2) | **yes** | **yes** | **yes** | **yes** | **yes** | **yes** |

`madr-lint` deliberately does not duplicate Markdown style checking — pair it with `markdownlint-cli2` if you want both.

## Installation

```bash
pnpm add -D madr-lint
# or:
npm i -D madr-lint
```

Requires Node.js 22+. ESM-only. Ships with TypeScript types.

### Quick start

```bash
# Lint the default ADR directory (docs/adr)
npx madr-lint

# Explicit path(s) — multiple are allowed
npx madr-lint docs/adr libs/x/adr

# Single file
npx madr-lint docs/adr/0001-example.md

# JSON output for tools
npx madr-lint --format json

# SARIF for GitHub Code Scanning
npx madr-lint --format sarif > results.sarif
```

Exit code is `0` if no errors, `1` on error-level diagnostics, `2` on usage errors.

### Configuration

Resolution order (first match wins):

1. `.madrlintrc.json`
2. `.madrlintrc.{ts,mts,js,mjs,cjs}`
3. `madr-lint.config.{ts,mts,js,mjs,cjs}`

Example (`.madrlintrc.json`):

```json
{
  "extends": ["madr-lint:recommended"],
  "adrDir": "docs/adr",
  "ignorePatterns": ["**/README.md", "**/template.md", "9999-*.md"],
  "rules": {
    "madr/required-sections": ["error", {
      "sections": ["Context", "Decision", "Consequences"],
      "matchMode": "startsWith"
    }],
    "madr/no-numbering-gap": "error"
  }
}
```

TypeScript config (`madr-lint.config.ts`) — get type-checking on your own config:

```typescript
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  adrDir: 'docs/adr',
  ignorePatterns: ['**/template.md'],
  rules: {
    'madr/no-broken-links': 'warn',
  },
});
```

`ignorePatterns` supports full picomatch glob syntax (`**/draft-*.md`, `9[0-9][0-9][0-9]-*.md`, `{template,draft}.md`, etc.). Plain basenames like `README.md` work without the `**/` prefix.

### CLI flags

| Flag | Default | Description |
|---|---|---|
| `[paths...]` | `config.adrDir` (default `docs/adr`) | Files or directories to lint. Multiple allowed. |
| `--format <fmt>` | `text` | Reporter: `text`, `json`, or `sarif`. |
| `--cache` / `--no-cache` | `true` | Per-file content-hash cache. Project rules always re-run. |
| `--cache-dir <path>` | `.madr-lint/cache` | Cache directory. Add to `.gitignore`. |

## What's enabled

8 lint rules — 7 by default in `recommended`, 1 opt-in:

| Rule | Type | Default | Checks |
|---|---|---|---|
| `madr/filename-format` | per-file | error | Filename matches `NNNN-kebab-case.md` (overridable via `pattern`) |
| `madr/required-sections` | per-file | error | Each ADR has Context / Decision / Consequences (configurable) |
| `madr/status-enum` | per-file | error | `status` is one of Proposed / Accepted / Deprecated / Superseded / Rejected |
| `madr/date-iso8601` | per-file | error | `date` parses as a real ISO 8601 calendar date (YYYY-MM-DD) |
| `madr/no-duplicate-numbering` | project | error | No two ADRs share the same `NNNN` prefix |
| `madr/supersedes-bidirectional` | project | error | If A supersedes B, B's `Superseded by` references A |
| `madr/no-broken-links` | project | error | Inter-ADR links resolve to existing files in the project |
| `madr/no-numbering-gap` | project | **off** (opt-in) | No gaps in the numeric sequence — strict mode for archival projects |

**MADR format coverage**: v3/v4 YAML frontmatter and v2 bold-list (`- **Status**: …`) are both supported via the metadata bridge ([ADR-0006](docs/adr/0006-v2-bold-list-bridge.md)).

## Migrating from existing setups

### From `markdownlint-cli2` only

Keep markdownlint for Markdown style. Add madr-lint to cover ADR-specific structure:

```yaml
# .github/workflows/lint.yml
- run: npx markdownlint-cli2 'docs/adr/**/*.md'
- run: npx madr-lint docs/adr
```

### From `lychee` only

Lychee verifies external HTTP links; madr-lint's `no-broken-links` verifies *intra-project* links between ADRs. Run both:

```bash
lychee 'docs/adr/**/*.md'   # external link rot
madr-lint docs/adr          # ADR structure + inter-ADR links
```

### From `adrs` (Rust) or `adr-tools`

`adrs` initializes ADR directories and emits new ADRs from a template. It does not lint. Use it for scaffolding, then add madr-lint for ongoing validation:

```bash
adrs new "Some decision"
madr-lint docs/adr
```

### From hand-rolled bash + grep

A common starter pattern:

```bash
grep -L 'status:' docs/adr/*.md  # find ADRs missing status
```

`madr/required-sections` and `madr/status-enum` together cover this — and emit better error messages.

## Public API

```typescript
import {
  runRule,
  runRulesOnFile,
  runRulesOnProject,
  parseFile,
  extractListMetadata,
  buildProjectFile,
  RuleOptionsError,
  INTERNAL_ERROR_RULE_NAME,
  defineConfig,
  recommended,
} from 'madr-lint';

import type {
  Rule,
  ProjectRule,
  RuleContext,
  ProjectRuleContext,
  ProjectFile,
  Diagnostic,
  MdastNode,
  RuleSeverity,
  MadrLintConfig,
} from 'madr-lint';
```

See [docs/rules/](docs/rules/) for per-rule reference and [docs/adr/](docs/adr/) for the project's own design decisions (we dogfood our own linter against our own ADRs).

## Roadmap

- [x] M0: Repository scaffold
- [x] M1: MVP — 4 per-file rules + CLI runtime
- [x] M2: Cross-file integrity rules + project rule API
- [x] M3: GitHub Actions CI/CD + npm OIDC trusted publishing
- [x] M4: v3/v4 frontmatter + v2 bold-list (metadata bridge)
- [x] M5: Production use in external repository
- [x] **M6 (in progress)**: Tier-A safety hardening (ReDoS guard, perf-regression-check), Tier-B Phase-2 CLI (JSON/SARIF/multi-path/TS-config/picomatch), content-hash cache, mixed-mode integration tests
- [ ] M7: v1.0.0 stable release — alpha → beta → rc → 1.0 driven by adoption feedback

## Performance

- Cold lint of 100 ADRs: <100ms (target)
- Warm lint with cache hit: ~38% speedup vs cold (verified on self-dogfood)
- Single-pass AST traversal with visitor registry (per [ADR-0002](docs/adr/0002-ast-parsing-strategy.md))
- AJV validators pre-compiled and cached per rule
- ReDoS guarded both at runtime (`safe-regex2`) and CI (`scripts/redos-scan.ts`)
- Per-file regex cache so the safety check costs O(distinct patterns), not O(files)

## Requirements

- Node.js 22+ (pinned to 22.11.0 in `mise.toml`)
- pnpm 10+ (pinned to 10.28.0 in `mise.toml`; see [ADR-0004](docs/adr/0004-pnpm-10-and-vitest-4.md))
- [mise](https://mise.jdx.dev/) for tool version management

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the rule-shape guide, and the TDD/changeset/DCO workflow.

## License

MIT © 2026 t.kaneko
