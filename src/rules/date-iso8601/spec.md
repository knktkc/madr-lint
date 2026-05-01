# madr/date-iso8601

## Description

Validates that an ADR's `date` field (in YAML frontmatter) is a valid ISO 8601 calendar date in `YYYY-MM-DD` format.

Reports two distinct diagnostics:
- `missingDate` — frontmatter is absent, or the configured field is missing / not a string-like value
- `invalidDate` — present but not a valid `YYYY-MM-DD` (wrong shape OR shape correct but the calendar date does not exist, e.g. `2026-02-31`)

The check is strict: `2025-13-01`, `2026-02-30`, `2025-02-29` (non-leap), `2026-1-1` (unpadded), `26-05-01` (2-digit year) are all invalid.

## MADR version compatibility

- **v3, v4**: frontmatter `date: 2026-05-01` → **supported**
- **v2**: bold-list `- **Date**: 2026-05-01` → **NOT supported** (no frontmatter, will trigger `missingDate`). Same scoping as `madr/status-enum`.

## YAML date handling

YAML 1.1 parses `date: 2026-05-01` (without quotes) into a JavaScript `Date` object. `gray-matter` (which we use) does this by default. The rule normalizes:
- `Date` instance → `toISOString().slice(0, 10)`
- `string` → as-is
- anything else (null, boolean, number) → treated as `missingDate`

## Diagnostic

- `messageId`: `missingDate` | `invalidDate`
- `data`:
  - `missingDate`: `{}`
  - `invalidDate`: `{ date: string }`
- Default severity in `recommended` preset: `error`

## Options

```json
{
  "field": "date"
}
```

- `field: string` — frontmatter key to read. Default: `'date'`. Override for projects using `created` or `updated`.

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
(leap-year date)

### Invalid

| Frontmatter | Reason | Diagnostic |
|---|---|---|
| (no frontmatter) | nothing to read | `missingDate` |
| `---\nstatus: x\n---` | `date` field absent | `missingDate` |
| `date: 2026-13-01` | month 13 | `invalidDate` |
| `date: 2026-02-31` | day 31 in February | `invalidDate` |
| `date: 2025-02-29` | non-leap February 29 | `invalidDate` |
| `date: '2026-5-1'` | unpadded month/day | `invalidDate` |
| `date: '26-05-01'` | 2-digit year | `invalidDate` |
| `date: 'today'` | not a date string | `invalidDate` |

## Property-based testing

The rule's tests include `fast-check` property tests:
- Any `Date` round-tripped through `toISOString().slice(0, 10)` must always validate (lossless).
- Random strings that fail the calendar-date contract must always produce `invalidDate`.

## When to disable

Disable when migrating from a system using a different date format. Prefer overriding `field` to read a custom frontmatter key.
