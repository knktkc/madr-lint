# madr/required-sections

## Description

Enforces that an ADR Markdown file contains every heading listed in the
`sections` option. Default sections are the headings that the MADR
templates do not mark as optional; they are the same in v2, v3, and v4.

## MADR version compatibility

Applies to v2, v3, v4. Templates:

- v2: <https://github.com/adr/madr/blob/2.1.2/template/template.md>
- v3: <https://github.com/adr/madr/blob/3.0.0/template/adr-template.md>
- v4: <https://github.com/adr/madr/blob/4.0.0/template/adr-template.md>

| Heading | v2 | v3 | v4 |
|---|---|---|---|
| Context and Problem Statement | required | required | required |
| Considered Options | required | required | required |
| Decision Outcome | required | required | required |
| Consequences | absent (`Positive Consequences` / `Negative Consequences`, optional) | optional | optional |

The default `sections` are the three required headings (#214). The 4.0.0
README says the minimal template "only contains mandatory sections"; it
also includes `### Consequences`, marked optional.

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
    "Considered Options",
    "Decision Outcome"
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
| `v2-template.md` | v2 template headings, including `Positive Consequences` / `Negative Consequences` |
| `v4-template.md` | v4 frontmatter with the 3 required headings and no optional `Consequences` |
| `all-three-extra.md` | required + additional optional headings (Decision Drivers, Consequences, Links) |

### Invalid

| Fixture | Reason |
|---|---|
| `missing-context.md` | no `## Context and Problem Statement` → 1 diagnostic |
| `missing-outcome.md` | no `## Decision Outcome` → 1 diagnostic |
| `missing-options.md` | no `## Considered Options` → 1 diagnostic |
| `missing-all.md` | none of the required headings → 3 diagnostics |

## Heading text extraction

Headings can contain inline markup (e.g. `## **Important** Context and Problem Statement`). The rule must extract the full text content via `mdast-util-to-string`, not just `children[0].value`.

## When to disable

Disable (`'madr/required-sections': 'off'`) only when migrating an ADR collection that uses different section names. Prefer overriding `sections` to preserve some level of validation.
