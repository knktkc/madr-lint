# ADR-0001: Typical-sized ADR for benchmarking

- Status: Proposed
- Date: 2026-05-01
- Deciders: knktkc

## Context and Problem Statement

This is a typical-sized ADR fixture used for performance benchmarking of
madr-lint rules. It contains realistic prose, multiple sections, links, and
moderate amounts of inline code, mirroring what real-world ADRs look like in
mid-sized projects.

The exact content is incidental — what matters is that the file is in the
range of a typical ADR (roughly 100-300 lines, 1-3 KB). Filename-format does
not parse content, so this is mostly a sanity check that the rule's runtime
is independent of file size.

## Decision Drivers

- Realistic file size for a typical project ADR
- Multiple paragraphs and sections
- Some inline `code` and a link reference
- Stable for snapshot comparison across benchmark runs

## Considered Options

1. Use a stripped-down ADR (chosen for `tiny.md`)
2. Use this typical-sized ADR (chosen for `typical.md`)
3. Use a pathologically large ADR (deferred until rules that scale with content land)

## Decision Outcome

採択: **Option 2 — typical-sized ADR**

### Rationale

The benchmark corpus needs a file that resembles real-world workloads.
A typical ADR for a non-trivial decision tends to be in this size range,
with a handful of sections and several paragraphs of justification.

## Consequences

### Positive

- Benchmark numbers are representative of actual user workloads
- Stable file size lets us compare baselines across versions

### Negative / Trade-offs

- Not exercising pathological cases (very long lines, deeply nested lists)
- Single language (English) — rules that handle CJK widths could miss issues

## Links

- See `tiny.md` for a minimal counterpart.
- ADR-0002 in this project covers the AST parsing strategy that future
  rules will exercise.
