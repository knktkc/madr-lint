import { readFileSync } from 'node:fs';
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
