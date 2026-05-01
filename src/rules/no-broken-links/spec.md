# madr/no-broken-links

## Description

Cross-file project rule with AST inspection. Walks the mdast of every ADR, collects all `link` nodes, and verifies that relative-path link URLs resolve to a file present in the project.

External links (http://, https://, mailto:, ftp:, etc.) and pure anchors (`#section`) are silently skipped — they are outside this rule's scope. The `lychee` action or similar tools handle external link rot.

## What this rule catches

- `[See ADR-0042](./0042-foo.md)` where `0042-foo.md` does not exist in the lint target
- `[Older approach](../old/0001-x.md)` where the relative path resolves to a missing file
- Typos in inter-ADR links (`./0042-typo.md` → catches if no such file)

## What this rule does NOT catch

- External URLs (HTTP/S, mailto, etc.) — out of scope
- Pure anchor links (`#section`) — anchor existence is not verified
- Image references or auto-links to URLs

## MADR version compatibility

Applies to v2, v3, v4 (Markdown link syntax is identical).

## Diagnostic

- `messageId`: `brokenLink`
- `data`: `{ url: string, resolvedPath: string }`
- emitted on the file containing the broken link
- Default severity: `error`

## Resolution rules

For each `link` node with URL `u`:

1. If `u` matches `^[a-z][a-z0-9+.-]*:/i` (protocol-style, e.g. `http://`, `mailto:`) → skip
2. If `u` starts with `#` or is empty → skip (anchor or self-link)
3. Strip any trailing `#anchor` from `u`
4. If empty after strip → skip (pure anchor)
5. Resolve `u` relative to the directory containing the file (`posix.join(dirname(filePath), u)` then `posix.normalize`)
6. Strip leading `/` (treat as project-rooted, not absolute filesystem path)
7. Check if the resolved path is in the set of known project file paths. If not → `brokenLink`

## Examples

### Valid

```markdown
<!-- file: docs/adr/0001-x.md -->
See [ADR-0042](./0042-y.md) for the new approach.
External: [mise homepage](https://mise.jdx.dev)
Anchor: [back to top](#header)
```
(assuming `docs/adr/0042-y.md` exists)

### Invalid

```markdown
<!-- file: docs/adr/0001-x.md -->
See [the rewrite](./0042-rewrite.md)
```
(no `docs/adr/0042-rewrite.md` in the project)

→ `brokenLink` on `0001-x.md`, `data.resolvedPath: 'docs/adr/0042-rewrite.md'`

## Options

(none for v0.1)

## When to disable

Disable for repos where ADR cross-references are tracked elsewhere (e.g. via Git tags or a separate ADR registry).
