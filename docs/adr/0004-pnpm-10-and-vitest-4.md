---
status: accepted
date: 2026-05-01
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0004: Tooling adjustments — pnpm 10, vitest 4 retained

## Context and Problem Statement

During M0 setup, two native binding resolution failures blocked basic test execution:

1. **vitest 4.x**: rolldown's `darwin-arm64.node` binding could not be loaded (`MODULE_NOT_FOUND`)
2. **oxlint v1.62**: `@oxlint/binding-darwin-arm64` was not present in `node_modules`

Both failed identically: missing platform-specific optional dependency. The `mise.toml` originally pinned pnpm 9.15.0 per the handoff document. Investigation traced the cause to pnpm 9's optional-dependency resolution under the `.pnpm` virtual store layout — optional bindings for darwin-arm64 were declared by upstream packages but never installed, even after `pnpm rebuild`.

## Decision Drivers

- Tests must run for TDD discipline (ADR-0003)
- vitest 4 is the current major; downgrading is a long-term cost
- oxlint is the project's chosen linter (CLAUDE.md "Tooling")
- Native binding failures are likely to recur as more dependencies are added (esbuild, swc, etc.) — a chronic issue, not a one-off

## Considered Options

1. Downgrade vitest to 3.2.4 (workaround applied initially, reverted)
2. Replace oxlint with biome (single binary, no native binding issue)
3. **Upgrade pnpm to 10.x** — this decision
4. Stay on pnpm 9 and manually install platform bindings via `optionalDependencies`

## Decision Outcome

Adopted: **Upgrade pnpm to 10.28.0**

### Rationale

- pnpm 10's optional-dependency resolution is materially improved. After `pnpm install --force` post-upgrade, all native bindings (rolldown for vitest, `@oxlint/binding-darwin-arm64`) resolved correctly.
- vitest 4 was restored to its current version (commit `c4451f9`).
- **biome** was rejected because the project already shaped its rule API around oxlint/ESLint conventions (`madr/<kebab>` IDs, severity model), and biome's rule shape is GritQL/Rust-bound rather than the JS visitor model. Switching tools would force a rewrite of the rule registry.
- **Manual binding install** (option 4) was rejected as chronic maintenance: every new native-bindings dependency would re-trigger the same problem and require explicit allowlisting.

## Consequences

### Positive

- vitest 4 (current) and oxlint both functional
- pnpm 10 is the current major; aligns with ecosystem direction
- Future native-binding additions (esbuild, swc, sharp, etc.) less likely to break
- `pnpm install --force` is no longer needed routinely

### Negative

- `mise.toml` updated mid-project; no contributor-facing impact since the file is the source of truth
- pnpm 10's `.pnpm` virtual store layout differs slightly from pnpm 9; CI scripts assuming pnpm 9 paths would need updating (none yet exist — `bootstrap-ci` skill will generate pnpm-10-aware workflows)

## Implementation status

- 2026-05-01: applied to `mise.toml` (commits `272feaa` and `c4451f9`)
- pnpm 10.28.0 in production for all subsequent commits
- pnpm version mentioned in `bootstrap-ci` skill output is aligned to 10 (post-review fix)

## Links

- ADR-0001: TypeScript + Node 22 + pnpm runtime (this ADR refines the pnpm baseline)
- pnpm 10 release notes: https://pnpm.io/v/10.0.0
- oxlint native bindings: https://oxc.rs/docs/guide/installation
- Earlier vitest downgrade then revert (commits `0d1f528` → `c4451f9`)
