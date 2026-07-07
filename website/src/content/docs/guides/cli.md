---
title: CLI
description: The madr-lint command-line interface — arguments, flags, reporters and exit codes.
---

```bash
madr-lint [OPTIONS] [PATHS...]
madr-lint init [OPTIONS]
```

## Arguments

### `PATHS`

One or more files or directories to lint. Directories are searched recursively
for `.md` files.

When omitted, `madr-lint` lints the configured `adrDir` (default: `docs/adr`).

```bash
# lint the configured adrDir
madr-lint

# lint explicit paths
madr-lint docs/adr docs/decisions/0007-use-x.md
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--format <format>` | `text` | Reporter: `text`, `json`, `sarif`, or `github`. |
| `--quiet` | off | Report errors only; suppress warnings from output. |
| `--max-warnings <n>` | (none) | Exit 1 when warning count exceeds `n`. `0` means any warning fails CI. Negative = no limit. |
| `--config <path>` | (auto) | Load exactly this config file (TS or JSON), bypassing discovery. |
| `--cache` / `--no-cache` | `--cache` | Use the per-file content-hash cache. |
| `--cache-dir <dir>` | `.madr-lint/cache` | Cache directory. |
| `--baseline` / `--no-baseline` | `--baseline` | Subtract `.madr-lint/baseline.json` when present. |
| `--update-baseline` | | Rewrite `.madr-lint/baseline.json` from a full lint, then exit `0`. |
| `--fix` | off | Apply autofixes in place, then report the problems that remain. |
| `--fix-dry-run` | off | Print a unified diff of the fixes `--fix` would apply; write nothing. |
| `--help` | | Show help. |
| `--version` | | Print the version. |

CLI flags win over the config file — e.g. `--no-cache` overrides `cache: true`.

### `--quiet` × `--max-warnings` interplay

`--quiet` filters warnings from **output** but the original warning count is still
used for the `--max-warnings` threshold — mirroring ESLint's documented semantics.
This lets you run `--quiet --max-warnings 0` to keep CI logs free of warning noise
while still failing the build when warnings exist.

When the threshold is exceeded, the reason is printed to **stderr** for every
`--format`, so stdout payloads stay clean for machine consumers:

```text
madr-lint: 3 warning(s) found, exceeds --max-warnings 0
```

```bash
# CI: fail on any warning, but keep output clean
madr-lint --quiet --max-warnings 0
```

Warnings absorbed by the [baseline](/guides/adopting-existing-repo/) do **not**
count toward `--max-warnings` — the baseline is subtracted before the threshold
is checked, so inherited debt never fails CI. Only fresh warnings count.
`--update-baseline` always exits 0, regardless of `--quiet` or `--max-warnings`.

## `madr-lint init`

Scaffold a config file. Non-interactive by design — every decision is a
filesystem heuristic or a flag — so it is safe in CI and behind pipes:

```bash
npx madr-lint init
```

`init` detects three things and writes a config extending
`madr-lint:recommended`:

- **ADR directory** — the first of `docs/adr`, `docs/decisions`, `doc/adr`,
  `adr`, `docs/architecture/decisions` whose top level contains at least one
  `NNNN-*.md` file. When none qualifies it falls back to `docs/adr` (the
  linter's default) and says so.
- **MADR version** — samples up to 20 existing ADRs and lets the majority
  win: YAML frontmatter with `decision-makers` counts as v4, other
  frontmatter as v3, a v2 metadata list as v2. An empty directory, a tie, or
  no recognizable metadata yields `auto` (the default, so it is omitted from
  the written config).
- **Config format** — `madr-lint.config.ts` when the project looks
  TypeScript-ish (a `tsconfig.json`, or `typescript` among `package.json`
  dependencies), `.madrlintrc.json` otherwise.

`init` refuses to overwrite an existing config file (exit `2`); pass
`--force` to replace it. After writing, it runs a cheap in-process lint of
the detected directory — when that finds violations, the next-steps output
suggests [`--update-baseline`](/guides/adopting-existing-repo/) so legacy
debt does not block adoption.

### Flags

| Flag | Default | Description |
|---|---|---|
| `--force` | off | Overwrite an existing config file instead of exiting `2`. |
| `--dir <path>` | (detected) | ADR directory to write into the config, overriding detection. |
| `--json` | off | Emit a machine-readable JSON summary (what was detected and written) instead of text — for agents and scripts. |

```bash
# monorepo: point the config at a specific package's ADRs
npx madr-lint init --dir services/api/docs/adr

# machine-readable summary
npx madr-lint init --json
```

The `--json` payload reports `written`, `configPath`, `configFormat`,
`adrDir`, `adrDirSource` (`detected` / `fallback` / `override`),
`madrVersion`, `filesChecked`, `errors`, `warnings`,
`suggestUpdateBaseline`, and `docsUrl` (the getting-started guide).

## Autofix

Some diagnostics are **mechanically fixable**. `madr-lint` marks them with a dim
`🔧 fixable` tag in `text` output and a `"fixable": true` field in `json`.

```bash
# apply fixes in place, then report anything left over
madr-lint --fix

# preview the exact changes without touching any file
madr-lint --fix-dry-run
```

`--fix` rewrites files (only those that actually change), then re-lints the fixed
content and reports the **remaining** problems — the exit code reflects what is
left, so `--fix` in CI still fails on anything a fix could not resolve.
`--fix-dry-run` applies the same fixes in memory and shows a per-file unified
diff, writing nothing; its exit code is what `--fix` would have produced. If both
flags are given, `--fix-dry-run` wins (nothing is written).

Where the dry-run diff goes depends on `--format`, so machine-readable stdout is
never polluted: `text` prints it to stdout (below); `json` embeds it in the
payload as a top-level `diffs` array (see [`json`](#json)); `sarif` / `github`
send it to stderr so their stdout stays parseable.

```text
--- a/docs/adr/0003-use-postgres.md
+++ b/docs/adr/0003-use-postgres.md
@@ -1,3 +1,3 @@
 # ADR-0003

-- Status: Accepted
+- Status: accepted
✓ All clear.
1 problem fixable (dry run; no files written)
```

Fixing composes with the other flags:

- `--fix` + `--quiet` / `--max-warnings` operate on the **remaining** diagnostics.
- **Suppressed** ([`madr-lint-disable`](/guides/suppressing-rules/)) and
  **baselined** ([`.madr-lint/baseline.json`](/guides/adopting-existing-repo/))
  problems are never rewritten — a fix you chose to keep stays put.
- `--update-baseline` cannot be combined with `--fix` / `--fix-dry-run` (ambiguous
  intent — rewrite files vs snapshot violations); the combination exits `2`.
- The cache is bypassed while fixing; a fixed file re-enters the normal pipeline
  on the next run with a fresh content hash.

## Reporters

### `text` (default)

Human-readable, grouped by file. Where a rule offers a concrete fix, an indented
`→` line shows it; a `🔧 fixable` tag flags a diagnostic that `--fix` can repair;
the rule's documentation URL is printed once per rule per file group (never per
diagnostic, so output stays compact):

```text
docs/adr/0003-use-postgres.md
  error  madr/date-iso8601       Date "2026-13-01" is not a valid ISO 8601 calendar date (YYYY-MM-DD)
                                 → use the YYYY-MM-DD calendar-date format, e.g. 2025-03-14
  error  madr/required-sections  Missing required section: "Consequences"
                                 → add a "## Consequences" heading to the document body
  madr/date-iso8601       https://knktkc.github.io/madr-lint/rules/date-iso8601/
  madr/required-sections  https://knktkc.github.io/madr-lint/rules/required-sections/

2 errors
```

### `json`

Structured output for tooling. Each result carries `suggestion` — a
machine-actionable fix, or `null` when the rule defines none for that message —
`docsUrl`, the rule's documentation URL, and `fixable`, whether `--fix` can
repair it. When a fix pass ran, `summary` also carries `fixed` (the number of
fixes applied). Under `--fix-dry-run`, the payload additionally carries a
top-level `diffs` array — one `{ "path", "diff" }` entry per changed file, with
`diff` holding the unified diff text — so stdout stays pure JSON:

```bash
madr-lint --format json
```

```json
{
  "version": 1,
  "summary": { "total": 1, "errors": 1, "warnings": 0, "baselineHidden": 0 },
  "results": [
    {
      "path": "docs/adr/0003-use-postgres.md",
      "ruleName": "madr/required-sections",
      "messageId": "missingSection",
      "severity": "error",
      "message": "Missing required section: \"Consequences\"",
      "suggestion": "add a \"## Consequences\" heading to the document body",
      "docsUrl": "https://knktkc.github.io/madr-lint/rules/required-sections/",
      "fixable": false,
      "data": { "section": "Consequences", "found": ["Context and Problem Statement", "Decision Outcome"] }
    }
  ]
}
```

### `sarif`

[SARIF](https://sariftools.github.io/sarif-spec/) for code-scanning integrations
(e.g. GitHub code scanning):

```bash
madr-lint --format sarif > madr-lint.sarif
```

## Exit codes

| Exit code | Meaning |
|---|---|
| `0` | No errors; warning count within `--max-warnings` limit (if set) |
| `1` | One or more `error`-severity diagnostics, or warning count exceeds `--max-warnings`. With `--fix` / `--fix-dry-run`, this reflects the problems that **remain** after fixing |
| `2` | Usage or configuration error (invalid `--max-warnings` value, missing `--config` file, invalid rule options, unknown `--format`, `--update-baseline` combined with `--fix`, existing config on `madr-lint init` without `--force`) |

## Caching

The cache stores per-file diagnostics keyed by content hash and is invalidated
when the package version or resolved config changes. Cross-file rules always
re-run.

```bash
# force a clean run
madr-lint --no-cache

# use a custom cache directory
madr-lint --cache-dir .cache/madr-lint
```

## Baseline

Adopting `madr-lint` on a repo that already has violations? Snapshot them into
`.madr-lint/baseline.json` so only *new* violations fail the build:

```bash
# snapshot today's violations and commit the file
madr-lint --update-baseline

# subsequent runs subtract the baseline automatically
madr-lint

# audit everything, ignoring the baseline
madr-lint --no-baseline
```

Subtraction runs after the cache and after inline suppression, and never touches
the cache — so editing or deleting the baseline takes effect immediately. See the
[Adopting on an existing repo](/guides/adopting-existing-repo/) guide for the full
workflow.
