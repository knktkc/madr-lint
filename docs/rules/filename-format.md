# madr/filename-format

Enforces the ADR filename convention `NNNN-kebab-case-title.md`.

## Description

ADR files must follow the naming convention:

- `NNNN` — exactly four decimal digits, zero-padded
- followed by a single hyphen
- followed by one or more lowercase ASCII letters, digits, or hyphens (kebab-case)
- ending with `.md`

The default pattern is `^[0-9]{4}-[a-z0-9-]+\.md$`.

## Examples

### Valid

```
0001-mise.md
9999-multi-word-kebab-title.md
0042-numbers-in-name.md
```

### Invalid

```
1-too-short.md             — number not zero-padded to 4 digits
0001_underscore.md         — underscore separator instead of hyphen
0001-Title-Case.md         — uppercase letters in slug
not-numbered.md            — no leading 4-digit prefix
0001nohyphen.md            — missing hyphen after number
0001-trailing-dot..md      — double dot before .md
0001-test.markdown         — wrong extension (must be .md)
0001-.md                   — empty slug
```

## Options

| Option    | Type   | Default                       | Description                                                |
|-----------|--------|-------------------------------|------------------------------------------------------------|
| `pattern` | string | `^[0-9]{4}-[a-z0-9-]+\\.md$`  | Regex the basename must match. Override to relax/tighten. |

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/filename-format': ['error', {
      pattern: '^[0-9]{4}-.+\\.md$', // example: looser
    }],
  },
});
```

## MADR version compatibility

| Version | Applies |
|---------|---------|
| v2      | yes |
| v3      | yes |
| v4      | yes |

The filename convention is identical across MADR versions.

## When to disable

Disable (`'madr/filename-format': 'off'`) only when migrating an existing
ADR collection that uses a different convention. Prefer overriding `pattern`
to preserve some level of validation.

## Source

- Spec: [`src/rules/filename-format/spec.md`](../../src/rules/filename-format/spec.md)
- MADR template: <https://github.com/adr/madr/blob/develop/template/adr-template.md>
