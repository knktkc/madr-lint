# madr/no-duplicate-numbering

## Description

Cross-file rule. Reports when two or more ADR files share the same `NNNN-` number prefix in their basename.

This is the first **project rule** in madr-lint (see ADR-0005 for the API). It receives all files at once and emits diagnostics on each member of any duplicate group.

## MADR version compatibility

Applies to v2, v3, v4 (filename convention is identical across versions).

## Diagnostic

- `messageId`: `duplicateNumber`
- `data`: `{ number: string, paths: string }` (paths joined by `', '`)
- Emitted on **each member** of a duplicate group (so reviewers see the conflict in every file's listing)
- Default severity in `recommended`: `error`

## Options

(none for v0.1)

```json
{}
```

## Examples

### Valid

```
docs/adr/
  0001-foo.md
  0002-bar.md
  0003-baz.md
```

→ no diagnostics

### Invalid

```
docs/adr/
  0001-foo.md
  0001-bar.md   ← same 0001
```

→ 2 diagnostics (one on each file), both with `messageId: 'duplicateNumber'`, `data.number: '0001'`, `data.paths: '0001-foo.md, 0001-bar.md'`

```
docs/adr/
  0001-foo.md
  0001-bar.md
  0002-baz.md
  0002-qux.md
```

→ 4 diagnostics (2 per duplicate group)

## Numbering extraction

The rule reads `^(\d{4})-` from the file basename. Files that do not match (e.g. `template.md`, `README.md`, `0001invalid.md` without a hyphen) are silently ignored — they are not the concern of this rule. `madr/filename-format` flags those.

## When to disable

There is essentially no reason to disable this rule. If two ADRs share a number, one must be wrong.
