# madr/no-duplicate-numbering

Cross-file rule. Reports when two or more ADRs share the same `NNNN-` number prefix in their basename.

## Description

`madr-lint`'s first **project rule** (see [ADR-0005](../adr/0005-project-rule-api.md)). The runner pre-parses every ADR file once and hands all of them to the rule's `check()` function in a single call, so the rule can index by number and report the duplicates.

Each member of a duplicate group gets its own diagnostic — that way a reviewer scrolling through the output sees the conflict in every file's listing, not just one.

## Examples

### Valid

```
docs/adr/
  0001-mise.md
  0002-aube.md
  0003-oxc.md
```

### Invalid

```
docs/adr/
  0001-foo.md
  0001-bar.md
```

→ 2 diagnostics, both `messageId: duplicateNumber`, `data: { number: '0001', paths: '0001-foo.md, 0001-bar.md' }`

```
docs/adr/
  0001-a.md
  0001-b.md
  0001-c.md
  0002-x.md
  0002-y.md
```

→ 5 diagnostics: 3 for `0001`, 2 for `0002`.

## Options

(none for v0.1)

## MADR version compatibility

| Version | Applies | Notes |
|---|---|---|
| v2 | yes | filename convention is the same |
| v3 | yes | same |
| v4 | yes | same |

## Numbering extraction

The rule reads `^(\d{4})-` from the file basename. Files that do not match (e.g. `template.md`, `README.md`) are silently ignored — they are the concern of `madr/filename-format`, not this rule.

## When to disable

Almost never. If two ADRs share a number, one of them is wrong — by definition.

## Source

- Spec: [`src/rules/no-duplicate-numbering/spec.md`](../../src/rules/no-duplicate-numbering/spec.md)
- ADR-0005: project rule API
