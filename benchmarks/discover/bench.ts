import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bench } from 'tinybench';
import { findAdrFiles } from '../../src/core/discover.js';

const root = mkdtempSync(join(tmpdir(), 'madr-lint-bench-discover-'));
for (let d = 0; d < 10; d++) {
  const dir = join(root, `group-${d}`);
  mkdirSync(dir);
  for (let f = 0; f < 100; f++) writeFileSync(join(dir, `${1000 + f}-adr.md`), '');
}

const bench = new Bench({ time: 500 });
bench.add('findAdrFiles — 1000 files in 10 directories', () => {
  findAdrFiles(root);
});

await bench.run();
rmSync(root, { recursive: true, force: true });
console.table(bench.table());

const sha = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(
  new URL(`./${sha}.json`, import.meta.url),
  JSON.stringify(bench.table(), null, 2),
);
