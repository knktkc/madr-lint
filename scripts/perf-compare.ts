// Pure comparison helpers for perf-regression-check. Kept free of git / fs /
// child_process so they can be unit-tested in isolation.

export interface TaskMetrics {
  name: string;
  throughput: number;
}

export type Severity = 'ok' | 'warn' | 'fail';

export interface Change {
  task: string;
  /** Base (reference) throughput, ops/s. */
  base: number;
  /** Head (current) throughput, ops/s. */
  head: number;
  /** (head - base) / base. Negative = head is slower = regression. */
  delta: number;
  severity: Severity;
}

/** Parse a tinybench "Throughput avg (ops/s)" cell (e.g. "219079 ± 0.04%"). */
export function parseThroughput(s: string): number {
  const m = s.match(/^([\d_]+)/);
  if (!m) return Number.NaN;
  return Number(m[1].replaceAll('_', ''));
}

/** Map raw tinybench `table()` rows to {name, throughput}. */
export function metricsFromRows(
  rows: Array<Record<string, unknown>>,
): TaskMetrics[] {
  return rows.map((row) => ({
    name: String(row['Task name']),
    throughput: parseThroughput(String(row['Throughput avg (ops/s)'])),
  }));
}

/**
 * Classify a throughput delta. A negative delta means head is slower than
 * base. Boundaries are strict `<` (so exactly -warn/-fail is the milder tier).
 */
export function classifyDelta(
  delta: number,
  failThreshold: number,
  warnThreshold: number,
): Severity {
  if (delta < -failThreshold) return 'fail';
  if (delta < -warnThreshold) return 'warn';
  return 'ok';
}

/**
 * Compare head vs base metrics for one rule. Tasks present in head but not in
 * base (new benchmarks), or with NaN throughput on either side, are skipped.
 */
export function compareRule(
  head: TaskMetrics[],
  base: TaskMetrics[],
  failThreshold: number,
  warnThreshold: number,
): Change[] {
  const changes: Change[] = [];
  for (const cur of head) {
    const ref = base.find((b) => b.name === cur.name);
    if (!ref || Number.isNaN(ref.throughput) || Number.isNaN(cur.throughput)) {
      continue;
    }
    const delta = (cur.throughput - ref.throughput) / ref.throughput;
    changes.push({
      task: cur.name,
      base: ref.throughput,
      head: cur.throughput,
      delta,
      severity: classifyDelta(delta, failThreshold, warnThreshold),
    });
  }
  return changes;
}
