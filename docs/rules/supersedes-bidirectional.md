# madr/supersedes-bidirectional

Cross-file project rule. Verifies that `supersedes` and `superseded-by` frontmatter fields point at each other consistently.

## Description

When ADR-A supersedes ADR-B:
- ADR-A's frontmatter should declare `supersedes: ADR-B`
- ADR-B's frontmatter should declare `superseded-by: ADR-A`

This rule walks every ADR file's frontmatter, builds a forward/backward reference graph, and reports two distinct issues:

- **`unknownReference`** — frontmatter references an ADR-NNNN that does not correspond to any file in the project (dangling reference)
- **`missingBackReference`** — file A declares a forward reference to file B, but B does not declare the matching back reference

## Examples

### Valid

```yaml
# 0001-old.md
---
status: superseded by ADR-0042
superseded-by: ADR-0042
---

# 0042-new.md
---
status: accepted
supersedes: ADR-0001
---
```

### Invalid — missing back reference

```yaml
# 0001-old.md
---
# (no superseded-by here)
---

# 0042-new.md
---
supersedes: ADR-0001
---
```

→ `0001-old.md` reports `missingBackReference` with `data.expected: 'ADR-0042'`

### Invalid — dangling reference

```yaml
# 0042-x.md
---
supersedes: ADR-9999    # No 9999-*.md exists
---
```

→ `0042-x.md` reports `unknownReference`

## Reference format

References are strings of the form `ADR-NNNN` (4-digit zero-padded). Both fields accept either a single string or an array:

```yaml
supersedes: ADR-0001            # single
supersedes: [ADR-0001, ADR-0002] # array (many-to-one supersession)
```

Non-string and non-array values (number, null, boolean) are silently ignored — type checks are not this rule's concern. The file with number `NNNN` is found by basename pattern `^(NNNN)-`.

## MADR version compatibility

| Version | Applies | Notes |
|---|---|---|
| v2 | NO | bold-list `- **Supersedes**: ADR-NNNN` is body content, not frontmatter |
| v3 | yes | frontmatter `supersedes` / `superseded-by` |
| v4 | yes | same |

## Options

(none for v0.1)

## When to disable

Disable for repos that track supersession outside ADR frontmatter (e.g. via Git tags, an external registry, or a `Status: superseded by ...` line only without explicit `supersedes` arrays).

## Source

- Spec: [`src/rules/supersedes-bidirectional/spec.md`](../../src/rules/supersedes-bidirectional/spec.md)
- ADR-0005: project rule API
