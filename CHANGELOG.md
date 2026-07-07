# Changelog

## 0.4.0

### Minor Changes

- [#87](https://github.com/knktkc/madr-lint/pull/87) [`7795ca7`](https://github.com/knktkc/madr-lint/commit/7795ca7c40634097806ad2bd7f82d4a3a02e465d) Thanks [@knktkc](https://github.com/knktkc)! - Autofix framework — `--fix`, `meta.fixable`, and the fixer API ([#28](https://github.com/knktkc/madr-lint/issues/28), [ADR-0008](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0008-autofix-text-edits.md)). Fixes are raw-text offset edits, never AST serialization, so a fix changes only the span it targets and leaves every other byte untouched.

  - **Rule API**: a rule declares `meta.fixable: 'code'` and attaches a lazy `fix: (fixer) => TextEdit | TextEdit[] | null` to `context.report(...)`. The `Fixer` (`replaceRange` / `insertAt` / `remove`) takes body (mdast) offsets and translates them to whole-file offsets past stripped frontmatter, so fixes are correct on files with YAML frontmatter. A fix from a rule that did not declare `meta.fixable` is a rule bug — the runner routes it through `core/internal-error`. Fix thunks are lazy: a normal lint constructs no fixer and invokes no thunk.
  - **CLI**: `--fix` applies fixes in place (only files that change are written) and the exit code reflects the problems that **remain**; `--fix-dry-run` prints a per-file unified diff and writes nothing (exit code as if fixes were applied). Fixes compose with existing flags — `--quiet` / `--max-warnings` operate on the remaining diagnostics, and **suppressed** (`madr-lint-disable`) and **baselined** problems are never rewritten. `--update-baseline` combined with `--fix` / `--fix-dry-run` is a usage error (exit 2).
  - **Applier**: collects fixes from reported diagnostics only (after suppression and baseline), sorts by offset, drops overlaps (first-by-position wins), applies in one pass, then re-lints to a fixpoint (max 10 passes). Per-file scope — cross-file fixes are tracked separately.
  - **First real fix**: `madr/status-enum` now mechanically normalizes a v2 list-sourced status value that differs from an allowed value purely by case (e.g. `Accepted` → `accepted`). Frontmatter-sourced values and genuine typos get no fix.
  - **Reporters**: `text` marks fixable diagnostics with a dim `🔧 fixable` tag; `json` gains a `fixable` boolean per result and a `summary.fixed` count when a fix pass ran; `github` / `sarif` are unchanged.
  - **Programmatic API**: exports `applyEdits`, `makeFixer`, `collectFixes`, `fixFileContent`, `unifiedDiff`, `MAX_FIX_PASSES`, `frontmatterOffset`, and the `TextEdit` / `Fixer` / `FixFn` types.
  - **Parser**: `ParsedFile.metadataValueLoc` (exposed to rules as `context.metadataValueLoc`) gives the body-coordinate `{ start, end }` offset range of a `metadata` value, for values sourced from the v2 leading list as a single contiguous text token — the offset source a fix's `fixer.replaceRange` targets.

  **Breaking (type + cache):** `Diagnostic` gains a required `fixable: boolean` field (disclosed like the earlier `suggestion` / `docsUrl` additions), and the content-hash cache schema version is bumped to `3` (missing/mismatched ⇒ cold), so the first run after upgrading re-lints once instead of serving stale-shape cached diagnostics. Consumers constructing `Diagnostic` objects by hand must set `fixable`.

- [#88](https://github.com/knktkc/madr-lint/pull/88) [`32e1c04`](https://github.com/knktkc/madr-lint/commit/32e1c0475b9547236b32c94154ad023270d8b0e6) Thanks [@knktkc](https://github.com/knktkc)! - Make three rules fixable, including the first **cross-file** fix ([#29](https://github.com/knktkc/madr-lint/issues/29)). Building on the autofix framework ([#28](https://github.com/knktkc/madr-lint/issues/28)), fixes remain raw-text offset edits — only the targeted span changes.

  - **`madr/date-iso8601`** now normalizes an **unambiguous** v2 body-list date to `YYYY-MM-DD`: year-first numeric with a single separator (`2026/7/3`, `2026.7.3`, `2026-7-3`) and English named-month forms (`3 Jul 2026`, `July 3, 2026`). Ambiguous day/month order (`03/07/2026`), two-digit years, impossible calendar dates (`2026/2/30`), non-English month names, and any **frontmatter**-sourced value are reported but never rewritten.
  - **`madr/status-enum`** extends its case-only fix with a tiny synonym/misspelling map validated against the **configured** enum: curated typos (`superceded by …` → `superseded by …`, `depricated` → `deprecated`) fixed under any case setting, and prefix corrections that preserve the tail. Case-only corrections (`Accepted` → `accepted`, `Superseded By ADR-0042` → `superseded by ADR-0042`) apply under `caseSensitive: true` — with the default `caseSensitive: false` such values are valid and never flagged. A value that maps to two candidates, a synonym whose target is not configured, a genuine typo with no unique target, and frontmatter-sourced values get no fix.
  - **`madr/supersedes-bidirectional`** gains the first **cross-file** fix: a `missingBackReference` inserts the reciprocal `<direction>: <expected>` line into the target ADR's **existing** YAML frontmatter, immediately before the closing `---`. The frontmatter is treated as opaque lines (no YAML reparse/reserialize), so key order, comments, and the file's newline style (LF/CRLF) are preserved. It declines when the target has no frontmatter (a block is never created), when the key already exists (value rewrite/append is out of scope), and for `unknownReference` (contextual). When two sources need a back-reference in the same target, one insertion lands per pass and the runner-up is reported.
  - **Framework**: `context.report({ fix })` on a **project** rule is now honored (`meta.fixable: 'code'` gates it; a fix from a non-fixable project rule routes through `core/internal-error`, matching per-file behavior). `lintAndFix` runs a project-fix fixpoint on the fixed contents — collecting edits keyed by the target's `path`, applying them per file (the ADR-0008 per-file edit-set seam), and re-running the project pass to a fixpoint under the same 10-pass bound; suppressed and baselined problems are never rewritten.
  - **Programmatic API**: exports `collectProjectFixes` and `applyEditsCounted` from `src/core/fix.ts`.

  No breaking changes: `Diagnostic.fixable` was already required ([#28](https://github.com/knktkc/madr-lint/issues/28)); project-rule diagnostics that previously reported `fixable: false` now report `true` only when the rule attaches a fix.

- [#85](https://github.com/knktkc/madr-lint/pull/85) [`0e05d1c`](https://github.com/knktkc/madr-lint/commit/0e05d1cd338ae6adec99c066822c3c1edddac029) Thanks [@knktkc](https://github.com/knktkc)! - `madr-lint init` — scaffold a config file with detection heuristics ([#30](https://github.com/knktkc/madr-lint/issues/30)). Non-interactive by design (works in CI / piped stdin):

  - **ADR directory**: first of `docs/adr`, `docs/decisions`, `doc/adr`, `adr`, `docs/architecture/decisions` whose top level contains at least one `NNNN-*.md` file; falls back to `docs/adr` (the linter's default) with a note when nothing qualifies.
  - **MADR version**: samples up to 20 existing ADRs and lets the majority win — frontmatter with `decision-makers` counts as v4, other frontmatter as v3, a v2 metadata list as v2; empty/tie/no-metadata yields `auto` (omitted from the config, it is the default).
  - **Config format**: `madr-lint.config.ts` when the project looks TypeScript-ish (`tsconfig.json`, or `typescript` among `package.json` dependencies), `.madrlintrc.json` otherwise.
  - Refuses to overwrite an existing config file (exit 2); `--force` overwrites, `--dir <path>` overrides directory detection, `--json` emits a machine-readable summary of what was detected and written.
  - The next-steps epilogue runs a cheap in-process lint of the detected directory and suggests `--update-baseline` when it finds violations, so legacy debt does not block adoption.

  The plain `madr-lint [paths]` command is unchanged — `init` is dispatched only when it is the literal first argument, so paths, flags and exit codes behave exactly as before.

## 0.3.0

### Minor Changes

- [#71](https://github.com/knktkc/madr-lint/pull/71) [`55e7b89`](https://github.com/knktkc/madr-lint/commit/55e7b89a5d1dc6c3109e04b02c082aadd713b701) Thanks [@knktkc](https://github.com/knktkc)! - Diagnostics now carry machine-actionable `suggestion` and `docsUrl` in the json/text/github output ([#67](https://github.com/knktkc/madr-lint/issues/67)). Error feedback is self-contained — expected vs actual plus a concrete fix and a docs link — so agents and humans repair violations without a separate doc lookup.

  - **Rule meta** gains an optional declarative `suggestions` map (messageId → template), interpolated with the diagnostic data exactly like `messages`. Rules stay declarative — no imperative suggestion building. Declare an entry only where a mechanical fix exists; omit where the fix is contextual.
  - **`Diagnostic`** gains `suggestion: string | null` (null when the rule defines none for that message) and `docsUrl: string` (the rule's `docs.url`; the repository for `core/internal-error`), both resolved by the runner at report time.
  - **Reporters**: `text` renders an indented `→ <suggestion>` line under a diagnostic and prints the docs URL once per rule per file group (compact — never per diagnostic); `json` adds `suggestion` and `docsUrl` to every result (keys always present); `github` appends ` — <suggestion>` to the annotation message (escaped). `sarif` is unchanged — its `helpUri` already carries the docs URL.
  - **All 8 rules audited**; suggestions filled where the remediation is mechanical (`required-sections`, `status-enum` missing status, `date-iso8601`, `filename-format`, `no-broken-links`, `no-duplicate-numbering`, `supersedes-bidirectional`) and omitted where contextual (`no-numbering-gap`; `status-enum` invalid status already lists the allowed values).
  - **Fixed** `supersedes-bidirectional`'s `missingBackReference` message, which named the wrong declared field: it now renders the field the source file actually declares (`supersedes:` vs `superseded-by:`) and states the exact `field: value` back-reference to add.
  - **Breaking (pre-1.0)**: `Diagnostic` gains two required fields — external code that **constructs** `Diagnostic` values must now supply `suggestion` (`string | null`) and `docsUrl` (`string`); consumers that only read diagnostics are unaffected (the keys are always present). The on-disk cache manifest also gains a schema version (`schemaVersion: 2`; missing/mismatched ⇒ cold), so the first run after upgrading re-lints once instead of serving stale-shape cached diagnostics.

  Resolution is report-time only, so it stays zero-cost on clean files and free on the sub-microsecond hot path.

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
