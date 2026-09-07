import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.js';
import { uniqueDocs } from '../unique-content.js';
import rule from '../../src/rules/required-sections/index.js';

const tiny = readFileSync(new URL('./fixtures/tiny.md', import.meta.url), 'utf8');
const typical = readFileSync(new URL('./fixtures/typical.md', import.meta.url), 'utf8');

// One unique document per iteration, so the parse is really measured — see
// benchmarks/unique-content.ts. The `Consequences` → `Notes` rewrite is
// hoisted out of the loop with it: it always produced the same string, so it
// measured String.replace on top of a memoized parse.
const nextTiny = uniqueDocs(tiny);
const nextTypical = uniqueDocs(typical);
const nextMissing = uniqueDocs(typical.replace('## Consequences', '## Notes'));

const bench = new Bench({ time: 500 });
bench
  .add('madr/required-sections — tiny (all sections)', () => {
    runRule(rule, { content: nextTiny(), path: 'tiny.md' });
  })
  .add('madr/required-sections — typical (all sections + extras)', () => {
    runRule(rule, { content: nextTypical(), path: 'typical.md' });
  })
  .add('madr/required-sections — typical (one missing)', () => {
    runRule(rule, { content: nextMissing(), path: 'typical-missing.md' });
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
