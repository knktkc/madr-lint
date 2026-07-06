---
"madr-lint": minor
---

Diagnostics now carry machine-actionable `suggestion` and `docsUrl` in the json/text/github output (#67). Error feedback is self-contained — expected vs actual plus a concrete fix and a docs link — so agents and humans repair violations without a separate doc lookup.

- **Rule meta** gains an optional declarative `suggestions` map (messageId → template), interpolated with the diagnostic data exactly like `messages`. Rules stay declarative — no imperative suggestion building. Declare an entry only where a mechanical fix exists; omit where the fix is contextual.
- **`Diagnostic`** gains `suggestion: string | null` (null when the rule defines none for that message) and `docsUrl: string` (the rule's `docs.url`; the repository for `core/internal-error`), both resolved by the runner at report time.
- **Reporters**: `text` renders an indented `→ <suggestion>` line under a diagnostic and prints the docs URL once per rule per file group (compact — never per diagnostic); `json` adds `suggestion` and `docsUrl` to every result (keys always present); `github` appends ` — <suggestion>` to the annotation message (escaped). `sarif` is unchanged — its `helpUri` already carries the docs URL.
- **All 8 rules audited**; suggestions filled where the remediation is mechanical (`required-sections`, `status-enum` missing status, `date-iso8601`, `filename-format`, `no-broken-links`, `no-duplicate-numbering`, `supersedes-bidirectional`) and omitted where contextual (`no-numbering-gap`; `status-enum` invalid status already lists the allowed values).
- **Fixed** `supersedes-bidirectional`'s `missingBackReference` message, which named the wrong declared field: it now renders the field the source file actually declares (`supersedes:` vs `superseded-by:`) and states the exact `field: value` back-reference to add.
- **Breaking (pre-1.0)**: `Diagnostic` gains two required fields — external code that **constructs** `Diagnostic` values must now supply `suggestion` (`string | null`) and `docsUrl` (`string`); consumers that only read diagnostics are unaffected (the keys are always present). The on-disk cache manifest also gains a schema version (`schemaVersion: 2`; missing/mismatched ⇒ cold), so the first run after upgrading re-lints once instead of serving stale-shape cached diagnostics.

Resolution is report-time only, so it stays zero-cost on clean files and free on the sub-microsecond hot path.
