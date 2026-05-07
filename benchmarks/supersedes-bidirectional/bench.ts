import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import rule from '../../src/rules/supersedes-bidirectional/index.js';
import type { ProjectFile } from '../../src/core/types.js';

// Build a corpus where every odd ADR is superseded by the next even one
// (so half the files have superseded-by, half have supersedes).
function makeCorpus(count: number): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (let i = 1; i <= count; i++) {
    const num = i.toString().padStart(4, '0');
    let frontmatter = '';
    if (i % 2 === 1 && i + 1 <= count) {
      const successor = (i + 1).toString().padStart(4, '0');
      frontmatter = `superseded-by: ADR-${successor}`;
    } else if (i % 2 === 0 && i - 1 >= 1) {
      const predecessor = (i - 1).toString().padStart(4, '0');
      frontmatter = `supersedes: ADR-${predecessor}`;
    }
    const content = frontmatter
      ? `---\n${frontmatter}\n---\n\n# x\n`
      : '# x\n';
    files.push(buildProjectFile({ path: `${num}-bench.md`, content }));
  }
  return files;
}

const tiny = makeCorpus(10);
const typical = makeCorpus(100);

const bench = new Bench({ time: 500 });
bench
  .add('madr/supersedes-bidirectional — 10 files', () => {
    runRulesOnProject([rule], tiny);
  })
  .add('madr/supersedes-bidirectional — 100 files', () => {
    runRulesOnProject([rule], typical);
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
