import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import {
  computeContentHash,
  loadManifest,
  manifestPath,
  saveManifest,
  type CacheEntry,
  type CacheManifest,
} from './cache.js';
import {
  buildProjectFile,
  runRulesOnFile,
  runRulesOnProject,
} from './runner.js';

/**
 * Normalize a relative path to POSIX form (forward-slashes). On Windows,
 * `relative()` returns backslash-separated paths, but project rules
 * (e.g. `no-broken-links`) resolve URLs using `posix.normalize`. Mixing
 * separators causes silent false positives — so the orchestrator owns
 * the normalization.
 */
function toPosix(p: string): string {
  if (sep === '/') return p;
  return p.split(sep).join('/');
}
import {
  isProjectRule,
  type AnyRule,
  type Diagnostic,
  type ProjectRule,
  type Rule,
  type RuleSeverity,
  type Severity,
} from './types.js';

export interface CacheConfig {
  /** Directory under which manifest.json is read/written. */
  dir: string;
  /** Stable hash of the resolved config. Mismatch invalidates the cache. */
  configHash: string;
  /** madr-lint package version. Mismatch invalidates the cache. */
  pkgVersion: string;
}

export interface LintOptions {
  /** All available rules (per-file or project). The orchestrator picks
   *  enabled ones via ruleSeverity and dispatches to the right runner. */
  rules: readonly AnyRule[];
  /** User-configured severity per rule name. Missing entry === 'off'. */
  ruleSeverity: Record<string, RuleSeverity>;
  /** Files to lint, absolute or cwd-relative paths. */
  files: readonly string[];
  /** Working directory. Diagnostics' `path` is reported relative to this. */
  cwd: string;
  /**
   * If set, persist per-file diagnostics keyed by content hash to enable
   * fast re-runs of unchanged files. Project (cross-file) rules always
   * re-run regardless of the cache. Pass `null` to disable.
   */
  cache?: CacheConfig | null;
}

export interface LintResult {
  filesChecked: number;
  filesFromCache: number;
  diagnostics: Diagnostic[];
}

/**
 * Lint a list of files against per-file AND project rules.
 *
 * Per-file rules go through `runRulesOnFile` (single-pass AST per file).
 * Project rules go through `runRulesOnProject` (eager parse all files,
 * single check call per rule). See ADR-0005.
 *
 * File contents are read once and shared between both passes.
 */
export function lintFiles(opts: LintOptions): LintResult {
  const allDiagnostics: Diagnostic[] = [];

  // Read all file contents once — shared between per-file and project passes.
  // POSIX-normalize the relative path so cross-platform diagnostics and
  // path-based rules (e.g. no-broken-links) work consistently on Windows.
  const fileEntries = opts.files.map((absolutePath) => ({
    relativePath: toPosix(relative(opts.cwd, absolutePath)),
    content: readFileSync(absolutePath, 'utf8'),
  }));

  // Partition rules by kind.
  const perFileRules: Rule[] = [];
  const projectRules: ProjectRule[] = [];
  for (const rule of opts.rules) {
    if (isProjectRule(rule)) projectRules.push(rule);
    else perFileRules.push(rule);
  }

  // ── Cache setup ──────────────────────────────────────────────────
  let manifest: CacheManifest | null = null;
  let filesFromCache = 0;
  if (opts.cache) {
    const path = manifestPath(opts.cache.dir);
    const loaded = loadManifest(path);
    if (
      loaded &&
      loaded.version === opts.cache.pkgVersion &&
      loaded.configHash === opts.cache.configHash
    ) {
      manifest = loaded;
    } else {
      manifest = {
        version: opts.cache.pkgVersion,
        configHash: opts.cache.configHash,
        files: {},
      };
    }
  }

  // ── Per-file pass ────────────────────────────────────────────────
  for (const file of fileEntries) {
    if (manifest) {
      const contentHash = computeContentHash(file.content);
      const entry = manifest.files[file.relativePath];
      if (entry && entry.contentHash === contentHash) {
        allDiagnostics.push(...entry.perFileDiagnostics);
        filesFromCache++;
        continue;
      }
      // Cache miss — run rules and store result.
      const fileDiagnostics = runPerFileRulesForFile(
        perFileRules,
        opts.ruleSeverity,
        file,
      );
      allDiagnostics.push(...fileDiagnostics);
      const next: CacheEntry = {
        contentHash,
        perFileDiagnostics: fileDiagnostics,
      };
      manifest.files[file.relativePath] = next;
    } else {
      allDiagnostics.push(
        ...runPerFileRulesForFile(perFileRules, opts.ruleSeverity, file),
      );
    }
  }

  // ── Project pass ─────────────────────────────────────────────────
  const enabledProjectRules = projectRules.filter(
    (rule) => resolveSeverity(opts.ruleSeverity[rule.meta.name]) !== 'off',
  );
  if (enabledProjectRules.length > 0) {
    const projectFiles = fileEntries.map((f) =>
      buildProjectFile({ path: f.relativePath, content: f.content }),
    );

    const errorRules: ProjectRule[] = [];
    const warnRules: ProjectRule[] = [];
    for (const rule of enabledProjectRules) {
      const sev = resolveSeverity(opts.ruleSeverity[rule.meta.name]);
      if (sev === 'error') errorRules.push(rule);
      else if (sev === 'warn') warnRules.push(rule);
    }

    if (errorRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnProject(errorRules, projectFiles, { severity: 'error' }),
      );
    }
    if (warnRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnProject(warnRules, projectFiles, { severity: 'warn' }),
      );
    }
  }

  // ── Persist cache ────────────────────────────────────────────────
  if (manifest && opts.cache) {
    saveManifest(manifestPath(opts.cache.dir), manifest);
  }

  return {
    filesChecked: opts.files.length,
    filesFromCache,
    diagnostics: allDiagnostics,
  };
}

function runPerFileRulesForFile(
  perFileRules: readonly Rule[],
  ruleSeverity: Record<string, RuleSeverity>,
  file: { relativePath: string; content: string },
): Diagnostic[] {
  const fileContext = {
    content: file.content,
    path: file.relativePath,
  };

  const errorRules: Rule[] = [];
  const warnRules: Rule[] = [];
  for (const rule of perFileRules) {
    const sev = resolveSeverity(ruleSeverity[rule.meta.name]);
    if (sev === 'off') continue;
    if (sev === 'error') errorRules.push(rule);
    else warnRules.push(rule);
  }

  const diagnostics: Diagnostic[] = [];
  if (errorRules.length > 0) {
    diagnostics.push(
      ...runRulesOnFile(errorRules, fileContext, { severity: 'error' }),
    );
  }
  if (warnRules.length > 0) {
    diagnostics.push(
      ...runRulesOnFile(warnRules, fileContext, { severity: 'warn' }),
    );
  }
  return diagnostics;
}

function resolveSeverity(config: RuleSeverity | undefined): Severity | 'off' {
  if (config === undefined) return 'off';
  if (typeof config === 'string') return config;
  return config[0];
}
