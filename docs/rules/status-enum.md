# madr/status-enum

Validates that an ADR's `status` field (in YAML frontmatter) is one of the allowed values.

## Description

Reads `context.frontmatter.status` and compares it against the configured allowed values. Reports two distinct diagnostics:

- `missingStatus` — frontmatter is absent, or the `status` field is missing / not a string
- `invalidStatus` — `status` is present but not in the allowed enum

Comparison is case-insensitive by default and supports prefix matching for transitional states like `superseded by ADR-0042`.

## Examples

### Valid

```markdown
---
status: accepted
date: 2026-05-01
---

# ADR-0001: ...
```

```markdown
---
status: superseded by ADR-0042
---
```

```markdown
---
status: ACCEPTED
---
```

(case-insensitive default)

### Invalid

```markdown
# ADR-0001: ...
```
→ `missingStatus` (no frontmatter)

```markdown
---
date: 2026-05-01
---
```
→ `missingStatus` (status field missing)

```markdown
---
status: pending
---
```
→ `invalidStatus`

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `values` | `string[]` | `['proposed', 'rejected', 'accepted', 'deprecated']` | Exact-match allowed status values. |
| `prefixValues` | `string[]` | `['superseded by']` | startsWith-match allowed prefixes. |
| `caseSensitive` | `boolean` | `false` | Case sensitivity of comparisons. |

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/status-enum': ['error', {
      values: ['draft', 'review', 'final', 'archived'],
      prefixValues: [],
      caseSensitive: true,
    }],
  },
});
```

## MADR version compatibility

| Version | Applies | Notes |
|---|---|---|
| v2 | yes | bold-list `- **Status**: Proposed` in body. Extracted via the metadata bridge — see [ADR-0006](../adr/0006-v2-bold-list-bridge.md). |
| v3 | yes | frontmatter `status: ...` |
| v4 | yes | frontmatter `status: ...` |

The rule reads `context.metadata.status`, which combines frontmatter and bold-list. Frontmatter wins on conflict.

## When to disable

Disable when migrating from a system with different status vocabulary. Prefer overriding `values` to preserve some validation.

## Source

- Spec: [`src/rules/status-enum/spec.md`](../../src/rules/status-enum/spec.md)
- MADR v4 template: <https://github.com/adr/madr/blob/develop/template/adr-template.md>
