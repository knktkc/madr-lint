import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.js';
import rule from '../../src/rules/required-sections/index.js';

const tiny = readFileSync(new URL('./fixtures/tiny.md', import.meta.url), 'utf8');
const typical = readFileSync(new URL('./fixtures/typical.md', import.meta.url), 'utf8');

const bench = new Bench({ time: 500 });
bench
  .add('madr/required-sections — tiny (all sections)', () => {
    runRule(rule, { content: tiny, path: 'tiny.md' });
  })
  .add('madr/required-sections — typical (all sections + extras)', () => {
    runRule(rule, { content: typical, path: 'typical.md' });
  })
  .add('madr/required-sections — typical (one missing)', () => {
    runRule(rule, {
      content: typical.replace('## Consequences', '## Notes'),
      path: 'typical-missing.md',
    });
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
