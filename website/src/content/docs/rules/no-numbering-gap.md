---
title: madr/no-numbering-gap
description: Detect gaps in ADR numbering (e.g. 0001 and 0003 exist but 0002 is missing).
---

A cross-file project rule that detects gaps in ADR numbering — when files numbered `0001-…` and `0003-…` exist without `0002-…`.

This is a **convention-only** rule, not a MADR spec rule, so it is **not enabled** by the `recommended` preset (default severity `off`). MADR does not require numbering to be gap-free; teams legitimately reserve numbers, discard draft ADRs, or merge from forks at different paces. Opt in explicitly when your team treats numbering as a strictly contiguous sequence.

The rule maps each ADR number (`^(\d{4})-` from the basename) to its file, sorts the numbers, and reports each gap. Files without an `NNNN-` prefix (e.g. `template.md`, `README.md`) are ignored. If fewer than two numbered files exist, it does nothing.

## What it checks

- `numberingGap` — a gap exists between two consecutive present numbers. Message: `Numbering gap: missing <missing> between ADR-<from> and ADR-<to>`, with `data.from` (the number before the gap), `data.to` (the number after), and `data.missing` (the comma-joined missing numbers). The diagnostic is emitted on the file at `to` (the higher side of the gap).

## Examples

### Valid (no gaps)

```text
0001-a.md
0002-b.md
0003-c.md
```

### Single gap

```text
0001-a.md
0003-c.md   (0002 is missing)
```

Emits 1 diagnostic on `0003-c.md`: `data: { from: '0001', to: '0003', missing: '0002' }`.

### Wide gap

```text
0001-a.md
0005-e.md   (0002, 0003, 0004 missing)
```

Emits 1 diagnostic on `0005-e.md`: `data.missing: '0002, 0003, 0004'`. Each contiguous gap produces one diagnostic.

## Options

This rule has no options.

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    'madr/no-numbering-gap': 'error', // opt in (default is 'off')
  },
});
```

## MADR version compatibility

| Version | Applies |
|---|---|
| v2 | yes |
| v3 | yes |
| v4 | yes |

The numbering convention is identical across MADR versions.

## When to disable

Keep this rule off (its default) when your numbering policy reserves slots, when drafts are routinely discarded mid-PR, or when you merge ADRs from multiple forks. Enable it only when numbering must be a contiguous sequence.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-numbering-gap/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-numbering-gap/spec.md>
