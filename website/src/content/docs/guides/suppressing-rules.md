---
title: Suppressing rules
description: Silence a single legitimate exception with inline HTML-comment directives — disable-file, disable/enable ranges, and disable-next-line — without turning a rule off project-wide.
---

Sometimes one legacy ADR legitimately violates a rule — say, a historical
status value that `madr/status-enum` rejects. Turning the rule `off` for the
whole project to accommodate one file is a bad trade. Inline suppression
comments give you a per-file, per-line escape hatch, exactly like
`eslint-disable` comments do for ESLint.

Directives are ordinary HTML comments in the ADR's Markdown body. Rules never
see them — suppression is applied centrally after all rules have reported.

## The four directives

```markdown
<!-- madr-lint-disable-file -->
Suppress everything in this file.

<!-- madr-lint-disable -->
Suppress from this line to the end of the file,
or until a matching madr-lint-enable.

<!-- madr-lint-enable -->
Re-enable previously disabled rules.

<!-- madr-lint-disable-next-line -->
Suppress the next (non-blank) line only.
```

## Scoping to specific rules

Every form optionally takes a comma-separated list of full rule IDs. Without
a list, the directive applies to **all** rules.

```markdown
<!-- madr-lint-disable-next-line madr/status-enum -->
- Status: superseded-but-we-spelled-it-oddly

<!-- madr-lint-disable madr/status-enum, madr/date-iso8601 -->
…both rules silenced from here…
<!-- madr-lint-enable madr/date-iso8601 -->
…only madr/status-enum still silenced…
```

An `enable` re-enables what it names (or everything, when unscoped) — so an
unscoped `disable` followed by a scoped `enable` leaves everything else
disabled, mirroring ESLint semantics.

## `disable-next-line` targets the next non-blank line

Unlike ESLint, `madr-lint-disable-next-line` applies to the next
**non-blank** line, not the literal next line. Markdown authors idiomatically
leave a blank line after a comment block, and a directive that silently
missed across it would be a footgun. Both of these work:

```markdown
<!-- madr-lint-disable-next-line madr/no-broken-links -->
[archived design doc](./2019-design.md)
```

```markdown
<!-- madr-lint-disable-next-line madr/no-broken-links -->

[archived design doc](./2019-design.md)
```

## Project (cross-file) rules

Diagnostics from project rules (e.g. `madr/no-duplicate-numbering`) are
attributed to a file; a directive in that file suppresses them:

- **File-scoped** suppression — `disable-file`, or a `disable` with no later
  matching `enable` — silences the file's project diagnostics.
- **Line-scoped** suppression (`disable-next-line`, bounded
  `disable`/`enable`) applies when the diagnostic carries a line, as
  `madr/no-broken-links` diagnostics do.

## Limitations and fine print

- **Frontmatter cannot be targeted by line.** YAML frontmatter is stripped
  before the Markdown body is parsed, so a diagnostic about a frontmatter
  value (e.g. `status:` in frontmatter) carries no line number. Line-scoped
  directives cannot reach it — use a file-scoped `disable` for that rule
  instead. Values from the MADR v2 metadata list live in the body and CAN be
  targeted by line.
- **Diagnostics without a line** (e.g. `madr/filename-format`, a missing
  section, a missing metadata field) are only silenced by file-scoped
  suppression: `disable-file`, or a `disable` left open to the end of the
  file. A bounded `disable`/`enable` pair does not silence them.
- **One directive per comment, standing alone.** A comment that contains
  another comment on the same line (`<!-- … --><!-- … -->`) is rejected as a
  directive. Unknown keywords (e.g. `madr-lint-disable-line`) and ordinary
  HTML comments are ignored silently.
- **Stacked `disable-next-line` comments do not chain.** The first one
  targets the second comment's line, not your content — put all rules in a
  single comma-separated list in one comment instead.
- **`core/internal-error` cannot be suppressed.** It signals a rule bug, not
  a finding about your ADR.
- **The cache stays correct.** Directives are part of the file content, so
  the content-hash cache invalidates automatically when you add or remove
  one.

## Prefer configuration for systematic exceptions

If you find yourself suppressing the same rule in many files, change the
rule's options or severity in your [config file](/guides/configuration/)
instead — inline directives are for the one-off exception, not policy.
