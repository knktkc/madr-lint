# ADR-0042: Typical-sized ADR for benchmarking

- Status: Accepted
- Date: 2026-05-01
- Deciders: knktkc

## Context and Problem Statement

This is a typical-sized ADR fixture used for performance benchmarking. It
contains realistic prose, multiple sections, and inline code, mirroring
what real-world ADRs look like in mid-sized projects.

The exact content is incidental — what matters is that the file is in the
range of a typical ADR.

## Decision Drivers

- Realistic file size for a typical project ADR
- Multiple paragraphs and sections
- Some inline `code` and a link reference

## Considered Options

1. Use a stripped-down ADR (chosen for `tiny.md`)
2. Use this typical-sized ADR (chosen for `typical.md`)
3. Use a pathologically large ADR (deferred)

## Decision Outcome

Adopted: **Option 2 — typical-sized ADR**

### Rationale

The benchmark corpus needs a file that resembles real-world workloads.

## Consequences

### Positive

- Benchmark numbers are representative
- Stable file size lets us compare baselines

### Negative

- Single language (English)
- Not exercising pathological cases

## Links

- See `tiny.md` for a minimal counterpart.
