# madr/required-sections

Enforces that ADR Markdown files contain every heading listed in the `sections` option.

## Description

ADRs benefit from a predictable structure — readers know where to find context, the decision, and consequences. This rule walks the Markdown AST, collects the text of every heading (any level, with inline markup stripped), and reports a `missingSection` diagnostic for each required heading not found.

## Examples

### Valid

A file with the three default required sections:

```markdown
# ADR-0001: Title

## Context and Problem Statement
...

## Decision Outcome
Adopted: ...

## Consequences
...
```

### Invalid

```markdown
# ADR-0001: Missing context

## Decision Outcome
...

## Consequences
...
```

→ 1 diagnostic: `Missing required section: "Context and Problem Statement"`

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `sections` | `string[]` | `['Context and Problem Statement', 'Decision Outcome', 'Consequences']` | Required heading texts. Order does not matter. |
| `matchMode` | `'exact' \| 'startsWith'` | `'exact'` | How to compare. `'startsWith'` allows headings like `"Decision Outcome (Architectural)"` to satisfy `"Decision Outcome"`. |

```typescript
// madr-lint.config.ts
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

| Version | Applies | Notes |
|---|---|---|
| v2 | yes | template uses the same section names |
| v3 | yes | same |
| v4 | yes | same |

The default sections are the minimum that every MADR document carries across all versions. Override `sections` if your project uses a different convention.

## Heading text extraction

Headings can contain inline markup such as `## **Bold** Title` or `## *Italic* Heading`. The rule extracts the full text content via `mdast-util-to-string`, so `## **Status**` matches `"Status"` (without the asterisks).

## When to disable

Disable (`'madr/required-sections': 'off'`) only when migrating an ADR collection that uses different section names. Prefer overriding `sections` to preserve some level of validation.

## Source

- Spec: [`src/rules/required-sections/spec.md`](../../src/rules/required-sections/spec.md)
- MADR templates: <https://github.com/adr/madr/tree/develop/template>
