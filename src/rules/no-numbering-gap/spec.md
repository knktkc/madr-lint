# madr/no-numbering-gap

## Description

Cross-file project rule. Detects gaps in ADR numbering — i.e., when files numbered `0001-…` and `0003-…` exist without `0002-…`.

This is a **convention-only** rule, not a spec rule. MADR does not require numbering to be gap-free; some teams reserve numbers, draft and discard ADRs, or merge work at different rates. Default severity is `off` in the `recommended` preset — opt in explicitly when your team treats numbering as strictly contiguous.

## MADR version compatibility

Applies to v2, v3, v4 (numbering convention is identical).

## Diagnostic

- `messageId`: `numberingGap`
- `data`: `{ from: string, to: string, missing: string }`
  - `from`: the 4-digit number BEFORE the gap (e.g. `'0001'`)
  - `to`: the 4-digit number AFTER the gap (e.g. `'0004'`)
  - `missing`: comma-joined list of the gap's missing numbers (e.g. `'0002, 0003'`)
- emitted on the file at `to` (the file on the higher side of the gap), so reviewers see the gap warning when scrolling past the missing numbers
- Default severity: `off` (opt-in)

## Examples

### No gaps (valid)

```
0001-a.md
0002-b.md
0003-c.md
```

### Single gap

```
0001-a.md
0003-c.md   ← 0002 is missing
```

→ 1 diagnostic on `0003-c.md`, `data: { from: '0001', to: '0003', missing: '0002' }`

### Multiple gaps

```
0001-a.md
0003-b.md   ← 0002 missing
0006-c.md   ← 0004, 0005 missing
```

→ 2 diagnostics, one per gap

## Files without an NNNN- prefix are ignored

`template.md`, `README.md`, etc. do not participate in numbering. They are silently excluded from the analysis.

## Options

(none for v0.1)

## When to enable

Enable for projects that treat ADR numbering as a contiguous sequence — e.g. you want to be sure no draft ADR was lost mid-PR.

## When to keep disabled

- Numbering is reserved (a number was set aside but never written up)
- Draft ADRs are discarded mid-process
- ADRs are merged from forks at different paces
