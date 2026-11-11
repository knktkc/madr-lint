---
title: madr/required-sections
description: Enforce that every ADR contains the required heading sections.
---

Enforces that an ADR Markdown file contains every heading listed in the `sections` option.

The rule walks the Markdown AST, collects the text of every heading (any level, with inline markup stripped via `mdast-util-to-string`, so `## **Status**` matches `Status`), and reports one diagnostic for each required heading that is not present.

## What it checks

- `missingSection` — a required heading is not found among the file's headings. One diagnostic is emitted per missing section. The message is `Missing required section: "<section>"`. The diagnostic carries `data.section` (the missing heading) and `data.found` (every heading text seen in the file, for debugging). It is a file-level diagnostic — there is no node to point at.

Heading matching is controlled by `matchMode`: `exact` requires the full trimmed heading to equal the required text; `startsWith` matches any heading that begins with the required text (e.g. `Decision Outcome` matches `Decision Outcome (Architectural)`).

## Examples

### Valid

A file with the three default required sections:

```markdown
# ADR-0001: Use mise for runtime management

## Context and Problem Statement
...

## Considered Options
* ...

## Decision Outcome
Adopted: ...
```

### Invalid

```markdown
# ADR-0001: Missing context

## Considered Options
* ...

## Decision Outcome
...
```

Emits 1 diagnostic: `Missing required section: "Context and Problem Statement"`.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `sections` | `string[]` | `['Context and Problem Statement', 'Considered Options', 'Decision Outcome']` | Required heading texts. Order does not matter. |
| `matchMode` | `'exact' \| 'startsWith'` | `'exact'` | How each required entry is compared against a heading. `startsWith` lets `Decision Outcome (Architectural)` satisfy `Decision Outcome`. |

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/required-sections': ['error', {
      sections: ['Context', 'Decision', 'Consequences'],
      matchMode: 'startsWith',
    }],
  },
});
```

## MADR version compatibility

| Version | Applies |
|---|---|
| v2 | yes |
| v3 | yes |
| v4 | yes |

The default sections are the headings that the MADR templates do not mark as optional: [v2 (2.1.2)](https://github.com/adr/madr/blob/2.1.2/template/template.md), [v3 (3.0.0)](https://github.com/adr/madr/blob/3.0.0/template/adr-template.md), [v4 (4.0.0)](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md). They are the same in all three versions, so the defaults apply to v2/v3/v4 alike.

`Consequences` is not in the defaults. It is optional in v3/v4, and the v2 template uses `Positive Consequences` and `Negative Consequences` (both optional) instead. To require it, add it to `sections`.

## When to disable

Set `madr/required-sections` to `off` only when migrating an ADR collection that uses different section names. Prefer overriding `sections` (and/or switching to `startsWith`) to preserve some level of validation.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/required-sections/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/required-sections/spec.md>
