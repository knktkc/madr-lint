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

Frontmatter counts as MADR metadata only when it holds at least one MADR field
(`status`, `date`, `deciders`, `decision-makers`, `consulted`, `informed`, in
any key case). Frontmatter with only site-generator keys (Jekyll `title`,
`nav_order`) is not MADR metadata, so a v2 ADR may carry it beside its body
list.

## Diagnostic

- `messageId`: `expectedFrontmatter` | `expectedList`
- `data`: `{ version: 'v2' | 'v3' | 'v4' }` (the configured version)
- Default severity in `recommended` preset: `error`
- File-level diagnostic (frontmatter has no body line)

| Configured | File has | Result |
|---|---|---|
| `v2` | MADR frontmatter (with or without a body list) | `expectedList` |
| `v2` | site-generator frontmatter and a body list | valid |
| `v3` / `v4` | a body list and no MADR frontmatter | `expectedFrontmatter` |
| `v3` / `v4` | MADR frontmatter and a body list | valid (the list is body content) |
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
| `site-frontmatter-list.md` | v2, auto | `title` / `nav_order` are not MADR fields |

### Invalid

| Fixture | Version | Reason |
|---|---|---|
| `body-list.md` | v3, v4 | `expectedFrontmatter` |
| `frontmatter.md` | v2 | `expectedList` |
| `both.md` | v2 | `expectedList` (the frontmatter is not read) |
| `site-frontmatter-list.md` | v4 | `expectedFrontmatter` (no MADR frontmatter) |
