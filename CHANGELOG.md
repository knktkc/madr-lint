# Changelog

All notable changes to `madr-lint` are recorded here. Releases are managed via
[changesets](https://github.com/changesets/changesets); each entry below
corresponds to a published npm version.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0 releases (`0.x`) treat minor bumps as potentially breaking.

## 0.1.0

### Minor Changes

- Initial public release of **madr-lint** — the MADR-native linter for the JS/TS ecosystem.

  - MADR **v2 / v3 / v4** aware: reads YAML frontmatter and v2 body-list metadata (bold `- **Status**:` and canonical `* Status:`), or auto-detects per file.
  - **8 rules** with ESLint-style names, `error`/`warn`/`off` severities, and per-rule options validated by a JSON Schema: `required-sections`, `status-enum`, `date-iso8601`, `filename-format`, `no-broken-links`, `no-duplicate-numbering`, `no-numbering-gap`, `supersedes-bidirectional`.
  - **CLI** with `text` / `json` / `sarif` reporters, multi-path input, TypeScript config, picomatch ignore globs, and a per-file content-hash cache.
  - **Programmatic API** (`runRulesOnFile`, `runRulesOnProject`, `parseFile`, …) and a `recommended` preset.
  - Bilingual documentation site (English / 日本語).
