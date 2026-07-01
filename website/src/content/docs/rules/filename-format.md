---
title: madr/filename-format
description: Enforce the ADR filename convention NNNN-kebab-case-title.md.
---

Enforces the ADR filename convention `NNNN-kebab-case-title.md`.

The rule tests the file's basename against a configurable regex. The default pattern is `^[0-9]{4}-[a-z0-9-]+\.md$`, which requires:

- `NNNN` — exactly four decimal digits, zero-padded
- a single hyphen
- one or more lowercase ASCII letters, digits, or hyphens (kebab-case)
- the `.md` extension

The pattern is compiled through the ReDoS-safety guard (`assertSafeRegex`) before use. The default is intentionally stricter than some MADR examples (it forbids uppercase letters, underscores, and non-`.md` extensions); relax it via the `pattern` option.

## What it checks

- `invalidFilename` — the basename does not match the configured `pattern`. Message: `Filename "<filename>" does not match expected pattern "<expected>"`, with `data.filename` and `data.expected`. This is a file-level diagnostic (no source line/column).

## Examples

### Valid

```text
0001-mise.md
9999-multi-word-kebab-title.md
0042-numbers-in-name.md
```

### Invalid

```text
1-too-short.md         (number not zero-padded to 4 digits)
0001_underscore.md     (underscore separator instead of hyphen)
0001-Title-Case.md     (uppercase letters in slug)
not-numbered.md        (no leading 4-digit prefix)
0001nohyphen.md        (missing hyphen after the number)
0001-trailing-dot..md  (double dot before .md)
0001-test.markdown     (wrong extension, must be .md)
0001-.md               (empty slug)
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `pattern` | `string` | `^[0-9]{4}-[a-z0-9-]+\.md$` | Regex (as a string) the basename must match. Override to relax or tighten. |

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/filename-format': ['error', {
      pattern: '^[0-9]{4}-.+\\.md$', // looser: any characters in the slug
    }],
  },
});
```

## MADR version compatibility

| Version | Applies |
|---|---|
| v2 | yes |
| v3 | yes |
| v4 | yes |

The filename convention is identical across MADR versions.

## When to disable

Set `madr/filename-format` to `off` only when migrating an existing ADR collection that uses a different convention. Prefer overriding `pattern` to preserve some level of validation.

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/filename-format/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/filename-format/spec.md>
