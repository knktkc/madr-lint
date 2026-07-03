---
title: GitHub Action
description: Run madr-lint in CI with GitHub Actions, including PR annotations and SARIF upload to code scanning.
---

`madr-lint` ships a composite GitHub Action that emits **PR diff annotations**
for every violation. Errors and warnings appear inline on the pull-request diff
without any extra setup.

## Quick start

```yaml
# .github/workflows/adr-lint.yml
name: ADR lint

on:
  pull_request:
    paths:
      - 'docs/adr/**'
  push:
    branches: [main]

jobs:
  madr-lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22   # madr-lint requires Node ≥22
      - uses: knktkc/madr-lint@v0
        with:
          path: docs/adr
```

> **Until `v0` is tagged (first npm release)** pin to `@main`:
> `uses: knktkc/madr-lint@main`

The action exits non-zero when there are `error`-severity diagnostics, failing
the job automatically.

## Inputs

| Input | Default | Description |
|---|---|---|
| `path` | _(config / `docs/adr`)_ | Path(s) to lint — file or directory |
| `version` | `latest` | npm version or dist-tag of `madr-lint` to install |
| `working-directory` | `.` | Directory to run the action in |
| `args` | _(none)_ | Extra CLI arguments passed verbatim to `madr-lint` |

### Examples

**Pin a specific version:**

```yaml
      - uses: knktkc/madr-lint@v0
        with:
          version: '0.1.0'
          path: docs/adr
```

**Treat warnings as errors (fail on any warning):**

```yaml
      - uses: knktkc/madr-lint@v0
        with:
          path: docs/adr
          args: '--max-warnings 0'
```

**Monorepo — lint multiple directories:**

```yaml
      - uses: knktkc/madr-lint@v0
        with:
          path: 'services/api/docs/adr services/web/docs/adr'
```

## Prerequisites

The action does **not** install Node itself. Add `actions/setup-node` before it
(as shown above) and set `node-version: 22` (or higher).

## Upload SARIF to code scanning (advanced)

For findings to appear in the **Security → Code scanning** tab — and persist
beyond the PR — upload a SARIF report via the `--format sarif` flag instead:

```yaml
jobs:
  madr-lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Lint ADRs (SARIF)
        run: npx madr-lint --format sarif docs/adr > madr-lint.sarif
        continue-on-error: true
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: madr-lint.sarif
```

## Tips

- Scope the trigger with `paths:` so the job only runs when ADRs change.
- Commit a config file (see [Configuration](/guides/configuration/)) so local
  and CI runs agree.
- Keep the per-file cache out of CI runners (it is a local speed-up); a cold
  run in CI is already fast.
