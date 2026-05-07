# madr/no-broken-links

Cross-file project rule with AST inspection. Verifies that relative-path Markdown links resolve to a file present in the project.

## Description

Walks the mdast of every ADR, collects all `link` nodes, and resolves their URLs against the project's known file paths. External URLs and pure anchors are silently skipped.

## What this rule catches

- `[See ADR-0042](./0042-foo.md)` where the target file is absent
- Typos in inter-ADR links (`./0042-typo.md`)
- Stale references after a rename or deletion

## What this rule does NOT catch

- External URLs (HTTP/S, mailto, etc.) — out of scope (use `lychee` or similar)
- Pure anchor links (`#section`) — anchor presence is not verified
- Image references (`![alt](src)`) — only `[text](url)` link nodes

## Examples

### Valid

```markdown
<!-- file: docs/adr/0001-x.md -->
See [ADR-0042](./0042-y.md) for the new approach.
External: [mise](https://mise.jdx.dev)
Anchor: [back](#header)
```
(assuming `docs/adr/0042-y.md` exists)

### Invalid

```markdown
[the rewrite](./0042-rewrite.md)
```
where no such file exists in the project →
`brokenLink` with `data.resolvedPath: 'docs/adr/0042-rewrite.md'`

## Diagnostic

- `messageId`: `brokenLink`
- `data`: `{ url: string, resolvedPath: string }`
- emitted on the file containing the broken link

## Resolution rules

For each `link` node:

1. Skip if URL has a protocol (`http://`, `mailto:`, `ftp:`, …).
2. Skip if URL is empty or starts with `#` (anchor only).
3. Strip trailing `#anchor` from the URL.
4. Resolve relative to the file's directory: `posix.normalize(posix.join(dirname(filePath), url))`.
5. Treat leading `/` as project-rooted (strip it), not as a filesystem absolute path.
6. Match against the set of known project paths. Miss → `brokenLink`.

## MADR version compatibility

Applies to v2, v3, v4 (Markdown link syntax is identical across versions).

## Options

(none for v0.1)

## When to disable

Disable for repos that track ADR cross-references outside the Markdown body.

## Source

- Spec: [`src/rules/no-broken-links/spec.md`](../../src/rules/no-broken-links/spec.md)
- [ADR-0005](../adr/0005-project-rule-api.md): project rule API
