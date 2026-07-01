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
