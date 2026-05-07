import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/no-numbering-gap/index.js';
import type { ProjectFile } from '../../src/core/types.js';

function makeContiguous(count: number): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (let i = 1; i <= count; i++) {
    const num = i.toString().padStart(4, '0');
    files.push(buildProjectFile({ path: `${num}-bench.md`, content: '# x\n' }));
  }
  return files;
}

function makeWithGaps(count: number, gapEvery: number): ProjectFile[] {
  const files: ProjectFile[] = [];
  let n = 1;
  for (let i = 0; i < count; i++) {
    const num = n.toString().padStart(4, '0');
    files.push(buildProjectFile({ path: `${num}-bench.md`, content: '# x\n' }));
    // Skip every `gapEvery`th number to introduce gaps
    n += i % gapEvery === 0 ? 2 : 1;
  }
  return files;
}

const tiny = makeContiguous(10);
const typical = makeContiguous(100);
const gappy = makeWithGaps(100, 5); // ~20 gaps per 100 files

const bench = new Bench({ time: 500 });
bench
  .add('madr/no-numbering-gap — 10 files (contiguous)', () => {
    runRulesOnProject([rule], tiny);
  })
  .add('madr/no-numbering-gap — 100 files (contiguous)', () => {
    runRulesOnProject([rule], typical);
  })
  .add('madr/no-numbering-gap — 100 files (~20 gaps)', () => {
    runRulesOnProject([rule], gappy);
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
