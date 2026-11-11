---
title: madr/metadata-format
description: Enforce that ADR metadata uses the format that madrVersion reads.
---

Reports an ADR whose metadata is written in a format that the configured [`madrVersion`](/guides/configuration/#madr-version) does not read.

`madrVersion` decides where metadata comes from. `v2` reads the list under the title (`* Status: accepted`), and `v3`/`v4` read YAML frontmatter. Metadata in the other format is not read at all, so its fields (status, date, …) would go unchecked with no message. This rule reports that case.

Under `madrVersion: 'auto'` (the default), the version is detected from each file's format, so this rule never reports.

## What it checks

- `expectedFrontmatter` — `madrVersion` is `v3` or `v4`, and the file has a metadata list under the title but no MADR frontmatter.
- `expectedList` — `madrVersion` is `v2`, and the file has MADR frontmatter.

Both are file-level diagnostics with `data.version` set to the configured version. A file with no metadata is valid: every metadata field is optional in the MADR templates.

Frontmatter counts as MADR frontmatter when it holds at least one MADR field: `status`, `date`, `deciders`, `decision-makers`, `consulted`, or `informed`. Frontmatter with only site-generator keys, such as Jekyll's `title` and `nav_order`, is not MADR metadata, so a v2 ADR can keep it beside its metadata list.

## Examples

### Valid

With `madrVersion: 'v4'`:

```markdown
---
status: accepted
date: 2026-11-11
---

# Use PostgreSQL
```

With `madrVersion: 'v2'`:

```markdown
# Use PostgreSQL

* Status: accepted
* Date: 2026-11-11
```

### Invalid

With `madrVersion: 'v4'`:

```markdown
# Use PostgreSQL

* Status: accepted
* Date: 2026-11-11
```

Emits 1 diagnostic: `Metadata is written as a body list, but madrVersion "v4" reads YAML frontmatter`.

## Options

None.

## MADR version compatibility

| Version | Applies |
|---|---|
| v2 | yes |
| v3 | yes |
| v4 | yes |

The v2 template ([2.1.2](https://github.com/adr/madr/blob/2.1.2/template/template.md)) puts metadata in a list under the title. The v3 ([3.0.0](https://github.com/adr/madr/blob/3.0.0/template/adr-template.md)) and v4 ([4.0.0](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md)) templates use YAML frontmatter.

## When to disable

Fix the mismatch instead: move the metadata to the format your `madrVersion` reads, or set `madrVersion` to `'auto'` for a repository that mixes formats. Disabling the rule leaves the mismatched files' metadata unchecked.

Like all rules, this rule can be suppressed inline — see [Suppressing rules](/guides/suppressing-rules/).

## Source

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/metadata-format/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/metadata-format/spec.md>
