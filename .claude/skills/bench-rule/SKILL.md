---
name: bench-rule
description: Run tinybench against benchmarks/<rule>/bench.ts and compare to baseline.json. Use when adding or modifying a rule, before release, or when investigating perf concerns. Optionally updates the baseline with --update-baseline.
allowed-tools: Bash(mise:*), Bash(pnpm:*), Bash(node:*), Bash(git:*), Read, Write, Edit
---

# bench-rule — micro-benchmark a rule and compare to baseline

Runs the tinybench script for one rule, captures results to
`benchmarks/<rule>/<git-sha>.json`, compares against
`benchmarks/<rule>/baseline.json`, and emits a markdown delta table.

## Inputs

1. **Rule ID** — e.g. `madr/filename-format`. Required.
2. **`--update-baseline`** — boolean flag. If true, writes the new result to
   `baseline.json` after running. Default false.

## Procedure

### Step 1: Verify state

- cwd is the madr-lint repo root
- `benchmarks/<kebab>/bench.ts` exists (created by the `add-rule` skill)
- working tree is clean (`git status --porcelain` empty); abort if dirty

### Step 2: Run the benchmark

```bash
mise exec -- pnpm tsx benchmarks/<kebab>/bench.ts > .bench-output.tmp
```

`tsx` is a dev dependency of madr-lint as of post-review Round 4.
If absent in some other context, install: `mise exec -- pnpm add -D tsx`.

The bench script (per the `add-rule` template) writes a JSON file
alongside itself: `benchmarks/<kebab>/<short-sha>.json`. The `<short-sha>`
is `git rev-parse --short HEAD` (the short hash, ~7 chars).

The bench script prints a `console.table` of tinybench results. Capture the
JSON form by modifying the bench script's tail temporarily, or use
`bench.toJSON()` and write to `benchmarks/<kebab>/<git-sha>.json`.

Recommended bench script convention (the `add-rule` skill should generate
this shape):

```typescript
const results = bench.tasks.map((t) => ({
  name: t.name,
  hz: t.result?.hz,
  mean: t.result?.mean,
  rme: t.result?.rme,
  samples: t.result?.samples.length,
}));
writeFileSync(
  join(import.meta.dirname, `${gitSha}.json`),
  JSON.stringify(results, null, 2),
);
```

### Step 3: Compare to baseline

Read `benchmarks/<kebab>/baseline.json` if it exists.

For each task name in current results:

- If task missing from baseline: mark as **NEW** (no comparison)
- Compute `delta_pct = (current.hz - baseline.hz) / baseline.hz * 100`
- Sign convention: positive delta = faster, negative = slower

### Step 4: Emit a markdown delta table

Print to stdout:

```
## bench-rule: madr/<kebab> — <git-sha>

| Task                  | Baseline (ops/s) | Current (ops/s) | Δ%      | Status |
|-----------------------|------------------|-----------------|---------|--------|
| <task name>           | 1,234,567        | 1,300,000       | +5.30%  | OK     |
| <slow task>           | 500,000          | 440,000         | -12.00% | SLOW ⚠ |
| <new task>            | —                | 800,000         | NEW     | NEW    |
```

Status thresholds:

- `Δ% ≥ -5%`: **OK**
- `-10% < Δ% < -5%`: **WARN ⚠**
- `Δ% ≤ -10%`: **SLOW ⚠**
- New tasks: **NEW**

### Step 5: Update baseline (optional)

If `--update-baseline`:

- Copy current results to `benchmarks/<kebab>/baseline.json`
- Stage the change with `git add` (do NOT commit; the user controls commit messages)
- Print confirmation

If not updating, leave baseline.json untouched.

## Hard rules

- Baseline updates require explicit `--update-baseline` flag — never auto-write.
- The skill MUST refuse to run if `benchmarks/<kebab>/bench.ts` is missing
  (instructs the user to run `add-rule` first).
- Bench output JSONs (`<sha>.json`) are gitignored; only `baseline.json` is committed.

## When to invoke

- After implementing a rule (verify perf is not catastrophic)
- After modifying a rule (regression check)
- Before a release (whole-suite check via wrapper that loops over all rules)

## When NOT to invoke

- During the RED phase of TDD (rule has no impl yet — bench is meaningless)
- For rules whose impl has not yet stabilized
