// Baseline file for gradual adoption (issue #24).
//
// FINGERPRINT MODEL: a violation is identified by `(relative posix path,
// ruleName, messageId)` mapped to an allowed COUNT. No line numbers, no
// message text, no interpolation data — so the baseline survives unrelated
// edits by construction (a rule that fires the same number of times on the
// same file+message is fully absorbed regardless of where the lines moved).
// This is the tsc-baseline-style count model; see ADR-0007 for the rationale
// and the rejected line-based / content-hash alternatives.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { INTERNAL_ERROR_RULE_NAME, type Diagnostic } from './types.js';

/** Bumped only on a breaking change to the on-disk shape. */
export const BASELINE_VERSION = 1;

/** Fixed, project-root-relative location. Also used verbatim in summaries. */
export const BASELINE_DISPLAY_PATH = '.madr-lint/baseline.json';

/**
 * On-disk baseline. `entries` nests path → ruleName → messageId → count.
 * The nesting (rather than a flat hash) is what yields clean, reviewable git
 * diffs once keys are sorted at serialization time.
 */
export interface Baseline {
  version: number;
  entries: Record<string, Record<string, Record<string, number>>>;
}

export interface BaselineApplyResult {
  /** Diagnostics that survive subtraction (new / over-count / never baselined). */
  kept: Diagnostic[];
  /** How many diagnostics the baseline absorbed. */
  hidden: number;
}

/** Absolute path to the baseline file for a given project root. */
export function baselinePath(cwd: string): string {
  return join(cwd, '.madr-lint', 'baseline.json');
}

/**
 * Null-prototype map. Fingerprint keys derive from on-disk filenames and
 * rule metadata, so a key like '__proto__' must behave as ordinary data —
 * on a plain object it would read/write THROUGH Object.prototype instead
 * (prototype pollution + silently dropped entries). With no prototype there
 * is nothing to pollute. JSON.stringify output is identical.
 */
function nullProtoMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/**
 * Aggregate diagnostics into a baseline by counting each
 * `(path, ruleName, messageId)`. `core/internal-error` is never recorded —
 * it signals a rule bug and must never be silenced (same contract as inline
 * suppression).
 */
export function buildBaseline(diagnostics: readonly Diagnostic[]): Baseline {
  const entries = nullProtoMap<Record<string, Record<string, number>>>();
  for (const d of diagnostics) {
    if (d.ruleName === INTERNAL_ERROR_RULE_NAME) continue;
    const byRule = (entries[d.path] ??= nullProtoMap());
    const byMessage = (byRule[d.ruleName] ??= nullProtoMap());
    byMessage[d.messageId] = (byMessage[d.messageId] ?? 0) + 1;
  }
  return { version: BASELINE_VERSION, entries };
}

/**
 * Deterministic serialization: keys sorted at every level (path, then rule,
 * then messageId), 2-space indent, trailing newline. Same logical baseline
 * always produces byte-identical output → minimal git diffs.
 */
export function serializeBaseline(baseline: Baseline): string {
  // Null-proto targets: on a plain object, assigning a '__proto__' key goes
  // through the inherited setter and the entry silently vanishes from the
  // JSON output.
  const sortedEntries = nullProtoMap<Record<string, Record<string, number>>>();
  for (const path of Object.keys(baseline.entries).toSorted()) {
    const byRule = baseline.entries[path] ?? {};
    const sortedByRule = nullProtoMap<Record<string, number>>();
    for (const rule of Object.keys(byRule).toSorted()) {
      const byMessage = byRule[rule] ?? {};
      const sortedByMessage = nullProtoMap<number>();
      for (const messageId of Object.keys(byMessage).toSorted()) {
        sortedByMessage[messageId] = byMessage[messageId] ?? 0;
      }
      sortedByRule[rule] = sortedByMessage;
    }
    sortedEntries[path] = sortedByRule;
  }
  const ordered = { version: baseline.version, entries: sortedEntries };
  return JSON.stringify(ordered, null, 2) + '\n';
}

/**
 * Read a baseline file. Returns null when absent or unreadable/malformed —
 * a missing or corrupt baseline is treated as "no baseline" (a no-op),
 * never a hard error.
 */
export function loadBaseline(path: string): Baseline | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<Baseline>;
    if (typeof data.entries !== 'object' || data.entries === null) return null;
    return {
      version: typeof data.version === 'number' ? data.version : BASELINE_VERSION,
      entries: rebuildEntries(data.entries as Record<string, unknown>),
    };
  } catch {
    return null;
  }
}

/**
 * Copy parsed JSON into null-proto maps, keeping only well-shaped levels
 * (objects) and leaves (numbers). JSON.parse itself creates '__proto__' as
 * a safe own property, but handing proto-ful objects downstream would
 * re-expose every consumer write to the pollution hazard — and a malformed
 * inner level (e.g. `"a.md": null`) would crash applyBaseline.
 */
function rebuildEntries(raw: Record<string, unknown>): Baseline['entries'] {
  const entries = nullProtoMap<Record<string, Record<string, number>>>();
  for (const [path, rawByRule] of Object.entries(raw)) {
    if (typeof rawByRule !== 'object' || rawByRule === null) continue;
    const byRule = nullProtoMap<Record<string, number>>();
    for (const [rule, rawByMessage] of Object.entries(rawByRule)) {
      if (typeof rawByMessage !== 'object' || rawByMessage === null) continue;
      const byMessage = nullProtoMap<number>();
      for (const [messageId, count] of Object.entries(
        rawByMessage as Record<string, unknown>,
      )) {
        if (typeof count === 'number') byMessage[messageId] = count;
      }
      byRule[rule] = byMessage;
    }
    entries[path] = byRule;
  }
  return entries;
}

/** Write the baseline deterministically, creating `.madr-lint/` if needed. */
export function writeBaseline(path: string, baseline: Baseline): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeBaseline(baseline), 'utf8');
}

// NUL cannot appear in paths, rule names, or messageIds, so joined keys
// can never collide. Written as an escape (not a raw byte) to keep this
// file text for git diff/blame.
const KEY_SEP = '\u0000';

function fingerprint(d: Diagnostic): string {
  return d.path + KEY_SEP + d.ruleName + KEY_SEP + d.messageId;
}

/**
 * Subtract a baseline from a diagnostic list. For each fingerprint the first
 * N matching diagnostics (N = baselined count) are absorbed; any extras are
 * reported as new. `core/internal-error` is never absorbed. Stale entries
 * (count exceeding current matches) are simply inert — no error is raised.
 *
 * O(1) per diagnostic: a mutable per-fingerprint allowance map is built once,
 * then each diagnostic is a single map lookup + decrement.
 */
export function applyBaseline(
  diagnostics: readonly Diagnostic[],
  baseline: Baseline,
): BaselineApplyResult {
  const remaining = new Map<string, number>();
  for (const [path, byRule] of Object.entries(baseline.entries)) {
    for (const [rule, byMessage] of Object.entries(byRule)) {
      if (rule === INTERNAL_ERROR_RULE_NAME) continue;
      for (const [messageId, count] of Object.entries(byMessage)) {
        remaining.set(path + KEY_SEP + rule + KEY_SEP + messageId, count);
      }
    }
  }

  const kept: Diagnostic[] = [];
  let hidden = 0;
  for (const d of diagnostics) {
    if (d.ruleName === INTERNAL_ERROR_RULE_NAME) {
      kept.push(d);
      continue;
    }
    const key = fingerprint(d);
    const left = remaining.get(key);
    if (left !== undefined && left > 0) {
      remaining.set(key, left - 1);
      hidden++;
    } else {
      kept.push(d);
    }
  }
  return { kept, hidden };
}

function totalCount(baseline: Baseline): number {
  let total = 0;
  for (const byRule of Object.values(baseline.entries)) {
    for (const byMessage of Object.values(byRule)) {
      for (const count of Object.values(byMessage)) total += count;
    }
  }
  return total;
}

/**
 * One-line summary after `--update-baseline`. Counts the SUM of allowed
 * counts ("violations") — not fingerprint keys, and deliberately not the
 * word "entries", which names the on-disk map.
 */
export function baselineWriteSummary(baseline: Baseline): string {
  const violations = totalCount(baseline);
  const files = Object.keys(baseline.entries).length;
  const v = `${violations} ${violations === 1 ? 'violation' : 'violations'}`;
  const f = `${files} ${files === 1 ? 'file' : 'files'}`;
  return `Wrote ${v} across ${f} to ${BASELINE_DISPLAY_PATH}`;
}

/**
 * Stderr warning for a baseline file that EXISTS but could not be used.
 * A missing file is silent by design; a present-but-broken one must not be —
 * silently ignoring it would flip CI red with zero explanation.
 */
export function baselineMalformedWarning(): string {
  return `madr-lint: warning: ${BASELINE_DISPLAY_PATH} is malformed; ignoring it (run --update-baseline to regenerate)`;
}

/** One-line summary appended to text output when the baseline hid diagnostics. */
export function baselineHiddenSummary(hidden: number): string {
  return `${hidden} ${hidden === 1 ? 'problem' : 'problems'} hidden by baseline (${BASELINE_DISPLAY_PATH})`;
}
