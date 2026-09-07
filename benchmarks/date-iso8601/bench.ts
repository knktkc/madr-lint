import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.js';
import { uniqueDocs } from '../unique-content.js';
import rule from '../../src/rules/date-iso8601/index.js';

const tiny = readFileSync(new URL('./fixtures/tiny.md', import.meta.url), 'utf8');
const typical = readFileSync(new URL('./fixtures/typical.md', import.meta.url), 'utf8');
const invalid = readFileSync(new URL('./fixtures/invalid.md', import.meta.url), 'utf8');

// One unique document per iteration, so the parse is really measured — see
// benchmarks/unique-content.ts.
const nextTiny = uniqueDocs(tiny);
const nextTypical = uniqueDocs(typical);
const nextInvalid = uniqueDocs(invalid);

const bench = new Bench({ time: 500 });
bench
  .add('madr/date-iso8601 — tiny (valid)', () => {
    runRule(rule, { content: nextTiny(), path: 'tiny.md' });
  })
  .add('madr/date-iso8601 — typical (valid)', () => {
    runRule(rule, { content: nextTypical(), path: 'typical.md' });
  })
  .add('madr/date-iso8601 — invalid date', () => {
    runRule(rule, { content: nextInvalid(), path: 'invalid.md' });
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
