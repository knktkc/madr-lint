---
title: Rules
description: The built-in madr-lint rules — what each checks, whether it is per-file or cross-file, its options, and its recommended severity.
---

Every rule has an ESLint-style name (`madr/<kebab-case>`) and supports the
`error` / `warn` / `off` severities. Rules are either **per-file** (pure checks
over one ADR) or **project** (cross-file integrity). Configure severities and
options in your [config file](/guides/configuration/). A single legitimate
exception does not need a config change — silence it inline with a
[suppression comment](/guides/suppressing-rules/).

## Per-file rules

| Rule | Checks | Options | Recommended |
|---|---|---|---|
| [`madr/required-sections`](/rules/required-sections/) | Required heading sections are present | Yes | `error` |
| [`madr/status-enum`](/rules/status-enum/) | `status` is one of the allowed values | Yes | `error` |
| [`madr/date-iso8601`](/rules/date-iso8601/) | `date` is a valid ISO-8601 date | Yes | `error` |
| [`madr/filename-format`](/rules/filename-format/) | Filename matches the ADR convention | Yes | `error` |

## Project (cross-file) rules

| Rule | Checks | Options | Recommended |
|---|---|---|---|
| [`madr/no-broken-links`](/rules/no-broken-links/) | Relative links resolve to existing files | No | `error` |
| [`madr/no-duplicate-numbering`](/rules/no-duplicate-numbering/) | ADR numbers are unique | No | `error` |
| [`madr/no-numbering-gap`](/rules/no-numbering-gap/) | ADR numbers are contiguous (no gaps) | No | `off` |
| [`madr/supersedes-bidirectional`](/rules/supersedes-bidirectional/) | `supersedes` / `superseded-by` links agree | No | `error` |

`madr/no-numbering-gap` is a convention-only rule and is `off` in the
recommended preset — enable it if your team treats ADR numbering as a
contiguous sequence.

## Severity & options recap

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    'madr/status-enum': 'warn',
    'madr/required-sections': ['error', { sections: ['Context', 'Decision', 'Consequences'] }],
    'madr/no-numbering-gap': 'off',
  },
});
```

See each rule's page for its exact options, and
[Configuration](/guides/configuration/) for the severity and options format.
