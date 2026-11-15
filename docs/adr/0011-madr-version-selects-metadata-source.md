---
status: accepted
date: 2026-11-13
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0011: `madrVersion` selects the metadata source and gates rules

## Context and Problem Statement

The config accepts `madrVersion` (`v2 | v3 | v4 | auto`), and the configuration guide
said it "selects which MADR spec the rules validate against". No rule read it. The
value reached only the cache key, so all four values gave the same results
([#207](https://github.com/knktkc/madr-lint/issues/207)).

[ADR-0006](./0006-v2-bold-list-bridge.md) made `context.metadata` a view that always
merges YAML frontmatter with the v2 body list. That keeps one rule working on every
format, but it also means a project that declares `madrVersion: 'v4'` gets its body-list
files accepted as if they were v4.

The MADR templates put metadata in one place per version: a list under the title in
[2.1.2](https://github.com/adr/madr/blob/2.1.2/template/template.md), and YAML
frontmatter in [3.0.0](https://github.com/adr/madr/blob/3.0.0/template/adr-template.md)
and [4.0.0](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md).

What should a fixed `madrVersion` change?

## Decision Drivers

- The setting is documented and accepted, so it must do what the guide says.
- A fixed version should follow that version's template.
- The default `auto` must keep its results, so a repository on the default sees no change.
- Metadata that is not read must not go unchecked without a message.
- A rule that supports every version must still run without parsing the file.

## Considered Options

1. Make the setting take effect: pass the version to the parser and the runner.
2. Leave the behavior and document `madrVersion` as reserved.

## Decision Outcome

Chosen option: **1**. The setting was a bug, not a missing feature. Option 2 would have
kept a documented setting without effect.

A fixed version decides two things.

**Where `metadata` is read from.** `parseFile(content, madrVersion)` selects the source:

| `madrVersion` | `metadata` is | Version of the file |
|---|---|---|
| `v2` | the body list only | `v2` |
| `v3` / `v4` | frontmatter only | the configured version |
| `auto` | both merged, frontmatter wins (ADR-0006) | detected per file, or none |

The raw `frontmatter` and `listMetadata` stay available whatever the version is.

**Which rules run.** A rule runs only for the versions in its `meta.versionCompat`.

- A per-file rule is skipped for a file of a version it does not support. Under `auto`
  this uses the detected version, and a file with no detectable version runs every rule.
- A project rule is skipped only when a fixed version is unsupported. Under `auto` it
  sees every file, because dropping files of other versions would turn valid cross-file
  references into dangling ones.

Three decisions follow from these.

- **A format mismatch is an error.** With a fixed version, metadata in the other format
  is not read, so its status and date would go unchecked. The rule `madr/metadata-format`
  (`error` in `recommended`) reports such a file. Frontmatter that holds only
  site-generator keys, such as Jekyll's `nav_order`, is not MADR metadata, so a v2 ADR
  may carry it.
- **An unknown value is a config error.** A value such as `"V3"` would read frontmatter
  only and skip every project rule. Config loading rejects it and the CLI exits with
  code 2.
- **`madr-lint init` writes `auto` for a mixed directory.** Any fixed version would leave
  the metadata of some files unread. The mix may be across files or within one file that
  carries both MADR frontmatter and a body list (added 2026-11-13).

## Consequences

### Positive

- `madrVersion` does what the configuration guide says.
- A project can enforce one metadata format by fixing the version.
- `auto` keeps the results it had, including the combined view of ADR-0006.
- Rules that support every version still run without parsing the file.

### Negative

- Results change for a project with a fixed version and files in the other format. With
  `v3` / `v4`, a body-list file gets `madr/metadata-format`, and `madr/status-enum` and
  `madr/date-iso8601` report its status and date as missing. With `v2`, frontmatter
  fields are no longer read. Move the metadata, or set `madrVersion: 'auto'`.
- `madr/supersedes-bidirectional` supports v3 and v4, so it no longer runs with
  `madrVersion: 'v2'`.
- A config with an unknown `madrVersion` now stops the run instead of linting.
- `context.metadata` no longer means the same thing in every run. A rule that needs one
  specific source reads `context.frontmatter` or `context.listMetadata`.
- Under `auto`, a per-file rule and a project rule apply `versionCompat` differently.

## Links

- [ADR-0006](./0006-v2-bold-list-bridge.md): the combined view, which now applies under `auto` only
- [ADR-0005](./0005-project-rule-api.md): project rule API
- [ADR-0002](./0002-ast-parsing-strategy.md): parsing strategy
- [#216](https://github.com/knktkc/madr-lint/pull/216): implementation, released in 0.6.0
