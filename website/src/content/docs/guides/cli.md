---
title: CLI
description: The madr-lint command-line interface — arguments, flags, reporters and exit codes.
---

```bash
madr-lint [OPTIONS] [PATHS...]
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
| `--format <format>` | `text` | Reporter: `text`, `json`, or `sarif`. |
| `--cache` / `--no-cache` | `--cache` | Use the per-file content-hash cache. |
| `--cache-dir <dir>` | `.madr-lint/cache` | Cache directory. |
| `--baseline` / `--no-baseline` | `--baseline` | Subtract `.madr-lint/baseline.json` when present. |
| `--update-baseline` | | Rewrite `.madr-lint/baseline.json` from a full lint, then exit `0`. |
| `--help` | | Show help. |
| `--version` | | Print the version. |

CLI flags win over the config file — e.g. `--no-cache` overrides `cache: true`.

## Reporters

### `text` (default)

Human-readable, grouped by file:

```text
docs/adr/0003-use-postgres.md
  error  madr/status-enum        Status "decided" is not one of: ...
  error  madr/required-sections  Missing required section: "Consequences"

2 errors
```

### `json`

Structured output for tooling:

```bash
madr-lint --format json
```

```json
{
  "version": 1,
  "summary": { "total": 2, "errors": 2, "warnings": 0 },
  "results": [
    {
      "path": "docs/adr/0003-use-postgres.md",
      "ruleName": "madr/status-enum",
      "messageId": "invalidStatus",
      "severity": "error",
      "message": "Status \"decided\" is not one of: ...",
      "data": { "status": "decided" }
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
| `0` | No errors (warnings may still be printed) |
| `1` | One or more `error`-severity diagnostics |
| `2` | Configuration problem (invalid rule options, unknown `--format`) |

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
