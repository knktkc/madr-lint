---
status: accepted
date: 2026-05-01
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0001: TypeScript + Node 22 + pnpm runtime

## Context and Problem Statement

`madr-lint` needs a runtime/language baseline. The choice affects ecosystem fit, performance, contributor accessibility, distribution channels (npm, GitHub Action), and long-term maintenance burden.

## Decision Drivers

- Ecosystem alignment: target users are JavaScript/TypeScript developers managing ADRs in Node.js projects
- Type safety: linter rules carry complex AST + config invariants where strict types catch real bugs
- Modern features: top-level await, native ESM, AbortController, Web standard APIs
- Distribution: GitHub Actions are best supported when the runtime is Node.js
- mise compatibility: project pins tools via `mise.toml`
- Solo maintainer: minimal friction in setup and CI

## Considered Options

1. **TypeScript + Node 22+ (ESM, pnpm)** — this decision
2. JavaScript + Node 22 (no TypeScript)
3. Deno
4. Bun

## Decision Outcome

採択: **TypeScript + Node 22+ (ESM, pnpm)**

### Rationale

- TypeScript strict mode catches a wide class of bugs in rule meta + AST traversal
- Node 22 is the current LTS; native ESM is mature; `require(esm)` available in Node 23+
- pnpm is fast, content-addressable, and the OSS standard for new TS projects in 2026
- Deno/Bun would limit GitHub Action distribution (composite/Node-based actions are first-class on GitHub Actions)
- Aligns with the parent project `frontend-implementation-boilerplate` which uses the same baseline

### Rejected alternatives

- **JavaScript without TS**: forfeits the type safety that linter authoring (rule meta, AST nodes, severity, options) most benefits from
- **Deno**: GitHub Action distribution requires a Node shim; npm publish is awkward; smaller user base for an ADR linter
- **Bun**: GitHub Action support immature; potential incompatibility with consumer Node setups

## Consequences

### Positive

- Type-safe rule API with full IDE support
- ESM-only avoids dual-package hazard
- Native Node provenance support via OIDC trusted publishing
- Standard tooling (vitest, oxlint, tsup) all first-class in this stack
- mise + pnpm reproducible across contributors

### Negative / Trade-offs

- ESM-only excludes CJS-only consumers (acceptable in 2026; Node 23+ can `require()` ESM)
- TypeScript build step adds a compile cycle vs raw JS (mitigated by `tsup` speed)
- pnpm has a slight onboarding curve for npm/yarn-only contributors (mitigated by `mise.toml`)

## Links

- mise: https://mise.jdx.dev/
- pnpm: https://pnpm.io/
- Node 22 LTS: https://nodejs.org/en/blog/announcements/v22-release-announce
- Parent project: https://github.com/xtone/frontend-implementation-boilerplate
