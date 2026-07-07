---
status: accepted
date: 2026-07-07
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0008: Autofix via raw-text offset edits

## Context and Problem Statement

`madr-lint` points at problems but never repairs them (issue #28). Several rules
are mechanically fixable, and "run `--fix` and be done" is a step-change in UX
over reading a wall of diagnostics. The autofix framework is the v0.4.0
headline: a `fix` thunk on `context.report(...)`, a `meta.fixable` gate, a CLI
`--fix` / `--fix-dry-run`, and an applier that reaches a fixpoint.

The load-bearing question is **what a fix operates on**. A fix must survive the
exact formatting an author wrote — trailing whitespace, list marker style,
blank-line rhythm, YAML key order — because a linter that reformats a file while
fixing one status value is worse than one that fixes nothing.

A second, subtler question: mdast node positions are **body-relative** — `parseFile`
strips YAML frontmatter with `gray-matter` *before* feeding the body to
`mdast-util-from-markdown`, so every `position.*.offset` counts from the start of
the body, not the file. A fix that writes to raw file bytes must translate.

## Decision Drivers

- **Formatting fidelity.** A fix must change only the span it targets; the rest
  of the file must come back byte-identical.
- **Determinism.** The same inputs must always produce the same output — no
  order-dependence when several fixes touch one file.
- **Zero cost on a normal lint.** Fixing is opt-in (`--fix`). The lint hot path,
  carefully tuned across #53/#67, must not regress. Fix thunks must be lazy.
- **Honest about suppression and baseline.** A suppressed or baselined problem is
  one the user chose to keep. Fixing must never silently rewrite it.
- **A clean seam for cross-file fixes.** Project-rule fixes (#29) come next; the
  applier must not bake in per-file assumptions that block them.

## Considered Options

1. **Raw-text offset edits (chosen)** — a rule returns `TextEdit { range:
   [start, end]; text }` in whole-file coordinates (via a `Fixer` that translates
   body offsets). The applier splices edits into the original string.
2. **AST print-back** — mutate the mdast tree and re-serialize with
   `mdast-util-to-markdown`.
3. **Diff/patch application** — rules emit unified-diff hunks; the applier runs a
   patch.

## Decision Outcome

Adopted: **Option 1 — raw-text offset edits.**

- A rule attaches a lazy `fix: (fixer) => TextEdit | TextEdit[] | null` to
  `context.report(...)`, permitted **only** when its `meta.fixable === 'code'`.
  A fix from a non-fixable rule is a rule bug: the runner throws, which the
  existing per-rule isolation converts to a `core/internal-error` diagnostic.
- The `Fixer` helpers (`replaceRange`, `insertAt`, `remove`) take **body**
  (mdast) offsets and add the stripped-frontmatter length so the emitted
  `TextEdit` carries **whole-file** offsets. The offset is exact:
  `frontmatterOffset(content) = content.length - grayMatter(content).content.length`,
  and gray-matter never mutates the body, so the body is always an exact suffix
  (verified across CRLF and leading-newline inputs). The `Fixer` is the single
  translation point — rules and the applier never mix coordinate systems.
- The parser is the source of the body offsets a fix targets: `ParsedFile.metadataValueLoc`
  (exposed to rules as `context.metadataValueLoc`) gives the exact `{ start, end }`
  body range of a `metadata` value, when that value is v2-list-sourced and a
  single contiguous text token — the offset a rule's `fix` thunk passes to
  `fixer.replaceRange`.
- `Diagnostic.fixable: boolean` is a required, **durable** field (serialized to
  the cache and json output; the text reporter renders a dim `🔧 fixable`
  marker). The live `fix` thunk is **transient** — a closure, dropped by JSON
  serialization, absent on cache-hydrated diagnostics.
- **Applier semantics** (`src/core/fix.ts`): collect fixes from **reported**
  diagnostics only — *after* inline-suppression filtering and *after* baseline
  subtraction. Sort edits by start offset; on overlap, the earliest-start edit
  wins and later overlappers are dropped (deterministic). Invalid ranges
  (inverted, out of bounds) are dropped. Apply in a single left-to-right pass,
  then **re-lint the fixed content and repeat** to a fixpoint — capped at **10
  passes** (ESLint parity), and stopped early when an edit makes no progress.
- **Scope: per-file rules only.** The applier takes per-file edit sets, so
  project-rule (cross-file) fixes (#29) reuse `applyEdits` with their own
  collection — the clean seam. Files are written only when content actually
  changed; the cache is bypassed while fixing (fixes need live thunks) and a
  fixed file re-enters the normal pipeline on the next run with a fresh hash.

### Rationale

- **Formatting fidelity is structural.** Splicing a substring cannot touch bytes
  outside the edit range — fidelity is a property of the mechanism, not a
  round-trip we hope preserves style.
- **The fixpoint is what makes fixes composable.** One pass may enable another
  (e.g. a fix that changes a value another rule then re-checks). Re-linting the
  fixed content, bounded at 10 passes, converges without an unbounded loop.
- **Laziness keeps the hot path free.** A `fix` thunk is a closure that is only
  invoked when fixing is requested; a normal lint constructs no `Fixer` and calls
  no thunk. The runner adds one `d.fix !== undefined` check per `report()` — the
  filename-format and status-enum benches confirm no regression.

### Rejected alternatives

- **AST print-back (Option 2).** `mdast-util-to-markdown` re-emits the *whole*
  document from the tree, normalizing marker style (`-` vs `*`), reflowing,
  re-escaping, and collapsing blank lines. Fixing one status value would rewrite
  the entire file — an unreviewable diff and a hostile experience. It also
  discards the author's frontmatter formatting entirely.
- **Diff/patch (Option 3).** Rules would have to compute line-level hunks, which
  is strictly harder than naming an offset range they already have from
  `node.position`. Applying a patch re-introduces fuzz/context matching and its
  failure modes. Offsets are exact and trivially composable; a unified diff is
  still produced for `--fix-dry-run`, but only as a **display** of the resulting
  edits, never as the fix representation.

## Consequences

### Positive

- `--fix` repairs mechanically-fixable violations while leaving every other byte
  untouched; `--fix-dry-run` previews the change as a unified diff and writes
  nothing.
- The framework is provable end-to-end: `madr/status-enum` ships the first real
  fix — a pure case normalization of a v2 list-sourced value.
- Suppressed and baselined problems are never rewritten — fixes are collected
  after both filters, matching the "the user chose to keep this" contract that
  inline suppression (#23) and the baseline (#24 / ADR-0007) already honor.
- The per-file edit-set seam leaves cross-file fixes (#29) a clean path with no
  applier rework.

### Negative

- The first real fix is deliberately narrow. `madr/status-enum` fixes **only** a
  v2 list-sourced value that differs from an allowed value purely by case (where
  the parser records an exact body-offset range). Frontmatter-sourced values have
  no body offset and need YAML-aware rewriting — out of scope, so they get no
  fix. Broader fixes are #29.
- `Diagnostic` gained a required `fixable` field, a breaking change to the type
  and to the cached diagnostic shape — the cache schema version is bumped to `3`
  (mirroring the #67 `suggestion`/`docsUrl` bump), so any stale-shape manifest is
  treated as cold.
- The applier re-lints on every pass (up to 10). This is acceptable: `--fix` is
  not the CI hot path, and convergence is usually one or two passes.

## Links

- [ADR-0002](./0002-ast-parsing-strategy.md): frontmatter is stripped before
  mdast parsing — the reason offsets are body-relative and must be translated
- [ADR-0007](./0007-baseline-fingerprint-design.md): baseline subtraction runs
  before fixes are collected, so baselined problems are never rewritten
- Issue #28: autofix framework (`--fix`, `meta.fixable`, fixer API)
- Issue #29: fixable rules + cross-file fixes (follow-up)
- ESLint autofix (10-pass fixpoint, `SourceCodeFixer`): `https://eslint.org/docs/latest/extend/custom-rules#applying-fixes`
