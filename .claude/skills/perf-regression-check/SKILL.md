---
name: perf-regression-check
description: Detect ≥10% performance regressions across all rule benchmarks vs main's baseline. Designed to run in CI on every PR and locally pre-commit. Blocks PR merge on red, warns on amber. Writes benchmarks/report-<sha>.md.
allowed-tools: Bash(mise:*), Bash(pnpm:*), Bash(node:*), Bash(git:*), Read, Write
---

# perf-regression-check — fail PRs that slow rules ≥10%

Runs the bench-rule loop over all rules and compares each task's `hz` to
the committed `baseline.json`. Fails (exit 1) if any task slows ≥10%, warns
(exit 0 with annotation) if 5-10%, otherwise green.

This is the perf gate that protects the user-visible runtime budget
defined in CLAUDE.md (M2: 100 ADRs <100ms cold; M3: 5000 files <4s cold).

## Inputs

None for the typical CI invocation. Optional flags:

- `--rule=<id>` — limit to one rule (matches bench-rule scope)
- `--threshold-fail=<pct>` — override the fail threshold (default 10)
- `--threshold-warn=<pct>` — override the warn threshold (default 5)
- `--against=<ref>` — git ref to compare baselines from (default current
  `baseline.json` at HEAD)

## Procedure

### Step 1: Discover rule benchmarks

List all `benchmarks/*/bench.ts` files. For each, derive the rule id from
the directory name.

### Step 2: Run each bench

Invoke the `bench-rule` skill (or its underlying command) for each rule
without `--update-baseline`. Collect per-rule JSON results in
`benchmarks/<rule>/<sha>.json`.

### Step 3: Compare against baseline

For each task across all rules:

- Compute `delta_pct = (current.hz - baseline.hz) / baseline.hz * 100`
- Classify:
  - `delta_pct ≥ -threshold_warn` → **OK**
  - `-threshold_fail < delta_pct < -threshold_warn` → **WARN**
  - `delta_pct ≤ -threshold_fail` → **FAIL**
  - task missing in baseline → **NEW** (does not affect exit code)

### Step 4: Write the report

`benchmarks/report-<sha>.md` with:

```markdown
# perf-regression-check report — <sha>

Compared against baseline at <ref>.
Thresholds: warn ≥-5%, fail ≥-10%.

## Summary

| Rule | Tasks | OK | NEW | WARN | FAIL |
|---|---|---|---|---|---|
| madr/filename-format | 3 | 3 | 0 | 0 | 0 |

## Details (regressions only)

| Rule | Task | Baseline | Current | Δ% | Status |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | FAIL |

(If no regressions, this section is omitted.)
```

In CI: also write a GitHub-Actions-friendly summary to
`$GITHUB_STEP_SUMMARY` (if env var present).

### Step 5: Exit code

- Any **FAIL** → exit 1 (PR blocked)
- Any **WARN** but no FAIL → exit 0, but print "amber" annotation visible in
  CI (and a non-zero count in the summary)
- Otherwise → exit 0

### Step 6: PR comment (CI only)

When running under GitHub Actions on a PR:

- Post a comment with the summary table (use `gh pr comment` or actions
  via `peter-evans/create-or-update-comment`)
- If a previous comment from this skill exists, update it instead of
  posting a new one

## Hard rules

- Never auto-update baselines from CI. Updates are explicit via
  `bench-rule --update-baseline` from a developer's machine, then committed.
- Skill MUST exit 1 on any FAIL — no fallback "warn-only" mode that hides
  regressions.
- If `baseline.json` is missing for a rule, treat all its tasks as NEW
  (don't fail; the rule is new and a baseline will be set on first
  intentional update).

## When to invoke

- CI on every PR (configured by the `bootstrap-ci` skill)
- Locally via `pnpm perf` before pushing a perf-sensitive change
- Pre-release as part of the `release-cut` skill

## When NOT to invoke

- During TDD red/green cycles for a single rule (use `bench-rule` for
  targeted feedback)
- On documentation-only PRs (bench results are noisy on these and do not
  reflect runtime changes)
