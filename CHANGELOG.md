# Changelog

## 0.2.0

### Minor Changes

- [#54](https://github.com/knktkc/madr-lint/pull/54) [`d91e248`](https://github.com/knktkc/madr-lint/commit/d91e248928b68d5408d38de731986cbfa61174aa) Thanks [@knktkc](https://github.com/knktkc)! - Baseline file for gradual adoption ([#24](https://github.com/knktkc/madr-lint/issues/24)). Adopt `madr-lint` on a repo with existing violations without fixing them all first — `--update-baseline` snapshots today's violations to `.madr-lint/baseline.json`, and subsequent runs subtract them so only **new** violations fail the build.

  - `madr-lint --update-baseline` writes the baseline (deterministic sorted JSON, POSIX-relative paths, 2-space indent + trailing newline for clean git diffs) and exits 0.
  - Default runs subtract an existing baseline; `--no-baseline` ignores it and shows everything.
  - Fingerprint = `(relative path, ruleName, messageId)` → allowed **count** (a tsc-baseline-style count model), so the baseline survives unrelated edits by construction — no line numbers, no message text. See [ADR-0007](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0007-baseline-fingerprint-design.md).
  - Subtraction runs after inline suppression and is never stored in the cache, so editing or deleting the baseline takes effect without cache invalidation (warm-cache runs still subtract). `core/internal-error` is never baselined.
  - `--format json` gains `summary.baselineHidden` (always present, `0` when no baseline is active); SARIF output is unchanged. A present-but-malformed baseline file is ignored with a one-line stderr warning rather than silently.
  - Programmatic API adds `buildBaseline`, `applyBaseline`, `loadBaseline`, `writeBaseline`, `serializeBaseline`, `baselinePath`, and the `Baseline` type.

- [#55](https://github.com/knktkc/madr-lint/pull/55) [`47624ad`](https://github.com/knktkc/madr-lint/commit/47624add4af8c611dd566993905457a27a826231) Thanks [@knktkc](https://github.com/knktkc)! - CLI ergonomics ([#27](https://github.com/knktkc/madr-lint/issues/27)): add `--quiet`, `--max-warnings <n>`, and `--config <path>` flags with ESLint-mirrored semantics.

  - `--quiet` filters warnings from the **output** of every reporter (text/json/sarif/github); the unfiltered warning count still drives `--max-warnings`.
  - `--max-warnings <n>` exits 1 when warnings exceed n (`0` valid; negative/absent = no limit). When the threshold fails the run, a one-line verdict is printed to **stderr** for every format, and the text reporter never shows "All clear" beside a failing exit code. Baselined warnings do not count toward the threshold.
  - `--config <path>` loads exactly that config file (TS or JSON), bypassing discovery; a missing file, a directory, or an invalid config exits 2 with a clear message.

- [#58](https://github.com/knktkc/madr-lint/pull/58) [`e6008a8`](https://github.com/knktkc/madr-lint/commit/e6008a8ec76494aa22364f7d262696d52fd59dad) Thanks [@knktkc](https://github.com/knktkc)! - Add `--format github` reporter that emits GitHub Actions workflow commands (`::error` / `::warning`) for PR diff annotations; add `action.yml` composite action and dogfood smoke workflow.

- [#53](https://github.com/knktkc/madr-lint/pull/53) [`be2456e`](https://github.com/knktkc/madr-lint/commit/be2456e6e1fc34c8b295168effe54740210fbcb2) Thanks [@knktkc](https://github.com/knktkc)! - Inline suppression comments ([#23](https://github.com/knktkc/madr-lint/issues/23)). ADR bodies can now silence diagnostics with HTML-comment directives, filtered centrally so rules stay unaware:

  - `<!-- madr-lint-disable-file -->` — suppress everything in the file
  - `<!-- madr-lint-disable -->` … `<!-- madr-lint-enable -->` — suppress a range (or to EOF when left open)
  - `<!-- madr-lint-disable-next-line -->` — suppress the next non-blank line

  Each form takes an optional comma-separated rule-id list (no list = all rules). To make line-scoped suppression work against real rules, `madr/no-broken-links` diagnostics now carry the link's position, and `madr/status-enum` / `madr/date-iso8601` carry the metadata list item's position when the value comes from the MADR v2 list (frontmatter-sourced values stay line-less). `ParsedFile`/`RuleContext` gain `metadataLoc`. `core/internal-error` diagnostics are never suppressible.

  **Breaking (pre-1.0)**: the public `ProjectFile` type gains a required `body` field. Code that constructs `ProjectFile` objects by hand must now populate it — use `buildProjectFile()`, which handles it. Consumers that only read `ProjectFile` values are unaffected.

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
