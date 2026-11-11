# madr/metadata-format

## Description

Reports an ADR whose metadata is written in a format that the configured
`madrVersion` does not read.

`madrVersion` selects the metadata source (#207):

- `v2` reads the body list under the title (`* Status: accepted`).
- `v3` / `v4` read YAML frontmatter.
- `auto` detects the version per file from the format, so it never mismatches.

Metadata in the other format is not read at all, so without this rule its
fields (status, date, …) would go unchecked with no message.

## MADR version compatibility

Applies to v2, v3, v4. Templates:

- v2: <https://github.com/adr/madr/blob/2.1.2/template/template.md> — metadata
  is a list under the title (`* Status:`, `* Deciders:`, `* Date:`).
- v3: <https://github.com/adr/madr/blob/3.0.0/template/adr-template.md> — YAML
  frontmatter.
- v4: <https://github.com/adr/madr/blob/4.0.0/template/adr-template.md> — YAML
  frontmatter.

Every metadata field is optional in all three templates, so a file with no
metadata is valid.

## Diagnostic

- `messageId`: `expectedFrontmatter` | `expectedList`
- `data`: `{ version: 'v2' | 'v3' | 'v4' }` (the configured version)
- Default severity in `recommended` preset: `error`
- File-level diagnostic (frontmatter has no body line)

| Configured | File has | Result |
|---|---|---|
| `v2` | frontmatter (with or without a body list) | `expectedList` |
| `v3` / `v4` | a body list and no frontmatter | `expectedFrontmatter` |
| `v3` / `v4` | frontmatter and a body list | valid (the list is body content) |
| any | no metadata | valid |
| `auto` | anything | valid |

## Options

None.

## Given / When / Then

Fixtures are in `tests/fixtures/metadata-format/`; each test sets `madrVersion`.

### Valid

| Fixture | Version | Reason |
|---|---|---|
| `frontmatter.md` | v3, v4, auto | frontmatter is what v3/v4 read |
| `body-list.md` | v2, auto | the body list is what v2 reads |
| `both.md` | v3, v4, auto | frontmatter present; the list is body content |
| `no-metadata.md` | v2, v4, auto | metadata is optional |

### Invalid

| Fixture | Version | Reason |
|---|---|---|
| `body-list.md` | v3, v4 | `expectedFrontmatter` |
| `frontmatter.md` | v2 | `expectedList` |
| `both.md` | v2 | `expectedList` (the frontmatter is not read) |
