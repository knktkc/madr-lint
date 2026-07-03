---
"madr-lint": minor
---

Inline suppression comments (#23). ADR bodies can now silence diagnostics with HTML-comment directives, filtered centrally so rules stay unaware:

- `<!-- madr-lint-disable-file -->` — suppress everything in the file
- `<!-- madr-lint-disable -->` … `<!-- madr-lint-enable -->` — suppress a range (or to EOF when left open)
- `<!-- madr-lint-disable-next-line -->` — suppress the next non-blank line

Each form takes an optional comma-separated rule-id list (no list = all rules). To make line-scoped suppression work against real rules, `madr/no-broken-links` diagnostics now carry the link's position, and `madr/status-enum` / `madr/date-iso8601` carry the metadata list item's position when the value comes from the MADR v2 list (frontmatter-sourced values stay line-less). `ParsedFile`/`RuleContext` gain `metadataLoc`, and `ProjectFile` gains `body`. `core/internal-error` diagnostics are never suppressible.
