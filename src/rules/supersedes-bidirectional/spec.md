# madr/supersedes-bidirectional

## Description

Cross-file project rule. Verifies that `supersedes` and `superseded-by` frontmatter fields are bidirectionally consistent across the ADR collection.

If ADR-A declares `supersedes: ADR-B`, then ADR-B must declare `superseded-by: ADR-A` (and vice-versa). The rule also flags references to non-existent ADRs.

## MADR version compatibility

- v3, v4: frontmatter fields `supersedes` / `superseded-by` (this rule's target)
- v2: bold-list `- **Supersedes**: ADR-NNNN` is body content. Not supported here.

## Diagnostic

Two distinct messageIds:

- `unknownReference` — frontmatter references `ADR-NNNN` but no file with that number exists in the project
  - data: `{ ref: string, direction: 'supersedes' | 'superseded-by' }`
  - emitted on the file that contains the dangling reference
- `missingBackReference` — file A declares a forward reference to file B, but B does not declare the corresponding back reference
  - data: `{ ref: string, direction: 'supersedes' | 'superseded-by', source: string, expected: string }`
  - emitted on file B (the one missing the back reference), naming `source` (the file that pointed at B)

Default severity: `error`

## Reference format

References are strings of the form `ADR-NNNN` (case-sensitive). The file with that number is found by basename pattern `^(NNNN)-`. Both `supersedes` and `superseded-by` accept either a single string or an array of strings:

```yaml
# Single
supersedes: ADR-0001

# Array
supersedes:
  - ADR-0001
  - ADR-0002
```

Non-string non-array values are silently ignored (the rule does not invent type errors; that is `madr/status-enum`-style enum checks' concern).

## Examples

### Valid

```
0001-old.md:        superseded-by: ADR-0042
0042-new.md:        supersedes: ADR-0001
```

### Invalid — missing back reference

```
0001-old.md:        (no superseded-by)
0042-new.md:        supersedes: ADR-0001
```

→ 1 diagnostic: `missingBackReference` on `0001-old.md`, `data.expected: 'ADR-0042'`

### Invalid — unknown reference

```
0042-new.md:        supersedes: ADR-9999     # No file 9999-*.md exists
```

→ 1 diagnostic: `unknownReference` on `0042-new.md`, `data.ref: 'ADR-9999'`

## Options

(none for v0.1)

## When to disable

Disable for repos where supersession is tracked outside ADR frontmatter (e.g. via Git tags or external system).
