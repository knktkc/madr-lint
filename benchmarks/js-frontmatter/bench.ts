import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Bench } from 'tinybench';
import { parseFile } from '../../src/core/parser.js';
import { uniqueDocs } from '../unique-content.js';

const fields = `status: 'accepted', date: '2026-01-01', 'decision-makers': ['a', 'b'], consulted: [], informed: []`;
const nextJs = uniqueDocs(`---js\n{ ${fields} }\n---\n\n# Title\n\nBody.\n`);
const nextYaml = uniqueDocs(
  `---\nstatus: accepted\ndate: 2026-01-01\ndecision-makers: [a, b]\nconsulted: []\ninformed: []\n---\n\n# Title\n\nBody.\n`,
);

const bench = new Bench({ time: 500 });
bench
  .add('parseFile — ---js frontmatter', () => {
    parseFile(nextJs());
  })
  .add('parseFile — YAML frontmatter', () => {
    parseFile(nextYaml());
  });

await bench.run();
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
