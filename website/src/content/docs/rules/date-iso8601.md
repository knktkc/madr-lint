---
title: madr/date-iso8601
description: Validate that an ADR's date field is a real ISO 8601 calendar date (YYYY-MM-DD).
---

Validates that an ADR's `date` field is a valid ISO 8601 calendar date in `YYYY-MM-DD` format.

The rule reads `context.metadata[field]`, which is YAML frontmatter **merged** with v2 body-list metadata (frontmatter wins on conflict; explicit null/undefined frontmatter values are skipped). It therefore supports MADR v2 (bold `- **Date**:` and plain `* Date:` list items), v3 and v4.

`gray-matter` parses an unquoted `date: 2026-05-01` into a JavaScript `Date`; the rule normalizes a `Date` via `toISOString().slice(0, 10)`, keeps a `string` as-is, and treats anything else (null, boolean, number) as missing. Validation uses a `Date.UTC` round-trip so leap years and month lengths are handled correctly without external libraries.

## What it checks

- `missingDate` — the configured field is absent, or its value is not a string / `Date`. Message: `Metadata does not contain a "<field>" field (checked frontmatter and v2 bold-list)`, with `data.field`.
- `invalidDate` — the value is present but not a real `YYYY-MM-DD` date: wrong shape (`2026-5-1`, `26-05-01`, `today`) or a non-existent calendar date (`2026-13-01`, `2026-02-31`, `2025-02-29`). Message: `Date "<date>" is not a valid ISO 8601 calendar date (YYYY-MM-DD)`, with `data.date`.

## Examples

### Valid

```markdown
---
date: 2026-05-01
---
```

Leap-year date (quoted so YAML keeps it a string):

```markdown
---
date: '2024-02-29'
---
```

### Invalid

| Frontmatter | Diagnostic | Reason |
|---|---|---|
| (no `date`) | `missingDate` | field absent |
| `date: 2026-13-01` | `invalidDate` | month 13 |
| `date: 2026-02-31` | `invalidDate` | February has no 31st |
| `date: 2025-02-29` | `invalidDate` | 2025 is not a leap year |
| `date: '2026-5-1'` | `invalidDate` | unpadded month/day |
| `date: '26-05-01'` | `invalidDate` | 2-digit year |
| `date: 'today'` | `invalidDate` | not a date string |

## 🔧 Autofix

This rule is **fixable** (`madr-lint --fix`) — but only for **v2 body-list** dates, where the value has an exact source offset. Frontmatter dates are never rewritten (YAML-aware editing is out of scope), and only **unambiguous** shapes are normalized. Everything else is left as a report-only diagnostic.

Fixed — normalized to `YYYY-MM-DD`:

| Before | After | Shape |
|---|---|---|
| `- Date: 2026/7/3` | `- Date: 2026-07-03` | year-first numeric (`/`, `.` or `-`, single separator) |
| `- Date: 3 Jul 2026` | `- Date: 2026-07-03` | day-first English named month |
| `- Date: July 3, 2026` | `- Date: 2026-07-03` | month-first English named month |

**Not** fixed (reported, never rewritten):

- **Ambiguous day/month order** — `03/07/2026` could be 3 July or 7 March; there is no safe choice, so it is never touched.
- **Two-digit years** — `26/07/03`.
- **Impossible calendar dates** — `2026/2/30`, `2026/13/01`; a fix never turns an invalid date into a *different* valid one.
- **Non-English or unknown month names** — `3 Mai 2026`.
- **Frontmatter-sourced values** — a `date:` in YAML frontmatter (fix an ISO value there by hand).

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `field` | `string` | `'date'` | Metadata key to read (frontmatter or v2 body-list, with key normalization). Override for projects using e.g. `created` or `updated`. |

```ts
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
| v2 | yes | body-list `- **Date**: 2026-05-01`, via the metadata bridge |
| v3 | yes | frontmatter `date: ...` |
| v4 | yes | frontmatter `date: ...` |

## When to disable

Set `madr/date-iso8601` to `off` when migrating from a system that uses a different date format. Prefer overriding `field` to read a custom metadata key.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/date-iso8601/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/date-iso8601/spec.md>
