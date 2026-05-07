import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/no-duplicate-numbering/index.js';
import type { ProjectFile } from '../../src/core/types.js';

// Synthesize a ProjectFile[] corpus of N unique-numbered ADRs.
function makeCorpus(count: number): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (let i = 1; i <= count; i++) {
    const num = i.toString().padStart(4, '0');
    files.push(buildProjectFile({ path: `${num}-bench.md`, content: '# x\n' }));
  }
  return files;
}

const tiny = makeCorpus(10);
const typical = makeCorpus(100);
const large = makeCorpus(1000);

const bench = new Bench({ time: 500 });
bench
  .add('madr/no-duplicate-numbering — 10 files', () => {
    runRulesOnProject([rule], tiny);
  })
  .add('madr/no-duplicate-numbering — 100 files', () => {
    runRulesOnProject([rule], typical);
  })
  .add('madr/no-duplicate-numbering — 1000 files', () => {
    runRulesOnProject([rule], large);
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
