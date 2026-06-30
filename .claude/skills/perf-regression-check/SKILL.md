---
name: perf-regression-check
description: Detect ≥10% per-rule benchmark regressions by comparing the base ref and HEAD on the SAME machine (machine-independent). Runs in CI on every PR and locally pre-commit. Blocks the PR (exit 1) when a regression reproduces; warns on 5-10%.
allowed-tools: Bash(mise:*), Bash(pnpm:*), Bash(node:*), Bash(git:*), Read
---

# perf-regression-check — fail PRs that slow rules ≥10%

`pnpm perf:check` (→ `scripts/perf-regression-check.ts`) benchmarks the **base
ref and HEAD on the same runner in one job**, then compares each task's
throughput. This is machine-independent — it does NOT compare against a
committed `baseline.json` (absolute ops/s captured on one host made the job
fail uniformly on slower CI runners).

This is the perf gate that protects the user-visible runtime budget defined in
CLAUDE.md (M2: 100 ADRs <100ms cold; M3: 5000 files <4s cold).

## How it works

1. **Resolve the base ref** — `$PERF_BASE_REF` if set, else `HEAD~1`. If it
   can't be resolved (first commit / shallow clone with no base), the check
   skips with exit 0.
2. **Measure HEAD** — run every `benchmarks/*/bench.ts` against the working
   tree; read each `benchmarks/<rule>/<sha>.json`.
3. **Measure base** — check the base ref out into a throwaway git worktree
   inside the repo (`.perf-base/`, gitignored, auto-removed) so Node resolves
   the repo's `node_modules` and the main working tree is never mutated; run
   the same benches there.
4. **Compare** per task: `delta = (head - base) / base`.
   - `delta ≥ -5%` → **OK** (includes speedups)
   - `-10% ≤ delta < -5%` → **WARN** (no fail)
   - `delta < -10%` → **FAIL** candidate
   - task absent in base (new benchmark) → skipped, no effect on exit code
5. **Confirm-on-fail** — any rule with a FAIL candidate is re-measured once;
   a task fails for real only if the regression **reproduces**. Non-reproduced
   candidates are downgraded to WARN (so shared-runner noise can't flake CI).
6. **Exit code** — any reproduced FAIL → exit 1; WARN-only → exit 0.

## Inputs

- `PERF_BASE_REF` (env) — git ref/sha to compare against. CI sets it to the PR
  base sha for `pull_request`, and leaves it unset (→ `HEAD~1`) for pushes.

There are no CLI flags. Thresholds (10% fail / 5% warn) are constants in the
script.

## CI wiring

The `perf` job in `.github/workflows/ci.yml` uses `fetch-depth: 0` (so the base
commit is available for the worktree) and sets
`PERF_BASE_REF: ${{ github.event.pull_request.base.sha }}` on PRs.

## When to invoke

- CI on every PR (configured by the `bootstrap-ci` skill)
- Locally: `PERF_BASE_REF=main pnpm perf:check` before pushing a perf-sensitive
  change (commit or stash first — the base is read from git history)
- Pre-release as part of the `release-cut` skill

## When NOT to invoke

- During TDD red/green cycles for a single rule (use `bench-rule` for targeted
  feedback)
- On documentation-only PRs (bench results are noisy and don't reflect runtime
  changes)

## Note on `baseline.json`

The committed `benchmarks/*/baseline.json` files are NOT used by this relative
check. They remain only for the `bench-rule` skill's local absolute-tracking
workflow and may be removed if that workflow is retired.
