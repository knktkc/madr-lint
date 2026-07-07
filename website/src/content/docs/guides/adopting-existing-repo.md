---
title: Adopting on an existing repo
description: Roll madr-lint out on a repository full of legacy ADRs without fixing every violation first — snapshot today's problems into a baseline so only new violations fail the build.
---

The first time you run `madr-lint` on a repo with dozens of legacy ADRs, you get
hundreds of errors. Fixing them all before your first green build is a
non-starter — so `madr-lint` lets you **baseline** the existing violations and
enforce the rules only on *new* ones. This is the same pattern as
[`tsc-baseline`](https://github.com/tvsom/tsc-baseline), ESLint bulk
suppressions, and Betterer.

## The four-step adoption

### 1. See where you stand

```bash
madr-lint
# → 342 errors, 17 warnings
```

### 2. Run `--fix` first

Before snapshotting anything, repair what's mechanically safe to repair —
there's no reason to freeze a violation into the baseline that autofix would
otherwise have fixed for free:

```bash
madr-lint --fix
# → Fixed 83 problems
# → 259 errors, 17 warnings
```

`--fix` mutates files in place and its exit code reflects what's *left*
unfixed, not what it repaired — a non-zero exit here is normal. Only 3 of
`madr-lint`'s 8 rules are fixable today (`madr/status-enum`,
`madr/date-iso8601`, `madr/supersedes-bidirectional`), so this is a dent, not
a solution — the baseline in the next step absorbs the rest.

### 3. Snapshot the remaining violations

```bash
madr-lint --update-baseline
# → Wrote 276 violations across 53 files to .madr-lint/baseline.json
```

This writes `.madr-lint/baseline.json` and exits `0`. **Commit that file**
(and the fixes from step 2, if you haven't already).

### 4. Enforce from here on out

```bash
madr-lint
# → 17 problems hidden by baseline (.madr-lint/baseline.json)
#   exit code 0
```

Every violation already in the baseline is subtracted. Add a brand-new one — a
new ADR with a missing section, or a fresh mistake in an old file — and it fails
the build as normal:

```bash
madr-lint
# docs/adr/0060-new-decision.md
#   error  madr/required-sections  Missing required section: "Consequences"
#
# 1 error
#   exit code 1
```

Wire step 4 into CI and you get "no new debt" enforcement from day one, while the
legacy debt waits to be paid down on your schedule.

## How the fingerprint works

A baselined violation is identified by `(file path, rule, messageId)` mapped to
a **count** — not by line number or message text. That is deliberate: it means
the baseline **survives unrelated edits**. Insert a paragraph at the top of an
ADR and every downstream violation shifts down a few lines, but the baseline
still absorbs them because the fingerprint never looked at lines in the first
place.

The count is what catches new debt. If a file was baselined with two
`missingSection` violations and a later edit introduces a third, two are
absorbed and the third is reported.

See [ADR-0007](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0007-baseline-fingerprint-design.md)
for the full design and the alternatives we rejected.

## Paying down the debt

Fix some violations, then re-snapshot:

```bash
madr-lint --update-baseline
```

The rewrite prunes anything you have fixed, so the baseline file shrinks by
exactly the lines you resolved — a clean, reviewable git diff. Keys are sorted
and the file uses a stable 2-space indent, so re-running `--update-baseline`
never produces spurious churn.

To audit everything the baseline is hiding, run without it:

```bash
madr-lint --no-baseline
```

## Flags

| Flag | Effect |
|---|---|
| `--update-baseline` | Run a full lint (ignoring any existing baseline), rewrite `.madr-lint/baseline.json`, print a one-line summary, exit `0`. |
| `--no-baseline` | Ignore the baseline file entirely; report every violation. |
| *(default)* | Subtract `.madr-lint/baseline.json` when it exists; no-op when it does not. |

## Notes

- The baseline lives at `.madr-lint/baseline.json`, alongside the cache directory
  (`.madr-lint/cache`). Commit the baseline; the cache is safe to gitignore.
- Paths in the baseline are **relative to the project root with forward slashes**,
  so the same file works across macOS, Linux, and Windows CI.
- Subtraction applies to both errors and warnings, and runs *after*
  [inline suppression](/guides/suppressing-rules/). Use inline
  `madr-lint-disable` comments for the handful of legitimate, permanent
  exceptions; use the baseline for bulk legacy debt you intend to pay down.
- Editing or deleting the baseline takes effect immediately — it is independent
  of the [content-hash cache](/guides/cli/#caching), which always stores
  pre-baseline results.
- A baseline file that exists but cannot be parsed is ignored with a one-line
  `stderr` warning (run `--update-baseline` to regenerate it). A missing file
  stays silent.
- `--format json` reports how many diagnostics were absorbed via
  `summary.baselineHidden` (always present; `0` when no baseline is active).
  SARIF output is unaffected.
- `core/internal-error` (emitted when a rule itself crashes) is **never**
  baselined — it signals a bug, not debt.
