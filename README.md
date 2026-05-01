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

- [x] M0: Repository scaffold
- [ ] M1: MVP — 4 core rules + CLI
- [ ] M2: Cross-file integrity rules
- [ ] M3: GitHub Action distribution
- [ ] M4: Frontmatter (v3/v4) full support
- [ ] M5: Production use in `frontend-implementation-boilerplate`
- [ ] M6: v1.0.0 stable release

## Requirements

- Node.js 22+
- pnpm (managed via [mise](https://mise.jdx.dev/))

## License

MIT © 2026 t.kaneko
