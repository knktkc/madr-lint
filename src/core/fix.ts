// Autofix applier (issue #28, ADR-0008).
//
// Fixes are RAW-TEXT offset edits, never AST serialization — round-trips lose
// formatting. A rule's `fix` thunk works in BODY (mdast) coordinates; the
// `Fixer` translates those to whole-file offsets by adding the stripped
// frontmatter length. The applier then:
//   1. collects edits from REPORTED diagnostics only (the caller has already
//      filtered suppression + baseline — those must never be silently rewritten),
//   2. sorts by start offset and drops any edit overlapping an earlier one
//      (first-by-position wins, deterministic),
//   3. applies them in a single pass, then RE-LINTS and repeats to a fixpoint
//      (max 10 passes, ESLint parity).
//
// Scope: per-file edit sets. Project-rule (cross-file) fixes are #29 — they
// reuse `applyEdits` with their own per-file edit collection (the clean seam).

import { frontmatterOffset } from './parser.js';
import type { Diagnostic, Fixer, TextEdit } from './types.js';

/** Fixpoint iteration cap (matches ESLint's autofix passes). */
export const MAX_FIX_PASSES = 10;

/**
 * Build a `Fixer` whose helpers take BODY offsets and emit whole-file
 * `TextEdit`s by adding `frontmatterOffset` (the length gray-matter stripped).
 */
export function makeFixer(base: number): Fixer {
  const shift = (n: number): number => n + base;
  return {
    replaceRange(range, text) {
      return { range: [shift(range[0]), shift(range[1])], text };
    },
    insertAt(offset, text) {
      const at = shift(offset);
      return { range: [at, at], text };
    },
    remove(range) {
      return { range: [shift(range[0]), shift(range[1])], text: '' };
    },
  };
}

/**
 * Apply text edits to `content` in a single pass. Edits are sorted by start
 * offset; any edit overlapping a previously-applied one is dropped (first wins).
 * Invalid ranges (non-integer, negative, inverted, out of bounds) are dropped.
 * Whole-file offsets in, new string out.
 */
export function applyEdits(content: string, edits: readonly TextEdit[]): string {
  return applyEditsCounted(content, edits).text;
}

/**
 * Counting variant of `applyEdits`: `applied` is the number of edits that
 * actually LANDED (post overlap/bounds filtering) — the honest source for
 * `summary.fixed`, which must not count dropped edits.
 */
function applyEditsCounted(
  content: string,
  edits: readonly TextEdit[],
): { text: string; applied: number } {
  const valid = edits.filter((e) => {
    const [start, end] = e.range;
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end >= start &&
      end <= content.length
    );
  });
  // Stable-ish deterministic order: by start, then by end.
  const sorted = valid.toSorted(
    (a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1],
  );

  let out = '';
  let cursor = 0;
  let applied = 0;
  for (const edit of sorted) {
    const [start, end] = edit.range;
    if (start < cursor) continue; // overlaps an already-applied edit — drop
    out += content.slice(cursor, start) + edit.text;
    cursor = end;
    applied++;
  }
  return { text: out + content.slice(cursor), applied };
}

/**
 * Invoke each diagnostic's `fix` thunk (if any) with a `Fixer` built for
 * `content`, flattening arrays and skipping thunks that decline (return null).
 * The frontmatter offset is derived from `content` so translation always
 * matches the exact bytes being edited.
 */
export function collectFixes(
  diagnostics: readonly Diagnostic[],
  content: string,
): TextEdit[] {
  const fixer = makeFixer(frontmatterOffset(content));
  const edits: TextEdit[] = [];
  for (const d of diagnostics) {
    if (!d.fix) continue;
    const result = d.fix(fixer);
    if (result === null) continue;
    if (Array.isArray(result)) edits.push(...result);
    else edits.push(result);
  }
  return edits;
}

export interface FixFileResult {
  /** Content after the fixpoint loop (unchanged if nothing applied). */
  fixedContent: string;
  /** Diagnostics of the FINAL content (post-suppression / -baseline via `lint`). */
  remaining: Diagnostic[];
  /** Whether any edit actually changed the content. */
  changed: boolean;
  /** Number of applied passes (0 when nothing was fixed). */
  passes: number;
  /** Edits that actually LANDED across all passes (dropped edits excluded). */
  applied: number;
}

/**
 * Drive the autofix fixpoint for ONE file. `lint(content)` must return the
 * REPORTED diagnostics for `content` — already suppression- and
 * baseline-filtered — carrying live `fix` thunks. The loop lints at the top of
 * every iteration, so `remaining` always reflects the returned `fixedContent`.
 * Stops when: no edits remain, an edit makes no progress, or `maxPasses` is hit.
 */
export function fixFileContent(
  originalContent: string,
  lint: (content: string) => Diagnostic[],
  maxPasses: number = MAX_FIX_PASSES,
): FixFileResult {
  let content = originalContent;
  let passes = 0;
  let applied = 0;

  for (;;) {
    const diagnostics = lint(content);
    const done = (): FixFileResult => ({
      fixedContent: content,
      remaining: diagnostics,
      changed: content !== originalContent,
      passes,
      applied,
    });

    if (passes >= maxPasses) return done();

    const edits = collectFixes(diagnostics, content);
    if (edits.length === 0) return done();

    const { text: next, applied: landed } = applyEditsCounted(content, edits);
    if (next === content) return done(); // no progress — avoid an infinite loop

    // Count edits that LANDED, not edits collected — overlap-dropped and
    // out-of-bounds edits never touched the content.
    applied += landed;
    content = next;
    passes++;
  }
}

// ──────────────────────────────────────────────────────────────────
// Unified diff (for --fix-dry-run). Line-based LCS with 3 lines of
// context, grouped into hunks. A preview, not a patch — the "\ No newline
// at end of file" marker is intentionally omitted.
// ──────────────────────────────────────────────────────────────────

const CONTEXT = 3;

type Op = { kind: 'eq' | 'del' | 'ins'; text: string };

/**
 * Produce a unified diff between `before` and `after` for display. Returns an
 * empty string when the two are identical.
 */
export function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return '';

  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffLines(a, b);
  const hunks = groupHunks(ops);
  if (hunks.length === 0) return '';

  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];
  for (const hunk of hunks) lines.push(...renderHunk(hunk));
  return lines.join('\n') + '\n';
}

/** Split into lines WITHOUT terminators; a trailing newline yields no empty tail. */
function splitLines(text: string): string[] {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** LCS-based line diff → a flat op sequence (eq / del / ins). */
function diffLines(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of LCS of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from<number>({ length: m + 1 }).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'eq', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: 'del', text: a[i]! });
      i++;
    } else {
      ops.push({ kind: 'ins', text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: 'del', text: a[i++]! });
  while (j < m) ops.push({ kind: 'ins', text: b[j++]! });
  return ops;
}

interface Hunk {
  aStart: number;
  aCount: number;
  bStart: number;
  bCount: number;
  ops: Op[];
}

/** Group the op sequence into hunks, keeping up to CONTEXT equal lines around changes. */
function groupHunks(ops: readonly Op[]): Hunk[] {
  // Index of each op onto its (1-based) source/target line for hunk headers.
  const changeIdx: number[] = [];
  ops.forEach((op, idx) => {
    if (op.kind !== 'eq') changeIdx.push(idx);
  });
  if (changeIdx.length === 0) return [];

  // Build [start, end] op-index windows padded by CONTEXT, then merge overlaps.
  const windows: Array<[number, number]> = [];
  for (const idx of changeIdx) {
    const start = Math.max(0, idx - CONTEXT);
    const end = Math.min(ops.length - 1, idx + CONTEXT);
    const last = windows[windows.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }

  const hunks: Hunk[] = [];
  for (const [start, end] of windows) {
    let aLine = 1;
    let bLine = 1;
    for (let k = 0; k < start; k++) {
      if (ops[k]!.kind !== 'ins') aLine++;
      if (ops[k]!.kind !== 'del') bLine++;
    }
    const hunkOps = ops.slice(start, end + 1);
    let aCount = 0;
    let bCount = 0;
    for (const op of hunkOps) {
      if (op.kind !== 'ins') aCount++;
      if (op.kind !== 'del') bCount++;
    }
    hunks.push({ aStart: aLine, aCount, bStart: bLine, bCount, ops: hunkOps });
  }
  return hunks;
}

function renderHunk(hunk: Hunk): string[] {
  const header = `@@ -${hunk.aStart},${hunk.aCount} +${hunk.bStart},${hunk.bCount} @@`;
  const body = hunk.ops.map((op) => {
    const prefix = op.kind === 'eq' ? ' ' : op.kind === 'del' ? '-' : '+';
    return `${prefix}${op.text}`;
  });
  return [header, ...body];
}
