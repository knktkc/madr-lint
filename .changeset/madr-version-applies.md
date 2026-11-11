---
"madr-lint": minor
---

Make `madrVersion` take effect (#207). The setting was accepted and documented as selecting the MADR spec to validate against, but no rule read it: `'v2'`, `'v3'`, `'v4'`, and `'auto'` gave the same results. It now decides two things.

- **Where metadata is read from.** `v2` reads the list under the title (`* Status: ...`) only, and `v3`/`v4` read YAML frontmatter only. `auto` (the default) still merges both, so a repository on the default sees no change.
- **Which rules run.** A rule runs only for the MADR versions it supports. `madr/supersedes-bidirectional` supports v3/v4, so it no longer runs with `madrVersion: 'v2'`.

New rule `madr/metadata-format` (enabled as `error` in `recommended`) reports a file whose metadata is in the format the configured version does not read, for example a body list with `madrVersion: 'v4'`. Without it, that file's status and date would go unchecked.

What changes in your results if you set a fixed `madrVersion`:

- With `v3`/`v4`, a file whose metadata is a body list now gets `madr/metadata-format`, and `madr/status-enum` reports its status as missing. Move the metadata into frontmatter, or switch to `madrVersion: 'auto'`.
- With `v2`, a file with frontmatter now gets `madr/metadata-format`, and its frontmatter fields are no longer read.

`madr-lint init` now writes `auto` when the sampled ADRs mix frontmatter and body-list metadata, instead of the majority version.

For rule authors and API users: `context.madrVersion` and `context.listMetadata` are new on the per-file rule context; `parseFile` takes an optional version and returns `version`; `runRule`, `runRulesOnFile`, `runRulesOnProject`, `lintFiles`, and `lintAndFix` accept `madrVersion`; `buildProjectFile` takes it as a second argument.
