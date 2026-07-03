---
title: madr/no-broken-links
description: Relative-path Markdown links in ADRs must resolve to an existing file.
---

A cross-file project rule that verifies relative-path Markdown links resolve to a file that exists.

It walks the mdast of every ADR, collects all `link` nodes, and resolves each relative URL. A target counts as present if it is one of the linted files **or** exists on the real filesystem (via a `fileExists` check the orchestrator injects — this covers non-Markdown assets and files outside the scanned paths). In pure in-memory runs, the set of linted files is the only source of truth.

Before resolving, the rule strips any `#anchor` and `?query` from the URL and percent-decodes the path (e.g. `my%20file.md`). A leading `/` is treated as project-rooted (the slash is stripped) rather than an OS-absolute path.

External and non-path links are skipped:

- URLs with a protocol (`http://`, `https://`, `mailto:`, `ftp:`, …)
- pure anchors (`#section`) and empty URLs
- URLs that are empty once the anchor/query is stripped

Note: the on-disk check inherits the host filesystem's case-sensitivity, so a wrong-case link may pass on macOS/Windows yet fail on Linux/CI.

## What it checks

- `brokenLink` — a relative link resolves to a path that is neither a linted file nor present on disk (or escapes the project root). Message: `Link to "<url>" resolves to "<resolvedPath>", which does not exist in the project`, with `data.url` and `data.resolvedPath`. The diagnostic is emitted on the file that contains the broken link.

## Examples

### Valid

```markdown
<!-- file: docs/adr/0001-x.md -->
See [ADR-0042](./0042-y.md) for the new approach.
External: [mise](https://mise.jdx.dev)
Anchor: [back to top](#header)
```

(assuming `docs/adr/0042-y.md` exists)

### Invalid

```markdown
<!-- file: docs/adr/0001-x.md -->
See [the rewrite](./0042-rewrite.md)
```

If no `docs/adr/0042-rewrite.md` exists, emits `brokenLink` on `0001-x.md` with `data.resolvedPath: 'docs/adr/0042-rewrite.md'`.

## Options

This rule has no options.

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/no-broken-links': 'error',
  },
});
```

## MADR version compatibility

| Version | Applies |
|---|---|
| v2 | yes |
| v3 | yes |
| v4 | yes |

Markdown link syntax is identical across MADR versions.

## When to disable

Disable for repos where ADR cross-references are tracked outside the Markdown body (e.g. via Git tags or a separate ADR registry). External link rot is out of scope here — use a tool like `lychee` for that.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-broken-links/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-broken-links/spec.md>
