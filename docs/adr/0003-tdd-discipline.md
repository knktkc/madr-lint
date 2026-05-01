---
status: accepted
date: 2026-05-01
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0003: TDD discipline as project convention

## Context and Problem Statement

A linter's correctness is its product surface. Rule misbehavior in user codebases is difficult to diagnose remotely: false positives are noise that erodes adoption; false negatives undermine trust silently. Conventional development modes — write impl, then test, or test alongside impl in one mental pass — have a known failure mode: tests confirm what the implementation already does, not what the spec requires.

For `madr-lint`, the source of truth is the MADR spec (filename regex, status enum, ISO 8601 dates, required sections, frontmatter shape per version, etc.). The cleanest way to encode that contract is: spec → failing test → minimum impl that passes. This is classical TDD (Red-Green-Refactor).

LLM-assisted development (Claude Code) is used heavily on this project. LLMs reliably blur RED/GREEN unless the workflow has hard, mechanical gates.

## Decision Drivers

- **Solo maintainer (initial)**: no peer to catch missing test cases or implementation-shaped tests
- **LLM-assisted authoring**: needs mechanical gates to enforce discipline that humans would otherwise enforce socially
- **Linter rules have a clean contract**: valid/invalid input → diagnostic output. TDD shines for this shape
- **Diagnostic shape (line, column, messageId, fix) is part of the contract**: it must be tested explicitly, not just outcomes

## Considered Options

1. **Strict TDD discipline applied per-rule (Red-Green-Refactor)** — this decision
2. Test-after (write impl, write tests to cover behavior)
3. Mixed (write tests at "the same time" as impl)

## Decision Outcome

Adopted: **Strict TDD discipline (Red-Green-Refactor) for all rules and core utilities**

### Rationale

- Rules have a clean specification contract — TDD shines for spec-driven code
- LLM-assisted development is more deterministic when the workflow has hard gates ("no impl without RED")
- The `add-rule` Claude Code skill enforces RED mechanically: it scaffolds spec + fixtures + failing test, runs vitest, refuses to proceed if RED is not produced
- Tests written first match the spec; tests written after match whatever the implementation happens to do

### Rejected alternatives

- **Test-after**: tests rationalize impl behavior rather than verifying spec compliance. False negatives are common
- **Mixed**: in practice degenerates to test-after because the impl is easier to write first

## Workflow

For every new rule (orchestrated by the `add-rule` skill):

1. **RED**: write `src/rules/<rule>/spec.md` (Given/When/Then in plain prose), `tests/fixtures/<rule>/{valid,invalid}/*.md`, `tests/rules/<rule>.test.ts` with `expect(diagnostics).toMatchInlineSnapshot()` (empty snapshot). Run `pnpm vitest run`. **Confirm RED**.
2. **GREEN**: write minimum `src/rules/<rule>/index.ts` (visitor + diagnostic emission) — just enough to flip every snapshot. Run `pnpm vitest run`. **Confirm GREEN**.
3. **REFACTOR**: extract shared helpers to `src/core/`. After each extraction, run `pnpm vitest run`. Any RED aborts and reverts.

For bug fixes:

1. Write a failing test that reproduces the bug. Run vitest. Confirm RED.
2. Fix. Run vitest. Confirm GREEN.

For utility additions: same RED-GREEN-REFACTOR shape.

## Consequences

### Positive

- Rule diagnostics (line, column, messageId, fix) are explicitly contracted in tests
- Refactor confidence: all-green precondition makes utility extraction cheap
- LLM-assisted development becomes deterministic (skill enforces gates)
- Spec-driven thinking prevents over-implementation
- Tests serve as executable spec documentation

### Negative / Trade-offs

- Slightly slower per-rule turnaround than "vibe coding" — but pays back at the first regression
- Requires tooling to maintain discipline (addressed by `add-rule`, `red-gate`, `tdd-loop` skills)
- Property-based fuzzing (fast-check) adds complexity — applied selectively to rules where the input domain warrants it (`madr/date-iso8601`, `madr/filename-format`)

## Scope of TDD on this project

Applies to:

- All `src/rules/*` rule implementations
- All `src/core/*` utilities (parser, runner, cache, reporter, severity resolver)
- All bug fixes anywhere in the codebase

Does NOT apply to:

- Configuration file scaffolds (`tsconfig.json`, `mise.toml`, etc.) — declarative
- Documentation files
- One-shot scripts in `scripts/`

## Mutation testing

Stryker (mutation testing) is **not adopted at v0.x**. Re-evaluate at M3 when shared utilities have grown enough that mutation testing's setup cost (~2h) buys meaningful signal about test strength.

## Links

- ADR-0002: AST parsing strategy
- vitest: https://vitest.dev/
- eslint-vitest-rule-tester (RuleTester pattern reference): https://github.com/antfu/eslint-vitest-rule-tester
- fast-check (property-based testing): https://fast-check.dev/
- Forcing Claude Code to TDD: https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/
