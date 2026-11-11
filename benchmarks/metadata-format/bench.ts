import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { runRule } from '../../tests/helpers/run-rule.js';
import { uniqueDocs } from '../unique-content.js';
import rule from '../../src/rules/metadata-format/index.js';

const frontmatter = readFileSync(new URL('./fixtures/frontmatter.md', import.meta.url), 'utf8');
const typicalList = readFileSync(new URL('./fixtures/typical-list.md', import.meta.url), 'utf8');

// One unique document per iteration, so the parse is really measured — see
// benchmarks/unique-content.ts.
const nextFrontmatter = uniqueDocs(frontmatter);
const nextTypicalList = uniqueDocs(typicalList);

const bench = new Bench({ time: 500 });
bench
  .add('madr/metadata-format — frontmatter (auto)', () => {
    runRule(rule, { content: nextFrontmatter(), path: '0001-bench.md' }, { madrVersion: 'auto' });
  })
  .add('madr/metadata-format — typical body list (v2)', () => {
    runRule(rule, { content: nextTypicalList(), path: '0001-bench.md' }, { madrVersion: 'v2' });
  })
  .add('madr/metadata-format — typical body list (v4, mismatch)', () => {
    runRule(rule, { content: nextTypicalList(), path: '0001-bench.md' }, { madrVersion: 'v4' });
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
