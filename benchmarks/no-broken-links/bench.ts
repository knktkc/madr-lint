import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/no-broken-links/index.js';
import type { ProjectFile } from '../../src/core/types.js';

// Each file contains a relative link to the next ADR (always valid),
// plus an external link (always skipped) and an anchor (always skipped).
function makeCorpus(count: number): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (let i = 1; i <= count; i++) {
    const num = i.toString().padStart(4, '0');
    const nextNum = ((i % count) + 1).toString().padStart(4, '0');
    const content = [
      '# ADR-' + num,
      '',
      `See [next](./${nextNum}-bench.md) for what comes after.`,
      'External: [example](https://example.com).',
      'Anchor: [top](#header).',
    ].join('\n');
    files.push(buildProjectFile({ path: `${num}-bench.md`, content }));
  }
  return files;
}

const tiny = makeCorpus(10);
const typical = makeCorpus(100);

const bench = new Bench({ time: 500 });
bench
  .add('madr/no-broken-links — 10 files', () => {
    runRulesOnProject([rule], tiny);
  })
  .add('madr/no-broken-links — 100 files', () => {
    runRulesOnProject([rule], typical);
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
