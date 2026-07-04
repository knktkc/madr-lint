---
title: Getting started
description: Install madr-lint, run your first lint, and wire it into your project.
---

`madr-lint` is a linter for [MADR](https://adr.github.io/madr/) (Markdown
Architectural Decision Records). It validates ADR structure, status values,
dates, filenames, and cross-file integrity.

## Install

Install it as a dev dependency:

```bash
# npm
npm install --save-dev madr-lint

# pnpm
pnpm add -D madr-lint

# yarn
yarn add -D madr-lint
```

Requires **Node.js 22 or newer**.

You can also run it without installing:

```bash
npx madr-lint --help
```

## Run your first lint

By default `madr-lint` lints the directory configured as `adrDir`
(default: `docs/adr`):

```bash
npx madr-lint
```

Or point it at explicit files or directories — directories are searched
recursively for `.md` files:

```bash
npx madr-lint docs/adr docs/decisions/0007-use-x.md
```

Example output:

```text
docs/adr/0003-use-postgres.md
  error  madr/status-enum        Status "decided" is not one of: proposed,rejected,accepted,deprecated,superseded by ...
  error  madr/required-sections  Missing required section: "Consequences"

2 errors
```

## Enable the recommended rules

Out of the box, when no rules are configured, the CLI falls back to the
`madr-lint:recommended` preset. To make that explicit — and to start
customizing — create a config file:

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  adrDir: 'docs/adr',
});
```

See [Configuration](/guides/configuration/) for every option, and
[Rules](/rules/) for the full rule reference.

## Exit codes

`madr-lint` is CI-friendly:

| Exit code | Meaning |
|---|---|
| `0` | No errors; warning count within `--max-warnings` limit (if set) |
| `1` | One or more `error`-severity diagnostics, or warning count exceeds `--max-warnings` |
| `2` | Usage or configuration error (invalid `--max-warnings` value, missing `--config` file, invalid rule options, unknown `--format`) |

## Next steps

- [Configuration](/guides/configuration/) — config file, presets, and per-rule options
- [CLI](/guides/cli/) — every command-line flag
- [GitHub Action](/guides/github-action/) — run it in CI
- [Rules](/rules/) — what each rule checks and its options
- [Suppressing rules](/guides/suppressing-rules/) — inline `madr-lint-disable` comments
- [Adopting on an existing repo](/guides/adopting-existing-repo/) — baseline legacy violations
