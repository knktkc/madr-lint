---
name: tdd-loop
description: Launch vitest --watch in the background, scoped to one rule's tests, and surface RED-to-GREEN transitions as notifications. Use during active TDD on a single rule. Stays watching until the user invokes the skill again to stop or closes the session.
allowed-tools: Bash(mise:*), Bash(pnpm:*), Read
---

# tdd-loop — vitest watch loop with red/green notifications

Runs `vitest --watch tests/rules/<kebab>.test.ts` in a background process and
streams its stdout to surface state transitions:

- ❌→✅ — green achieved (suggest "refactor now?")
- ✅→❌ — regression introduced (highlight which test broke)
- ❌→❌ (different fail) — progress toward green (show new failure)

Designed to keep the developer in flow during TDD without manually
re-running vitest after each edit.

## Inputs

1. **Rule ID** — e.g. `madr/filename-format`. Required.
2. **`stop`** (alternative invocation) — terminates the running watcher
   for the rule. Use when switching rules.

## Procedure

### Step 1: Verify state

- cwd is madr-lint repo root
- `tests/rules/<kebab>.test.ts` exists (skill `add-rule` was run)
- No other `tdd-loop` is currently watching this rule (check via Monitor
  state or background process registry)

### Step 2: Launch vitest in the background

```bash
mise exec -- pnpm vitest --watch tests/rules/<kebab>.test.ts
```

Use `Bash` with `run_in_background: true` so subsequent tool calls
proceed. Capture the process ID for later termination.

### Step 3: Monitor stdout for transitions

Use the `Monitor` tool to stream the watcher's output. Track the test
suite's pass/fail state across each "Tests" line emitted by vitest.

For each transition:

- **RED → GREEN** (all tests now pass): print
  ```
  GREEN: madr/<kebab> — N tests passing.
  Refactor candidate? Run /tdd-refactor or extract shared helpers
  while the safety net is green.
  ```
- **GREEN → RED** (regression): print
  ```
  REGRESSION: madr/<kebab> — N tests failing.
  Failing: <test name 1>, <test name 2>
  Last edit at: <time> on <file>
  ```
- **RED → RED-prime** (different failures, progress): print
  ```
  PROGRESS: madr/<kebab> — different failures.
  Now failing: <test name>
  Previously failing: <test name>
  ```

Do not flood the user with raw vitest output — only emit the transition
notifications. Suppress the per-run "Tests N passed/failed" line unless
state changes.

### Step 4: Stop on `stop` invocation

If the user re-invokes the skill with `stop`, terminate the background
process and print:

```
Stopped tdd-loop for madr/<kebab>.
Final state: GREEN | RED (N failing).
```

### Step 5: Cleanup on session end

If the session ends without explicit stop, the background process is
terminated by the harness. No persistent cleanup needed.

## Hard rules

- MUST run vitest in `--watch` mode, not single-run.
- MUST scope to the specific rule test file — do NOT watch the whole
  test suite (noise drowns useful signal).
- MUST NOT modify any source or test file. tdd-loop is a passive watcher.
- MUST surface only transitions, not every run output.
- If the watcher exits unexpectedly (vitest crash), restart it once,
  then surface the error to the user.

## When to invoke

- Starting active development on a rule scaffolded by `add-rule`
- Returning to a rule after a context switch ("where was I?")
- During refactor work — green state must persist across each step

## When NOT to invoke

- For benchmarks (`vitest bench` is separate; use `bench-rule` instead)
- For multi-rule integration changes — the noise across the test suite
  defeats the watch loop's purpose
- In CI — `pnpm test` is the right invocation there
