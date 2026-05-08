#!/usr/bin/env tsx
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import safeRegex from 'safe-regex2';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULES_DIR = join(ROOT, 'src/rules');
const SRC_DIR = join(ROOT, 'src');
const LIMIT = 25;

interface Finding {
  label: string;
  pattern: string;
  reason: string;
}

const findings: Finding[] = [];
let scanned = 0;

function check(label: string, pattern: string): void {
  scanned++;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    findings.push({
      label,
      pattern,
      reason: `invalid regex: ${(err as Error).message}`,
    });
    return;
  }
  if (!safeRegex(regex, { limit: LIMIT })) {
    findings.push({ label, pattern, reason: 'unsafe (catastrophic backtracking)' });
  }
}

function walkSchema(
  node: unknown,
  path: readonly string[],
  visit: (p: readonly string[], v: unknown) => void,
): void {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const next = [...path, k];
    visit(next, v);
    if (v && typeof v === 'object') walkSchema(v, next, visit);
  }
}

const ruleDirs = readdirSync(RULES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

for (const name of ruleDirs) {
  const ruleDir = join(RULES_DIR, name);

  // 1) JSON Schema `pattern` fields (would be used to validate
  //    user-supplied option strings via AJV format=regex if declared).
  try {
    const schema = JSON.parse(
      readFileSync(join(ruleDir, 'schema.json'), 'utf8'),
    );
    walkSchema(schema, [], (path, value) => {
      if (path[path.length - 1] === 'pattern' && typeof value === 'string') {
        check(`${name}/schema.json:${path.join('.')}`, value);
      }
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // 2) defaultOptions: import the rule module and recursively scan
  //    every string-typed leaf for regex unsafety. Conservative — we
  //    only flag a string if `safe-regex2` rejects it AS a regex AND
  //    `new RegExp(value)` succeeds. Plain prose strings won't compile
  //    cleanly enough to trigger a false positive in practice.
  try {
    const ruleModule = await import(
      new URL(`../src/rules/${name}/index.ts`, import.meta.url).href
    );
    const meta = ruleModule.default?.meta as
      | { defaultOptions?: Record<string, unknown> }
      | undefined;
    if (meta?.defaultOptions) {
      for (const [k, v] of Object.entries(meta.defaultOptions)) {
        if (typeof v === 'string' && /[\\^$.*+?()[\]{}|]/.test(v)) {
          // Looks regex-shaped — verify safety.
          check(`${name}/defaultOptions.${k}`, v);
        }
      }
    }
  } catch (err) {
    console.warn(
      `[redos] could not import ${name}/index.ts: ${(err as Error).message}`,
    );
  }
}

// 3) Static scan of regex literals embedded in src/**/*.ts.
//    Catches regression where a maintainer adds an unsafe literal
//    (e.g. `/(\w+)+$/`) directly in rule code. Heuristic — handles
//    the common shape `name = /.../flags;` and `/.../.test(...)`.
function scanLiteralsIn(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanLiteralsIn(full);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const source = readFileSync(full, 'utf8');
    // Match regex literal preceded by `=` or `(` (assignment / call arg /
    // .test() etc.). Body excludes whitespace + escapes + char classes.
    const literalRegex = /[=(]\s*\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\n\\])+)\/([gimsuy]*)/g;
    for (const m of source.matchAll(literalRegex)) {
      const pattern = m[1];
      const flags = m[2] ?? '';
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch {
        continue;
      }
      scanned++;
      if (!safeRegex(regex, { limit: LIMIT })) {
        const lineNum = source.slice(0, m.index!).split('\n').length;
        findings.push({
          label: `${full.slice(ROOT.length + 1)}:${lineNum}`,
          pattern: `/${pattern}/${flags}`,
          reason: 'unsafe (catastrophic backtracking)',
        });
      }
    }
  }
}
scanLiteralsIn(SRC_DIR);

if (findings.length > 0) {
  console.error('[redos] Found unsafe regex patterns:\n');
  for (const f of findings) {
    console.error(`  ✗ ${f.label}`);
    console.error(`    pattern: ${f.pattern}`);
    console.error(`    reason:  ${f.reason}\n`);
  }
  console.error(
    `[redos] ${findings.length} unsafe / ${scanned} scanned. Exit 1.`,
  );
  process.exit(1);
}

console.log(
  `[redos] ${scanned} regex pattern${scanned === 1 ? '' : 's'} scanned, all safe.`,
);
