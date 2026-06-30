import { describe, it, expect } from 'vitest';
import {
  classifyDelta,
  compareRule,
  metricsFromRows,
  parseThroughput,
  type TaskMetrics,
} from '../../scripts/perf-compare.js';

describe('perf-compare/parseThroughput', () => {
  it('parses a tinybench throughput cell', () => {
    expect(parseThroughput('219079 ± 0.04%')).toBe(219079);
  });

  it('strips underscore digit separators', () => {
    expect(parseThroughput('1_234_567 ± 1%')).toBe(1234567);
  });

  it('returns NaN for an unparseable cell', () => {
    expect(Number.isNaN(parseThroughput('n/a'))).toBe(true);
  });
});

describe('perf-compare/metricsFromRows', () => {
  it('maps tinybench table rows to {name, throughput}', () => {
    const rows = [
      { 'Task name': 'rule — tiny', 'Throughput avg (ops/s)': '50000 ± 0.1%' },
      { 'Task name': 'rule — big', 'Throughput avg (ops/s)': '2000 ± 0.5%' },
    ];
    expect(metricsFromRows(rows)).toEqual([
      { name: 'rule — tiny', throughput: 50000 },
      { name: 'rule — big', throughput: 2000 },
    ]);
  });
});

describe('perf-compare/classifyDelta', () => {
  const FAIL = 0.1;
  const WARN = 0.05;

  it('flags a >=10% slowdown as fail', () => {
    expect(classifyDelta(-0.2, FAIL, WARN)).toBe('fail');
  });

  it('flags a 5-10% slowdown as warn', () => {
    expect(classifyDelta(-0.07, FAIL, WARN)).toBe('warn');
  });

  it('treats a speedup as ok', () => {
    expect(classifyDelta(0.25, FAIL, WARN)).toBe('ok');
  });

  it('treats a tiny slowdown under warn as ok', () => {
    expect(classifyDelta(-0.02, FAIL, WARN)).toBe('ok');
  });

  it('exactly -10% is not a fail (boundary is strict <)', () => {
    expect(classifyDelta(-0.1, FAIL, WARN)).toBe('warn');
  });

  it('exactly -5% is not a warn (boundary is strict <)', () => {
    expect(classifyDelta(-0.05, FAIL, WARN)).toBe('ok');
  });
});

describe('perf-compare/compareRule', () => {
  const FAIL = 0.1;
  const WARN = 0.05;

  it('reports a regression when head is slower than base', () => {
    const base: TaskMetrics[] = [{ name: 't', throughput: 1000 }];
    const head: TaskMetrics[] = [{ name: 't', throughput: 800 }]; // -20%
    const changes = compareRule(head, base, FAIL, WARN);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      task: 't',
      base: 1000,
      head: 800,
      severity: 'fail',
    });
    expect(changes[0]?.delta).toBeCloseTo(-0.2, 5);
  });

  it('reports ok when head is faster (machine noise upward)', () => {
    const base: TaskMetrics[] = [{ name: 't', throughput: 1000 }];
    const head: TaskMetrics[] = [{ name: 't', throughput: 1300 }];
    expect(compareRule(head, base, FAIL, WARN)[0]?.severity).toBe('ok');
  });

  it('skips a head task with no matching base task (new benchmark)', () => {
    const base: TaskMetrics[] = [{ name: 'old', throughput: 1000 }];
    const head: TaskMetrics[] = [{ name: 'brand-new', throughput: 500 }];
    expect(compareRule(head, base, FAIL, WARN)).toEqual([]);
  });

  it('skips tasks with NaN throughput on either side', () => {
    const base: TaskMetrics[] = [{ name: 't', throughput: Number.NaN }];
    const head: TaskMetrics[] = [{ name: 't', throughput: 800 }];
    expect(compareRule(head, base, FAIL, WARN)).toEqual([]);
  });
});
