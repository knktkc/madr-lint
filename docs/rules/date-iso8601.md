# madr/date-iso8601

Validates that an ADR's `date` field (in YAML frontmatter) is a valid ISO 8601 calendar date in `YYYY-MM-DD` format.

## Description

Strict calendar validation:

- Wrong shape (`2026-5-1`, `26-05-01`, `today`) → invalid
- Wrong calendar (`2026-13-01`, `2026-02-31`, `2025-02-29`) → invalid
- Round-tripped Date object (gray-matter parses unquoted `date: 2026-05-01` to a `Date`) → valid

The validation uses the JavaScript `Date.UTC` round-trip technique so leap years and month lengths are handled correctly without external libraries.

## Examples

### Valid

```markdown
---
date: 2026-05-01
---
```

```markdown
---
date: '2024-02-29'
---
```
(leap year)

```markdown
---
date: 2025-12-31
---
```

### Invalid

| Frontmatter | Why |
|---|---|
| (no frontmatter) | `missingDate` |
| `---\nstatus: x\n---` | `missingDate` (date field absent) |
| `date: 2026-13-01` | `invalidDate` (no month 13) |
| `date: 2026-02-31` | `invalidDate` (Feb has no 31) |
| `date: 2025-02-29` | `invalidDate` (2025 not a leap year) |
| `date: '2026-5-1'` | `invalidDate` (unpadded) |
| `date: '26-05-01'` | `invalidDate` (2-digit year) |
| `date: today` | `invalidDate` |

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field` | `string` | `'date'` | Metadata key to read (frontmatter or v2 bold-list, with key normalization). Override for projects using `created` or `updated`. |

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/date-iso8601': ['error', { field: 'created' }],
  },
});
```

## MADR version compatibility

| Version | Applies | Notes |
|---|---|---|
| v2 | **NO** | bold-list `- **Date**: 2026-05-01` is body content; this rule reads YAML frontmatter only. |
| v3 | yes | frontmatter `date: ...` |
| v4 | yes | frontmatter `date: ...` |

## Property-based testing

The rule's tests include `fast-check` property tests:
- 200 random `Date` round-trips through `toISOString().slice(0, 10)` — must always validate
- 200 random non-conforming strings — must always produce a single rejection diagnostic

This catches calendar-arithmetic edge cases (leap years, month-end boundaries) that example-based tests miss.

## When to disable

Disable when migrating from a system using a different date format. Prefer overriding `field` to read a custom frontmatter key.

## Source

- Spec: [`src/rules/date-iso8601/spec.md`](../../src/rules/date-iso8601/spec.md)
- ISO 8601: <https://en.wikipedia.org/wiki/ISO_8601>
