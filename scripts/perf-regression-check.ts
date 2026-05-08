#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BENCH_DIR = join(ROOT, 'benchmarks');

const FAIL_THRESHOLD = 0.10;
const WARN_THRESHOLD = 0.05;

interface TaskMetrics {
  name: string;
  throughput: number;
}

interface Change {
  task: string;
  baseline: number;
  current: number;
  delta: number;
  severity: 'ok' | 'warn' | 'fail';
}

interface RuleResult {
  rule: string;
  baselineSha: string;
  changes: Change[];
}

function parseThroughput(s: string): number {
  const m = s.match(/^([\d_]+)/);
  if (!m) return Number.NaN;
  return Number(m[1].replaceAll('_', ''));
}

function loadMetrics(jsonPath: string): TaskMetrics[] {
  const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Array<
    Record<string, unknown>
  >;
  return data.map((row) => ({
    name: String(row['Task name']),
    throughput: parseThroughput(String(row['Throughput avg (ops/s)'])),
  }));
}

function findBaseline(dir: string, currentSha: string): string | null {
  // Prefer the canonical baseline.json (committed via .gitignore !-rule).
  // Fall back to most-recent <sha>.json for local iteration when the
  // baseline hasn't been promoted yet.
  const canonical = join(dir, 'baseline.json');
  if (existsSync(canonical)) return canonical;
  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== `${currentSha}.json`)
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function runBench(ruleName: string): boolean {
  const benchPath = join(BENCH_DIR, ruleName, 'bench.ts');
  console.log(`[perf:check] running benchmarks for ${ruleName}...`);
  try {
    execSync(`tsx ${benchPath}`, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error(`[perf:check] ${ruleName} bench failed: ${(err as Error).message}`);
    return false;
  }
}

const currentSha = execSync('git rev-parse --short HEAD', { cwd: ROOT })
  .toString()
  .trim();

const ruleDirs = readdirSync(BENCH_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const results: RuleResult[] = [];
const skipped: string[] = [];

for (const ruleName of ruleDirs) {
  const ruleDir = join(BENCH_DIR, ruleName);
  const benchPath = join(ruleDir, 'bench.ts');
  if (!existsSync(benchPath)) {
    skipped.push(`${ruleName}: no bench.ts`);
    continue;
  }

  const baselinePath = findBaseline(ruleDir, currentSha);
  if (!baselinePath) {
    if (!runBench(ruleName)) skipped.push(`${ruleName}: bench failed`);
    else skipped.push(`${ruleName}: no committed baseline (first run)`);
    continue;
  }

  if (!runBench(ruleName)) {
    skipped.push(`${ruleName}: bench failed during regression check`);
    continue;
  }

  const currentJson = join(ruleDir, `${currentSha}.json`);
  if (!existsSync(currentJson)) {
    skipped.push(`${ruleName}: bench did not emit ${currentSha}.json`);
    continue;
  }

  const baselineSha = baselinePath
    .split('/')
    .pop()!
    .replace('.json', '');
  const baselineMetrics = loadMetrics(baselinePath);
  const currentMetrics = loadMetrics(currentJson);

  const changes: Change[] = [];
  for (const cur of currentMetrics) {
    const base = baselineMetrics.find((b) => b.name === cur.name);
    if (!base || Number.isNaN(base.throughput) || Number.isNaN(cur.throughput)) {
      continue;
    }
    const delta = (cur.throughput - base.throughput) / base.throughput;
    let severity: Change['severity'] = 'ok';
    if (delta < -FAIL_THRESHOLD) severity = 'fail';
    else if (delta < -WARN_THRESHOLD) severity = 'warn';
    changes.push({
      task: cur.name,
      baseline: base.throughput,
      current: cur.throughput,
      delta,
      severity,
    });
  }

  results.push({ rule: ruleName, baselineSha, changes });
}

let totalOk = 0;
let totalWarn = 0;
let totalFail = 0;

for (const r of results) {
  console.log(`\n=== ${r.rule} (vs ${r.baselineSha}) ===`);
  for (const c of r.changes) {
    const pct = (c.delta * 100).toFixed(2);
    const arrow = c.delta >= 0 ? '+' : '';
    const tag = { ok: '  ', warn: 'WARN', fail: 'FAIL' }[c.severity];
    console.log(`  [${tag}] ${c.task}`);
    console.log(
      `         baseline ${c.baseline.toLocaleString('en-US')} ops/s → current ${c.current.toLocaleString('en-US')} ops/s  (${arrow}${pct}%)`,
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
  `\n[perf:check] Summary: ${totalOk} ok, ${totalWarn} warn, ${totalFail} fail`,
);

if (totalFail > 0) {
  console.error(
    `\n[perf:check] FAIL: ${totalFail} task${totalFail === 1 ? '' : 's'} regressed by ≥${FAIL_THRESHOLD * 100}% throughput. Exit 1.`,
  );
  process.exit(1);
}

if (totalWarn > 0) {
  console.warn(
    `[perf:check] ${totalWarn} task${totalWarn === 1 ? '' : 's'} slowed ${WARN_THRESHOLD * 100}-${FAIL_THRESHOLD * 100}% (warning, no fail).`,
  );
}
