import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.js';
import rule from '../../src/rules/filename-format/index.js';

const tiny = readFileSync(new URL('./fixtures/tiny.md', import.meta.url), 'utf8');
const typical = readFileSync(new URL('./fixtures/typical.md', import.meta.url), 'utf8');

const bench = new Bench({ time: 500 });
bench
  .add('madr/filename-format — tiny (valid path)', () => {
    runRule(rule, { content: tiny, path: '0001-bench.md' });
  })
  .add('madr/filename-format — typical (valid path)', () => {
    runRule(rule, { content: typical, path: '0001-bench.md' });
  })
  .add('madr/filename-format — invalid path (snake_case)', () => {
    runRule(rule, { content: tiny, path: '0001_invalid.md' });
  });

await bench.run();
console.table(bench.table());

// Emit JSON for bench-rule + perf-regression-check skills to consume.
// We write the same shape `bench.table()` produces — it survives tinybench
// API drift (v6 dropped result.rme/samples in favor of result.latency.*).
const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
