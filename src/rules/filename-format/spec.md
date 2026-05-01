# madr/filename-format

## Description

ADR files must follow the naming convention `NNNN-kebab-case-title.md`:

- `NNNN` is exactly four decimal digits, zero-padded
- followed by a single hyphen
- followed by one or more lowercase ASCII letters, digits, or hyphens (kebab-case)
- ending with `.md`

## MADR version compatibility

Applies to v2, v3, v4. The filename pattern is the same across MADR versions.

## Diagnostic

- `messageId`: `invalidFilename`
- `data`: `{ filename: string, expected: string }`
- Default severity in `recommended` preset: `error`
- No source line/column (file-level diagnostic).

## Given / When / Then

### Valid

| Filename | Why |
|---|---|
| `0001-mise.md` | canonical |
| `9999-multi-word-kebab-title.md` | many hyphens, all lowercase |
| `0042-numbers-in-name.md` | digits permitted in slug |

### Invalid

| Filename | Reason |
|---|---|
| `1-too-short.md` | leading number not zero-padded to 4 digits |
| `0001_underscore.md` | underscore separator instead of hyphen |
| `0001-Title-Case.md` | uppercase letters in slug |
| `not-numbered.md` | no leading 4-digit prefix |
| `0001nohyphen.md` | missing hyphen after the number |

## Options

```json
{
  "pattern": "^[0-9]{4}-[a-z0-9-]+\\.md$"
}
```

The default regex can be overridden via the `pattern` option (string).

## Rationale

A consistent filename pattern enables:

- Sorting ADRs in chronological / numerical order in directory listings
- Grep-friendly identifiers (the `NNNN-` prefix)
- Cross-references like "ADR-0042" mapping unambiguously to a file

## When to disable

Disable (`'madr/filename-format': 'off'`) only when migrating an existing ADR
collection that uses a different convention. Prefer overriding `pattern` to
preserve some level of validation.
