import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG_FILES } from './config.js';
import { parseFile, type ParsedFile } from './parser.js';
import type { MadrVersion } from './types.js';

/** Docs quickstart, surfaced in the init epilogue and --json payload. */
export const GETTING_STARTED_URL =
  'https://knktkc.github.io/madr-lint/guides/getting-started/';

/**
 * ADR directory candidates, scanned in priority order. A candidate qualifies
 * when its top level contains at least one `NNNN-*.md` file.
 */
export const ADR_DIR_CANDIDATES = [
  'docs/adr',
  'docs/decisions',
  'doc/adr',
  'adr',
  'docs/architecture/decisions',
];

/** Filenames shaped like an ADR: four digits, a hyphen, `.md`. */
const ADR_FILE_PATTERN = /^\d{4}-.*\.md$/;

/** How the ADR directory ended up in the config. */
export type AdrDirSource = 'detected' | 'fallback' | 'override';

export interface AdrDirDetection {
  adrDir: string;
  source: 'detected' | 'fallback';
}

/**
 * Detect the ADR directory by scanning the candidates (in order) for at
 * least one top-level `NNNN-*.md` file. Falls back to `docs/adr` — the
 * linter's default — when nothing qualifies.
 */
export function detectAdrDir(cwd: string): AdrDirDetection {
  for (const candidate of ADR_DIR_CANDIDATES) {
    let entries: Dirent[];
    try {
      entries = readdirSync(resolve(cwd, candidate), { withFileTypes: true });
    } catch {
      continue; // absent or unreadable — not a candidate
    }
    if (entries.some((e) => e.isFile() && ADR_FILE_PATTERN.test(e.name))) {
      return { adrDir: candidate, source: 'detected' };
    }
  }
  return { adrDir: 'docs/adr', source: 'fallback' };
}

/**
 * Per-file MADR version detection, reusing the parser's metadata bridge
 * (ADR-0006): YAML frontmatter means v3/v4 — v4 when the v4-renamed
 * `decision-makers` key is present, v3 otherwise; a v2 body-list metadata
 * block means v2. A file with neither casts no vote.
 */
function detectFileVersion(content: string): MadrVersion | null {
  let parsed: ParsedFile;
  try {
    parsed = parseFile(content);
  } catch {
    return null; // unparseable (e.g. malformed YAML) — no vote
  }
  if (parsed.frontmatter) {
    return 'decision-makers' in parsed.frontmatter ? 'v4' : 'v3';
  }
  if (parsed.listMetadata) return 'v2';
  return null;
}

/**
 * Detect the dominant MADR version of an ADR directory by sampling up to 20
 * `NNNN-*.md` files (lexicographically first, for determinism) and letting
 * the majority win. An empty directory, no recognizable metadata, or an
 * exact tie yields `'auto'` — the config default, safe for mixed vintages.
 */
export function detectMadrVersion(
  cwd: string,
  adrDir: string,
): MadrVersion | 'auto' {
  const dir = resolve(cwd, adrDir);
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 'auto';
  }

  const sample = entries
    .filter((e) => e.isFile() && ADR_FILE_PATTERN.test(e.name))
    .map((e) => e.name)
    .toSorted()
    .slice(0, 20);

  const votes: Record<MadrVersion, number> = { v2: 0, v3: 0, v4: 0 };
  for (const name of sample) {
    let content: string;
    try {
      content = readFileSync(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    const version = detectFileVersion(content);
    if (version) votes[version]++;
  }

  const max = Math.max(votes.v2, votes.v3, votes.v4);
  if (max === 0) return 'auto';
  const winners = (['v2', 'v3', 'v4'] as const).filter(
    (v) => votes[v] === max,
  );
  return winners.length === 1 ? winners[0] : 'auto';
}

/** Which config file format to scaffold. */
export type ConfigFormat = 'ts' | 'json';

/** Canonical config filename per scaffolded format. */
export const CONFIG_FILENAME_BY_FORMAT: Record<ConfigFormat, string> = {
  ts: 'madr-lint.config.ts',
  json: '.madrlintrc.json',
};

/**
 * Pick the config format: TypeScript when the project looks TS-ish
 * (a `tsconfig.json`, or `typescript` among package.json dependencies /
 * devDependencies), JSON otherwise. A missing or malformed package.json
 * never throws — it just means "not TS-ish".
 */
export function detectConfigFormat(cwd: string): ConfigFormat {
  if (existsSync(resolve(cwd, 'tsconfig.json'))) return 'ts';
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(cwd, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    if (
      pkg.dependencies?.['typescript'] !== undefined ||
      pkg.devDependencies?.['typescript'] !== undefined
    ) {
      return 'ts';
    }
  } catch {
    // absent or malformed package.json — fall through to json
  }
  return 'json';
}

/**
 * First existing config file in `cwd`, in the loader's CONFIG_FILES
 * resolution order, or null when the project has none. Used by `init` to
 * refuse clobbering an existing config without `--force`.
 */
export function findExistingConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILES) {
    if (existsSync(resolve(cwd, name))) return name;
  }
  return null;
}

export interface ConfigRenderOptions {
  adrDir: string;
  madrVersion: MadrVersion | 'auto';
}

/** Escape a value for interpolation into a single-quoted TS string literal. */
function tsQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Render the scaffolded config file content. `madrVersion: 'auto'` is the
 * default, so it is omitted rather than written redundantly.
 */
export function renderConfig(
  format: ConfigFormat,
  options: ConfigRenderOptions,
): string {
  if (format === 'json') {
    const config: Record<string, unknown> = {
      extends: ['madr-lint:recommended'],
      adrDir: options.adrDir,
    };
    if (options.madrVersion !== 'auto') config.madrVersion = options.madrVersion;
    return `${JSON.stringify(config, null, 2)}\n`;
  }

  const versionLine =
    options.madrVersion !== 'auto'
      ? `\n  madrVersion: ${tsQuote(options.madrVersion)},`
      : '';
  return `import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  adrDir: ${tsQuote(options.adrDir)},${versionLine}
});
`;
}

export interface EpilogueInput {
  adrDir: string;
  adrDirSource: AdrDirSource;
  configPath: string;
  /** Files covered by the initial in-process lint (0 = nothing to lint). */
  filesChecked: number;
  errors: number;
  warnings: number;
}

/**
 * Human-readable summary + next steps printed by `madr-lint init`. When the
 * initial lint of the detected directory found violations, it points at
 * `--update-baseline` so legacy debt does not block adoption.
 */
export function buildEpilogue(input: EpilogueInput): string {
  // The fallback note may only claim emptiness when the initial lint saw
  // nothing: detection scans candidate top levels, but the lint is recursive,
  // so a nested-only ADR tree is 'fallback' WITH filesChecked > 0 — claiming
  // "created nothing yet" beside real findings would contradict itself.
  const dirNote =
    input.adrDirSource === 'detected'
      ? '(detected)'
      : input.adrDirSource === 'override'
        ? '(from --dir)'
        : input.filesChecked === 0
          ? '(default — no existing ADRs found, so init created nothing yet; add your first ADR here)'
          : '(default — no NNNN-*.md at its top level, though the initial lint found Markdown files nested inside)';

  const lines = [
    `Wrote ${input.configPath}`,
    '',
    `  ADR directory: ${input.adrDir} ${dirNote}`,
    '',
    'Next steps:',
    '  - Lint your ADRs: npx madr-lint',
  ];

  const total = input.errors + input.warnings;
  if (input.filesChecked > 0 && total > 0) {
    lines.push(
      `  - The initial lint found ${input.errors} error(s) and ${input.warnings} warning(s) across ${input.filesChecked} file(s).`,
      '    Adopting on a legacy repo? Snapshot the debt so only new violations fail the build:',
      '      npx madr-lint --update-baseline',
    );
  }

  lines.push(`  - Docs: ${GETTING_STARTED_URL}`);
  return lines.join('\n');
}
