# madr/required-sections

## Description

Enforces that an ADR Markdown file contains every heading listed in the
`sections` option. Default sections are the minimum that every MADR
document should have regardless of version.

## MADR version compatibility

Applies to v2, v3, v4. Heading section names are largely consistent
across MADR versions:

- v2 template: <https://github.com/adr/madr/tree/v2.1.2>
- v3 template: <https://github.com/adr/madr/tree/v3.0.0>
- v4 template: <https://github.com/adr/madr/blob/develop/template/adr-template.md>

The default `sections` (`'Context and Problem Statement'`, `'Decision Outcome'`, `'Consequences'`) appear in all three versions' templates.

## Diagnostic

- `messageId`: `missingSection`
- `data`: `{ section: string, found: string[] }`
  - `section`: the required heading text that was not found
  - `found`: every heading text encountered in the file (for debugging)
- Default severity in `recommended` preset: `error`
- File-level diagnostic (no source line/column on the missing case — there is no node to point at)

## Options

```json
{
  "sections": [
    "Context and Problem Statement",
    "Decision Outcome",
    "Consequences"
  ],
  "matchMode": "exact"
}
```

- `sections: string[]` — required heading text values. Order does not matter.
- `matchMode: 'exact' | 'startsWith'` — how to compare heading text against required entries. `'exact'` matches the full trimmed string; `'startsWith'` matches headings that begin with the required text (e.g. `'Decision Outcome'` matches `'Decision Outcome (Architectural)'`).

## Given / When / Then

### Valid

| Fixture | Reason |
|---|---|
| `all-three.md` | exactly the 3 default required headings |
| `all-three-extra.md` | required + additional optional headings (Decision Drivers, Considered Options, Links) |

### Invalid

| Fixture | Reason |
|---|---|
| `missing-context.md` | no `## Context and Problem Statement` → 1 diagnostic |
| `missing-outcome.md` | no `## Decision Outcome` → 1 diagnostic |
| `missing-consequences.md` | no `## Consequences` → 1 diagnostic |
| `missing-all.md` | none of the required headings → 3 diagnostics |

## Heading text extraction

Headings can contain inline markup (e.g. `## **Important** Context and Problem Statement`). The rule must extract the full text content via `mdast-util-to-string`, not just `children[0].value`.

## When to disable

Disable (`'madr/required-sections': 'off'`) only when migrating an ADR collection that uses different section names. Prefer overriding `sections` to preserve some level of validation.
