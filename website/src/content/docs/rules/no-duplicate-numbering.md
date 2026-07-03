---
title: madr/no-duplicate-numbering
description: No two ADRs may share the same NNNN- number prefix.
---

A cross-file project rule that reports when two or more ADRs share the same `NNNN-` number prefix in their basename.

The runner pre-parses every ADR file once and hands them all to the rule in a single `check()` call. The rule reads the leading four digits (`^(\d{4})-`) from each basename, groups files by number, and emits a diagnostic on **every** member of any duplicate group — so a reviewer sees the conflict in each affected file's output, not just one.

## What it checks

- `duplicateNumber` — two or more files resolve to the same `NNNN` prefix. Message: `ADR number <number> is used by multiple files: <paths>`, with `data.number` and `data.paths` (the conflicting paths, comma-joined). One diagnostic is emitted per file in the group.

Files whose basename does not start with `NNNN-` (e.g. `template.md`, `README.md`, `0001invalid.md` without a hyphen) are silently ignored — `madr/filename-format` is responsible for those.

## Examples

### Valid

```text
docs/adr/
  0001-mise.md
  0002-aube.md
  0003-oxc.md
```

No diagnostics.

### Invalid

```text
docs/adr/
  0001-foo.md
  0001-bar.md
```

Emits 2 diagnostics (one per file), both `duplicateNumber` with `data.number: '0001'` and `data.paths: '0001-foo.md, 0001-bar.md'`.

```text
docs/adr/
  0001-a.md
  0001-b.md
  0001-c.md
  0002-x.md
  0002-y.md
```

Emits 5 diagnostics: 3 for `0001`, 2 for `0002`.

## Options

This rule has no options.

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/no-duplicate-numbering': 'error',
  },
});
```

## MADR version compatibility

| Version | Applies |
|---|---|
| v2 | yes |
| v3 | yes |
| v4 | yes |

The filename numbering convention is identical across MADR versions.

## When to disable

There is essentially no reason to disable this rule. If two ADRs share a number, one of them is wrong by definition.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-duplicate-numbering/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-duplicate-numbering/spec.md>
