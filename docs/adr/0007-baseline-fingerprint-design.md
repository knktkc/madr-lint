---
status: accepted
date: 2026-07-03
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0007: Baseline fingerprint design

## Context and Problem Statement

The first run of `madr-lint` on a repository with dozens of legacy ADRs yields
hundreds of errors (issue #24). Teams that would benefit most from the linter
are the least able to adopt it: fixing every historical violation before the
first green build is a non-starter, and inline suppression (`madr-lint-disable`,
ADR: issue #23) does not scale to bulk legacy debt — nobody hand-annotates 300
diagnostics across 50 files.

We need a **baseline**: a snapshot of the known, accepted violations that the
linter subtracts on every run so that only **new** violations fail the build.
Prior art: ESLint bulk suppressions, `tsc-baseline`, Betterer.

The load-bearing question is **how to fingerprint a violation** so that the
baseline:

1. survives unrelated edits (adding a paragraph to a file must not "un-baseline"
   an existing violation elsewhere in that file), and
2. still catches genuinely new violations.

A fingerprint that is too specific (includes line numbers or message text) goes
stale on every edit and floods the build with "new" violations that are actually
the same old ones shifted down a few lines. A fingerprint that is too loose
(per-file only) would silently absorb brand-new violations of the same rule.

## Decision Drivers

- **Survives unrelated edits by construction.** Re-baselining on every commit
  defeats the purpose; the fingerprint must be stable across the edits people
  actually make to Markdown (inserting prose, reordering sections).
- **Clean git diffs.** The baseline file is committed and reviewed. Adopting a
  fix should shrink the file by exactly the lines that were fixed — no churn.
- **Cheap to apply.** Subtraction runs on every lint, in the hot path. It must
  be O(1) per diagnostic and zero-cost when no baseline exists.
- **Portable.** CI now runs on Windows, macOS, and Linux. Paths in the baseline
  must be identical across machines.
- **Honest about new debt.** A new violation of an already-baselined rule in an
  already-baselined file must still surface.

## Considered Options

1. **Count model (chosen)** — fingerprint = `(relative path, ruleName,
   messageId)` mapped to an allowed **count**. At lint time, for each key the
   first N matching diagnostics are absorbed; the (N+1)th and beyond are
   reported.
2. **Line-based fingerprint** — `(path, ruleName, messageId, line)`, matching a
   diagnostic only if a violation sits on the same line.
3. **Content-hash-per-diagnostic** — hash the rendered message (or the offending
   source span) into an opaque signature, store the set of signatures.

## Decision Outcome

Adopted: **Option 1 — the count model.** This is the same model `tsc-baseline`
uses.

The baseline file is `.madr-lint/baseline.json`, a nested map
`path → ruleName → messageId → count`:

```json
{
  "version": 1,
  "entries": {
    "docs/adr/0003-use-postgres.md": {
      "madr/required-sections": { "missingSection": 2 },
      "madr/status-enum": { "invalidStatus": 1 }
    }
  }
}
```

- Keys are sorted at every level (path, then rule, then messageId), the file is
  written with a 2-space indent and a trailing newline, and paths are **relative
  to the project root with POSIX separators**.
- Subtraction happens in the `lintFiles` output path **after** inline-suppression
  filtering and **before** the reporter / exit-code logic. It applies to both
  errors and warnings.
- The per-file **cache stores pre-baseline diagnostics**. Subtraction runs after
  the cache is persisted, so editing or deleting the baseline file takes effect
  immediately without cache invalidation (a warm-cache run still subtracts).
- `core/internal-error` diagnostics are **never** baselined — the same contract
  as inline suppression: they signal a rule bug and must never be silenced.
- Stale entries (a count that exceeds the current number of matches) are simply
  **inert** — no error, no warning. `--update-baseline` prunes them naturally.

### Rationale

- **Line-independence is structural, not heuristic.** Because the fingerprint
  carries no line, no column, no message text, and no interpolation data, an
  edit that shifts every line in a file changes nothing about which violations
  are absorbed. Survival across unrelated edits is a property of the design, not
  a fuzzy-match tolerance we have to tune.
- **The count is exactly the "new debt" signal.** If a file was baselined with 2
  `missingSection` violations and a later edit introduces a third, two are
  absorbed and one is reported. The team is held to "no new debt" without being
  punished for the old debt.
- **Clean diffs fall out of deterministic serialization.** Sorted keys + fixed
  indentation mean the same logical baseline always serializes byte-identically,
  so a fix removes exactly the lines it fixed.
- **Cheap.** Applying the baseline is a single map built once per run, then one
  lookup-and-decrement per diagnostic. No baseline file ⇒ the subtraction step
  is skipped entirely.

### Rejected alternatives

- **Line-based fingerprints (Option 2).** Goes stale on the most common edit
  there is: inserting a line. Adding one paragraph near the top of an ADR shifts
  every downstream violation's line number, so every one of them reads as "new"
  and the build fails — while the genuinely-new violation is lost in the noise.
  Teams would be forced to re-baseline constantly, which is exactly the
  friction the baseline exists to remove.
- **Content-hash-per-diagnostic (Option 3).** Two failure modes. If the hash
  includes interpolated message data (e.g. the offending status string), it is
  as brittle as the line model for any edit that changes the offending text. If
  it hashes only stable fields, it collapses to the same `(path, rule,
  messageId)` tuple we already use — but as an opaque signature that produces
  unreadable, un-reviewable diffs and needs a **set** with per-signature
  bookkeeping to represent "this violation occurs 3 times". The count model
  expresses multiplicity directly and stays human-readable.

## Consequences

### Positive

- Legacy repos adopt `madr-lint` in one command (`--update-baseline`) and get a
  green build that still fails on new debt.
- The baseline file is diff-friendly and reviewable; shrinking it is the visible
  record of paying down debt.
- Zero cache-invalidation coupling — the baseline is orthogonal to the cache.
- Hot path is unaffected when no baseline is present (verified via
  `perf:check`).

### Negative

- The count model cannot tell *which specific* occurrence was baselined vs new
  when several identical `(path, rule, messageId)` violations exist — it only
  knows "N were known, this is the (N+1)th". This is acceptable: identical
  diagnostics are interchangeable for reporting, and the goal is "no new debt",
  not per-occurrence identity.
- A file that legitimately *loses* one violation and *gains* a different one of
  the same fingerprint nets out to zero new problems. This is a deliberate
  trade for edit-survival; teams wanting strict per-occurrence tracking should
  use inline suppression instead.
- Stale entries linger until the next `--update-baseline`. We chose not to warn
  on them (out of scope) to keep default output quiet.

## Links

- [ADR-0005](./0005-project-rule-api.md): project rule API (diagnostics carry an
  explicit relative POSIX `path`, which the fingerprint reuses)
- Issue #24: baseline file for gradual adoption
- Issue #23: inline suppression comments (the per-case escape hatch this
  complements)
- `tsc-baseline`: `https://github.com/tvsom/tsc-baseline`
- ESLint bulk suppressions: `https://eslint.org/docs/latest/use/suppressions`
