---
title: madr/status-enum
description: Validate that an ADR's status field is one of the allowed values.
---

Validates that an ADR's `status` field is one of the allowed values.

The rule reads `context.metadata.status`, which is YAML frontmatter **merged** with v2 body-list metadata. This means it supports MADR v2 (both the bold `- **Status**:` and the plain `* Status:` list shapes), v3 and v4. On conflict, frontmatter wins; explicit null/undefined frontmatter values are skipped so a v2 body-list value is preserved.

## What it checks

- `missingStatus` — no `status` field is found in the merged metadata (checked in both frontmatter and v2 bold-list), or the value is not a string. Message: `Metadata does not contain a "status" field (checked frontmatter and v2 bold-list)`.
- `invalidStatus` — `status` is present but is neither an exact match against `values` nor a prefix match against `prefixValues`. Message: `Status "<status>" is not one of: <allowed>`, with `data.status` and `data.allowed` (the allowed values plus each prefix rendered as `"<prefix> ..."`).

Comparison is case-insensitive by default (`caseSensitive: false`). Prefix matching handles transitional states such as `superseded by ADR-0042` matching the `superseded by` prefix.

## Examples

### Valid

```markdown
---
status: accepted
date: 2026-05-01
---

# ADR-0001: ...
```

Case-insensitive by default, so `status: ACCEPTED` is valid. Prefix match:

```markdown
---
status: superseded by ADR-0042
---
```

MADR v2 body-list form is also read:

```markdown
# ADR-0001: ...

- **Status**: accepted
- **Date**: 2026-05-01
```

### Invalid

```markdown
# ADR-0001: ...
```

Emits `missingStatus` (no metadata at all).

```markdown
---
status: pending
---
```

Emits `invalidStatus` (`pending` is not in the allowed enum).

## 🔧 Autofix

This rule is **fixable** (`madr-lint --fix`) — but only for **v2 body-list** status values, and only when the value maps onto the **configured enum** unambiguously. Frontmatter values are never rewritten (YAML-aware editing is out of scope).

Fixed — normalized to the canonical configured value:

| Before | After | Kind |
|---|---|---|
| `- Status: Accepted` | `- Status: accepted` | case difference † |
| `- Status: depricated` | `- Status: deprecated` | curated misspelling |
| `- Status: superceded by ADR-0042` | `- Status: superseded by ADR-0042` | prefix typo (tail preserved) |
| `- Status: Superseded By ADR-0042` | `- Status: superseded by ADR-0042` | prefix case (tail preserved) † |

† Case-only corrections apply under `caseSensitive: true`. With the default `caseSensitive: false`, a value that differs only by case is **valid** — it is never flagged, so there is nothing to fix. The misspelling rows (`depricated`, `superceded by …`) are invalid regardless of case setting and are fixed by default.

**Not** fixed (reported, never rewritten):

- **Ambiguous corrections** — when a value case-folds onto two configured entries, or matches two configured prefixes, no fix is offered.
- **Unconfigured targets** — a synonym only maps to a value/prefix that is actually in your `values` / `prefixValues`; if you removed `superseded by`, `superceded by …` is not fixed.
- **Genuine typos with no unique target** — e.g. `acccepted` (does not case-fold to any allowed value).
- **Frontmatter-sourced values** — a `status:` in YAML frontmatter (fix it by hand).

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `values` | `string[]` | `['proposed', 'rejected', 'accepted', 'deprecated']` | Exact-match allowed status values. |
| `prefixValues` | `string[]` | `['superseded by']` | `startsWith`-match allowed prefixes (e.g. `superseded by ADR-0042`). |
| `caseSensitive` | `boolean` | `false` | When `false`, comparisons are case-insensitive. |

```ts
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
| v2 | yes | body-list `- **Status**: proposed` (bold) or `* Status: proposed` (plain), via the metadata bridge |
| v3 | yes | frontmatter `status: ...` |
| v4 | yes | frontmatter `status: ...` |

## When to disable

Set `madr/status-enum` to `off` when migrating from a system with a different status vocabulary. Prefer overriding `values` / `prefixValues` to preserve some validation.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/status-enum/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/status-enum/spec.md>
