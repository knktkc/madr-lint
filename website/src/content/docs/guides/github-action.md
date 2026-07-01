---
title: GitHub Action
description: Run madr-lint in CI with GitHub Actions, including SARIF upload to code scanning.
---

`madr-lint` is a normal npm CLI, so running it in GitHub Actions is a single
step. Because it exits non-zero on `error`-severity diagnostics, a failing lint
fails the job.

## Minimal workflow

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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx madr-lint
```

If `madr-lint` is a dev dependency of your project, install first and run the
local binary instead:

```yaml
      - run: npm ci
      - run: npx madr-lint
```

## Upload SARIF to code scanning

The `sarif` reporter integrates with GitHub code scanning, so findings show up
inline on the PR. Use `if: always()` so the SARIF is uploaded even when the lint
fails, and don't let the lint step abort the upload:

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
      - name: Lint ADRs
        run: npx madr-lint --format sarif > madr-lint.sarif
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
- Keep the per-file cache out of CI runners (it is a local speed-up); a cold run
  in CI is already fast.
