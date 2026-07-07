---
title: madr/supersedes-bidirectional
description: Frontmatter supersedes and superseded-by must reference each other consistently.
---

A cross-file project rule that verifies the `supersedes` and `superseded-by` frontmatter fields point at each other consistently across the ADR collection.

When ADR-A supersedes ADR-B, A's frontmatter should declare `supersedes: ADR-B` and B's frontmatter should declare `superseded-by: ADR-A`. The rule reads each file's frontmatter directly (not the merged metadata bridge), builds an `ADR-NNNN → file` index by basename (`^(\d{4})-`), and checks both directions. Files without an `NNNN-` prefix are not addressable and are skipped.

Both fields accept either a single string or an array of strings (many-to-one supersession). Non-string, non-array values (number, null, boolean) are silently ignored — type checks are not this rule's concern.

## What it checks

- `unknownReference` — a `supersedes` or `superseded-by` value references an `ADR-NNNN` for which no file exists. Message: ``Frontmatter `<direction>: <ref>` references an ADR that does not exist``, with `data.ref` and `data.direction`. Emitted on the file that contains the dangling reference.
- `missingBackReference` — file A declares a forward reference to file B, but B does not declare the reciprocal reference. Message: ``<source> declares `<direction>: <ref>`, but <ref> (this file) does not back-reference it via <expected>``. Emitted on the file that is missing the back reference, naming the `source` file that pointed at it and the `expected` reference it should add.

## Examples

### Valid

```yaml
# 0001-old.md
---
status: superseded by ADR-0042
superseded-by: ADR-0042
---
```

```yaml
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
```

```yaml
# 0042-new.md
---
supersedes: ADR-0001
---
```

Emits `missingBackReference` on `0001-old.md` with `data.expected: 'ADR-0042'`.

### Invalid — unknown reference

```yaml
# 0042-x.md
---
supersedes: ADR-9999   # no 9999-*.md exists
---
```

Emits `unknownReference` on `0042-x.md` with `data.ref: 'ADR-9999'`.

## 🔧 Autofix

This rule is **fixable** (`madr-lint --fix`) — the first **cross-file** fix in madr-lint. When a `missingBackReference` is found, the fix inserts the reciprocal `<direction>: <expected>` line into the **target** file's frontmatter, immediately before the closing `---`. The frontmatter block is treated as opaque lines (no YAML reparse/reserialize), so every other byte — key order, comments, the file's newline style — is preserved.

Before (`0001-old.md`, missing its back-reference to `0042-new.md`):

```yaml
---
status: superseded by ADR-0042
---
```

After `madr-lint --fix`:

```yaml
---
status: superseded by ADR-0042
superseded-by: ADR-0042
---
```

`unknownReference` is **not** fixable (it is contextual — only you know the correct ADR number). A `missingBackReference` is **not** fixed when:

- **The target has no frontmatter** — a v2 body-list ADR or a bare file. A frontmatter block is never created.
- **The key already exists** — if the target already declares `superseded-by:` (or `supersedes:`) with a different or partial value, the fix declines rather than duplicate the key or rewrite/append a value (out of scope). The diagnostic remains for you to resolve by hand.
- **Many-to-one, same pass** — when two source ADRs both need a back-reference in the *same* target, one insertion is applied per pass; the remaining one is reported (it needs an array value, which is a manual edit).

## Options

This rule has no options.

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/supersedes-bidirectional': 'error',
  },
});
```

## MADR version compatibility

| Version | Applies | Notes |
|---|---|---|
| v2 | no | `- **Supersedes**: ADR-NNNN` is body content, not frontmatter |
| v3 | yes | frontmatter `supersedes` / `superseded-by` |
| v4 | yes | same |

This rule reads frontmatter only, so it does not apply to MADR v2 body-list metadata.

## When to disable

Disable for repos that track supersession outside ADR frontmatter — e.g. via Git tags, an external registry, or only a `status: superseded by ...` line without explicit `supersedes` / `superseded-by` fields.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/supersedes-bidirectional/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/supersedes-bidirectional/spec.md>
