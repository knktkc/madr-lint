---
"madr-lint": minor
---

Baseline file for gradual adoption (#24). Adopt `madr-lint` on a repo with existing violations without fixing them all first — `--update-baseline` snapshots today's violations to `.madr-lint/baseline.json`, and subsequent runs subtract them so only **new** violations fail the build.

- `madr-lint --update-baseline` writes the baseline (deterministic sorted JSON, POSIX-relative paths, 2-space indent + trailing newline for clean git diffs) and exits 0.
- Default runs subtract an existing baseline; `--no-baseline` ignores it and shows everything.
- Fingerprint = `(relative path, ruleName, messageId)` → allowed **count** (a tsc-baseline-style count model), so the baseline survives unrelated edits by construction — no line numbers, no message text. See [ADR-0007](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0007-baseline-fingerprint-design.md).
- Subtraction runs after inline suppression and is never stored in the cache, so editing or deleting the baseline takes effect without cache invalidation (warm-cache runs still subtract). `core/internal-error` is never baselined.
- Programmatic API adds `buildBaseline`, `applyBaseline`, `loadBaseline`, `writeBaseline`, `serializeBaseline`, `baselinePath`, and the `Baseline` type.
