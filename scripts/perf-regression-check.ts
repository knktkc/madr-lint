#!/usr/bin/env tsx
// Relative perf-regression check: benchmark the BASE ref and HEAD on the SAME
// machine in the same run, then compare. This is machine-independent — unlike
// comparing against a committed baseline.json captured on a different host
// (which made the check fail uniformly on slower CI runners).
//
// The base ref is materialized in a throwaway git worktree INSIDE the repo
// (`.perf-base/`), so Node resolves the repo's node_modules and the main
// working tree is never mutated. Base ref resolution order: $PERF_BASE_REF,
// else `HEAD~1`.
//
// To avoid noise-induced flakiness (two sequential bench phases on a shared
// runner can swing >10% by chance), a rule that shows a regression is
// re-measured once; a task fails only if the regression REPRODUCES.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareRule,
  metricsFromRows,
  type Change,
  type TaskMetrics,
} from './perf-compare.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BENCH_DIR = join(ROOT, 'benchmarks');
const WORKTREE = join(ROOT, '.perf-base');
const FAIL_THRESHOLD = 0.1;
const WARN_THRESHOLD = 0.05;

// execFileSync (no shell) — avoids command injection / quoting issues from the
// PERF_BASE_REF env var and from paths that may contain spaces.
function git(args: string[], cwd: string = ROOT): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function tryGit(args: string[], cwd: string = ROOT): string | null {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function runBench(benchFileAbs: string, cwd: string): boolean {
  try {
    execFileSync('tsx', [benchFileAbs], { cwd, stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error(`[perf:check] bench failed: ${(err as Error).message}`);
    return false;
  }
}

function readMetrics(ruleDirAbs: string, shortSha: string): TaskMetrics[] | null {
  const jsonPath = join(ruleDirAbs, `${shortSha}.json`);
  if (!existsSync(jsonPath)) return null;
  const rows = JSON.parse(readFileSync(jsonPath, 'utf8')) as Array<
    Record<string, unknown>
  >;
  return metricsFromRows(rows);
}

function ruleDirsIn(benchRoot: string): string[] {
  if (!existsSync(benchRoot)) return [];
  return readdirSync(benchRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

interface Side {
  label: 'HEAD' | 'base';
  benchRoot: string;
  cwd: string;
  short: string;
}

/** Run benches for `rules` on one side; return rule → metrics. `notes` (if
 *  given) collects skip reasons (first round only, to avoid duplicates). */
function measure(
  side: Side,
  rules: Iterable<string>,
  notes: string[] | null,
): Map<string, TaskMetrics[]> {
  const out = new Map<string, TaskMetrics[]>();
  for (const rule of rules) {
    const benchFile = join(side.benchRoot, rule, 'bench.ts');
    if (!existsSync(benchFile)) {
      notes?.push(`${rule}: no bench.ts (${side.label})`);
      continue;
    }
    console.log(`[perf:check] ${side.label} bench: ${rule}`);
    if (!runBench(benchFile, side.cwd)) {
      notes?.push(`${rule}: ${side.label} bench failed`);
      continue;
    }
    const m = readMetrics(join(side.benchRoot, rule), side.short);
    if (!m) {
      notes?.push(`${rule}: ${side.label} bench emitted no ${side.short}.json`);
      continue;
    }
    out.set(rule, m);
    // Tidy the emitted per-sha JSON (gitignored) so the working tree stays clean.
    rmSync(join(side.benchRoot, rule, `${side.short}.json`), { force: true });
  }
  return out;
}

// ── Resolve base ref ───────────────────────────────────────────────────────
const baseRef = (process.env.PERF_BASE_REF || 'HEAD~1').trim();
if (baseRef.startsWith('-')) {
  console.error(`[perf:check] Refusing suspicious PERF_BASE_REF "${baseRef}".`);
  process.exit(2);
}
let baseSha = tryGit(['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]);
if (!baseSha) {
  console.log(
    `[perf:check] base ref "${baseRef}" not found locally; attempting fetch...`,
  );
  tryGit(['fetch', '--no-tags', '--depth=50', 'origin', baseRef]);
  baseSha = tryGit(['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]);
}
if (!baseSha) {
  console.log(
    `[perf:check] Could not resolve base ref "${baseRef}" (e.g. first commit or shallow clone). Skipping relative perf check.`,
  );
  process.exit(0);
}

const headShort = git(['rev-parse', '--short', 'HEAD']);
const baseShort = baseSha.slice(0, headShort.length);
console.log(
  `[perf:check] comparing HEAD (${headShort}) against base ${baseRef} (${baseShort})`,
);

// ── Measure ──────────────────────────────────────────────────────────────────
type ReportedChange = Change & { note?: string };
interface RuleResult {
  rule: string;
  changes: ReportedChange[];
}

const skipped: string[] = [];
const headSide: Side = { label: 'HEAD', benchRoot: BENCH_DIR, cwd: ROOT, short: headShort };
const headMetrics = measure(headSide, ruleDirsIn(BENCH_DIR), skipped);

const results: RuleResult[] = [];

function cleanupWorktree(): void {
  rmSync(WORKTREE, { recursive: true, force: true });
  tryGit(['worktree', 'prune']);
}

cleanupWorktree(); // clear any stale worktree from a previous interrupted run
try {
  git(['worktree', 'add', '--detach', WORKTREE, baseSha]);
  const baseSide: Side = {
    label: 'base',
    benchRoot: join(WORKTREE, 'benchmarks'),
    cwd: WORKTREE,
    short: git(['rev-parse', '--short', 'HEAD'], WORKTREE),
  };

  const baseMetrics = measure(baseSide, headMetrics.keys(), skipped);

  // Round 1: compare.
  const round1 = new Map<string, Change[]>();
  for (const [rule, head] of headMetrics) {
    const base = baseMetrics.get(rule);
    if (!base) {
      skipped.push(`${rule}: new benchmark (absent in base ${baseShort})`);
      continue;
    }
    round1.set(rule, compareRule(head, base, FAIL_THRESHOLD, WARN_THRESHOLD));
  }

  // Confirm-on-fail: re-measure only the rules that regressed; a task fails
  // for real only if it ALSO regresses in the second round. Non-reproduced
  // fails are downgraded to warn (visible, but don't block CI).
  const failingRules = [...round1]
    .filter(([, ch]) => ch.some((c) => c.severity === 'fail'))
    .map(([rule]) => rule);

  let head2 = new Map<string, TaskMetrics[]>();
  let base2 = new Map<string, TaskMetrics[]>();
  if (failingRules.length > 0) {
    console.log(
      `[perf:check] ${failingRules.length} rule(s) regressed in round 1; re-measuring to rule out noise...`,
    );
    head2 = measure(headSide, failingRules, null);
    base2 = measure(baseSide, failingRules, null);
  }

  for (const [rule] of headMetrics) {
    const ch1 = round1.get(rule);
    if (!ch1) continue;
    if (!failingRules.includes(rule)) {
      results.push({ rule, changes: ch1 });
      continue;
    }
    const h2 = head2.get(rule);
    const b2 = base2.get(rule);
    const ch2 = h2 && b2 ? compareRule(h2, b2, FAIL_THRESHOLD, WARN_THRESHOLD) : null;
    const merged: ReportedChange[] = ch1.map((c) => {
      if (c.severity !== 'fail') return c;
      const c2 = ch2?.find((x) => x.task === c.task);
      if (!ch2) return { ...c, note: 'reconfirm failed; treated as regression' };
      if (c2 && c2.severity === 'fail') return { ...c2, note: 'confirmed' };
      return { ...c, severity: 'warn', note: 'not reproduced on re-measure' };
    });
    results.push({ rule, changes: merged });
  }
} finally {
  cleanupWorktree();
}

// ── Report ───────────────────────────────────────────────────────────────────
let totalOk = 0;
let totalWarn = 0;
let totalFail = 0;

for (const r of results) {
  console.log(`\n=== ${r.rule} (HEAD vs base ${baseShort}) ===`);
  for (const c of r.changes) {
    const pct = (c.delta * 100).toFixed(2);
    const arrow = c.delta >= 0 ? '+' : '';
    const tag = { ok: '  ', warn: 'WARN', fail: 'FAIL' }[c.severity];
    const note = c.note ? ` (${c.note})` : '';
    console.log(`  [${tag}] ${c.task}${note}`);
    console.log(
      `         base ${c.base.toLocaleString('en-US')} ops/s → head ${c.head.toLocaleString('en-US')} ops/s  (${arrow}${pct}%)`,
    );
    if (c.severity === 'fail') totalFail++;
    else if (c.severity === 'warn') totalWarn++;
    else totalOk++;
  }
}

if (skipped.length > 0) {
  console.log('\n[perf:check] Skipped:');
  for (const s of skipped) console.log(`  - ${s}`);
}

console.log(
  `\n[perf:check] Summary: ${totalOk} ok, ${totalWarn} warn, ${totalFail} fail (HEAD vs base ${baseShort})`,
);

if (totalFail > 0) {
  console.error(
    `\n[perf:check] FAIL: ${totalFail} task${totalFail === 1 ? '' : 's'} regressed by ≥${FAIL_THRESHOLD * 100}% vs base (reproduced). Exit 1.`,
  );
  process.exit(1);
}

if (totalWarn > 0) {
  console.warn(
    `[perf:check] ${totalWarn} task${totalWarn === 1 ? '' : 's'} slowed ${WARN_THRESHOLD * 100}-${FAIL_THRESHOLD * 100}% vs base (warning, no fail).`,
  );
}
