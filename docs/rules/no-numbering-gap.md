# madr/no-numbering-gap

Cross-file project rule. Detects gaps in ADR numbering — when files numbered `0001-…` and `0003-…` exist without `0002-…`.

> **Default severity: `off`** in the `recommended` preset. Opt in explicitly when your team treats numbering as a strictly contiguous sequence.

## Description

This is a **convention-only** rule, not a MADR spec rule. MADR does not require numbering to be gap-free; teams legitimately:

- Reserve numbers in advance and never write them up
- Discard draft ADRs mid-process
- Merge ADRs from forks at different paces

If your project does not tolerate any of those, enable this rule and gaps become errors.

## Examples

### No gaps (no diagnostics)

```
0001-a.md
0002-b.md
0003-c.md
```

### Single gap

```
0001-a.md
0003-c.md   ← 0002 missing
```

→ 1 diagnostic on `0003-c.md`: `Numbering gap: missing 0002 between ADR-0001 and ADR-0003`

### Wide gap

```
0001-a.md
0005-e.md   ← 0002, 0003, 0004 missing
```

→ 1 diagnostic on `0005-e.md`: `data: { from: '0001', to: '0005', missing: '0002, 0003, 0004' }`

### Multiple separate gaps

Each contiguous gap produces one diagnostic.

## Diagnostic

- `messageId`: `numberingGap`
- `data`: `{ from: string, to: string, missing: string }`
  - `from`: the 4-digit number BEFORE the gap (e.g. `'0001'`)
  - `to`: the 4-digit number AFTER the gap
  - `missing`: comma-joined list of missing numbers
- emitted on the file at `to` (the file on the higher side of the gap)

## Files without an NNNN- prefix

`template.md`, `README.md`, etc. are silently ignored.

## Options

(none for v0.1)

## How to enable

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    'madr/no-numbering-gap': 'error',  // or 'warn'
  },
});
```

## When to keep it disabled

- Your numbering policy reserves slots
- Drafts are routinely discarded mid-PR
- You merge ADRs from multiple forks

## Source

- Spec: [`src/rules/no-numbering-gap/spec.md`](../../src/rules/no-numbering-gap/spec.md)
- ADR-0005: project rule API
