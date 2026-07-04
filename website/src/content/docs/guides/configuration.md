---
title: Configuration
description: Configure madr-lint with a config file — presets, MADR version, adrDir, ignore patterns, cache, and per-rule severities and options.
---

`madr-lint` is configured with a config file at the root of your project. A
TypeScript config (`madr-lint.config.ts`) is canonical; JSON is supported as a
fallback.

## Config file resolution

The CLI looks for the first file that exists, in this order:

```
.madrlintrc.json
.madrlintrc.ts
.madrlintrc.mts
.madrlintrc.js
.madrlintrc.mjs
.madrlintrc.cjs
madr-lint.config.ts
madr-lint.config.mts
madr-lint.config.js
madr-lint.config.mjs
madr-lint.config.cjs
```

`.json` is parsed directly; every other extension is loaded through
[`jiti`](https://github.com/unjs/jiti), so TypeScript and both module systems
work without a build step.

> **Config files are code.** A TypeScript/JavaScript config is **executed**
> when loaded — the same trust model as ESLint configs. Only run lints with
> `--config` paths or config files from sources you trust.

If **no** config file is found and you don't set any rules, the CLI falls back
to the `madr-lint:recommended` preset so it is useful with zero config.

## `defineConfig`

Use the `defineConfig` helper for type-safe autocompletion. It is the identity
function at runtime.

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  madrVersion: 'auto',
  adrDir: 'docs/adr',
  ignorePatterns: ['README.md', 'template.md'],
  rules: {
    'madr/required-sections': 'error',
    'madr/filename-format': ['error', { pattern: '^[0-9]{4}-.+\\.md$' }],
    'madr/no-numbering-gap': 'off',
  },
});
```

The JSON equivalent (`.madrlintrc.json`):

```json
{
  "extends": ["madr-lint:recommended"],
  "madrVersion": "auto",
  "adrDir": "docs/adr",
  "ignorePatterns": ["README.md", "template.md"],
  "rules": {
    "madr/required-sections": "error",
    "madr/filename-format": ["error", { "pattern": "^[0-9]{4}-.+\\.md$" }],
    "madr/no-numbering-gap": "off"
  }
}
```

## Top-level options

| Option | Type | Default | Description |
|---|---|---|---|
| `extends` | `string[]` | `[]` | Presets to extend. Currently `'madr-lint:recommended'`. |
| `madrVersion` | `'v2' \| 'v3' \| 'v4' \| 'auto'` | `'auto'` | Target MADR version. `auto` detects per file. |
| `adrDir` | `string` | `'docs/adr'` | Directory linted when no paths are passed on the CLI. |
| `rules` | `Record<string, RuleSeverity>` | `{}` | Per-rule severity and options (see below). |
| `ignorePatterns` | `string[]` | `[]` | Paths to skip (see [Ignore patterns](#ignore-patterns)). |
| `cache` | `boolean` | `true` | Enable the per-file content-hash cache. |
| `cacheLocation` | `string` | `'.madr-lint/cache'` | Directory for the cache manifest. |

## Configuring rules

Each entry in `rules` maps a rule name to either a **severity string** or a
**tuple** of `[severity, options]`.

```typescript
rules: {
  // severity only — uses the rule's default options
  'madr/status-enum': 'error',

  // turn a rule off
  'madr/no-numbering-gap': 'off',

  // severity + options
  'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
}
```

Severities are `'error'`, `'warn'`, or `'off'`:

- **`error`** — reported and makes the CLI exit with code `1`.
- **`warn`** — reported but does not fail the run.
- **`off`** — the rule does not run.

Options in the tuple are merged over the rule's `defaultOptions` and validated
against the rule's JSON Schema. **Invalid options fail fast** with a clear
message and exit code `2`:

```text
Invalid rule options in config: Invalid options for rule madr/filename-format: data/pattern must be string
```

See the [Rules reference](/rules/) for the options each rule accepts.

## Presets

### `madr-lint:recommended`

Enables the spec-grounded rules at sensible severities. Extend it and override
individual rules as needed.

| Rule | Recommended severity |
|---|---|
| `madr/required-sections` | `error` |
| `madr/status-enum` | `error` |
| `madr/date-iso8601` | `error` |
| `madr/filename-format` | `error` |
| `madr/no-broken-links` | `error` |
| `madr/no-duplicate-numbering` | `error` |
| `madr/supersedes-bidirectional` | `error` |
| `madr/no-numbering-gap` | `off` (convention-only — opt in) |

Your `rules` entries are merged **over** the preset, so you only list what you
change:

```typescript
export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    // adopt the numbering-gap convention
    'madr/no-numbering-gap': 'warn',
  },
});
```

## MADR version

`madrVersion` selects which MADR spec the rules validate against:

- **`auto`** (default) — detect per file (frontmatter ⇒ v3/v4, body-list ⇒ v2).
- **`v2`** — metadata is a body list (`* Status:` / `- **Status**:`).
- **`v3` / `v4`** — metadata is YAML frontmatter.

Metadata-reading rules such as `madr/status-enum` and `madr/date-iso8601` read a
combined view of YAML frontmatter **and** v2 body-list metadata, so they work
across versions.

## Ignore patterns

`ignorePatterns` skips files by path. Patterns are matched with
[picomatch](https://github.com/micromatch/picomatch), so common forms all work:

- exact basename — `README.md`
- full project-relative path — `docs/adr/template.md`
- path suffix — `adr/template.md`
- trailing wildcard — `9999-*`
- full glob — `docs/**/draft-*.md`

```typescript
export default defineConfig({
  ignorePatterns: ['README.md', 'template.md', '9999-*', 'docs/**/draft-*.md'],
});
```

## Cache

A per-file content-hash cache speeds up re-runs. It is keyed by file content and
invalidated when the package version or resolved config changes. Cross-file
(project) rules always re-run.

```typescript
export default defineConfig({
  cache: true, // default
  cacheLocation: '.madr-lint/cache',
});
```

Disable it from the CLI with `--no-cache`, or point it elsewhere with
`--cache-dir`. See the [CLI reference](/guides/cli/).
