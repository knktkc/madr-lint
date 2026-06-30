import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
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

  // Per-rule options from config tuples (`['error', {...}]`), threaded into
  // both passes so rule options actually take effect (not just defaults).
  const optionsByRule = extractOptionsByRule(opts.ruleSeverity);

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
        optionsByRule,
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
        ...runPerFileRulesForFile(
          perFileRules,
          opts.ruleSeverity,
          optionsByRule,
          file,
        ),
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

    // Does a path exist as a regular file WITHIN the project root? Lets
    // project rules verify link targets that are not in the linted .md set
    // (non-Markdown assets, files outside the scanned paths). Contract:
    //   - a target that resolves at or above the root escapes the project →
    //     false (path traversal cannot reach above the root);
    //   - directories are not files → false (a link must point at a file);
    //   - results are memoized per lint run (repeated targets cost one stat).
    // The containment test compares the resolved absolute path to the root
    // rather than a lexical prefix on `resolvedPath`, which may be
    // un-normalized (e.g. a `/`-rooted link resolving to `foo/../../x`).
    // NOTE: statSync follows symlinks, so a symlink that lives inside the root
    // but points outside it is accepted — it is a real entry in the project
    // tree. `resolvedPath` is POSIX; node's path.resolve accepts forward
    // slashes on all platforms.
    const projectRoot = resolve(opts.cwd);
    const existsCache = new Map<string, boolean>();
    const fileExists = (resolvedPath: string): boolean => {
      const cached = existsCache.get(resolvedPath);
      if (cached !== undefined) return cached;
      const abs = resolve(projectRoot, resolvedPath);
      const rel = relative(projectRoot, abs);
      const escapesRoot =
        rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
      let result: boolean;
      if (escapesRoot) {
        result = false;
      } else {
        try {
          result = statSync(abs, { throwIfNoEntry: false })?.isFile() ?? false;
        } catch {
          // ELOOP / EACCES / invalid path → cannot confirm a regular file.
          result = false;
        }
      }
      existsCache.set(resolvedPath, result);
      return result;
    };

    const errorRules: ProjectRule[] = [];
    const warnRules: ProjectRule[] = [];
    for (const rule of enabledProjectRules) {
      const sev = resolveSeverity(opts.ruleSeverity[rule.meta.name]);
      if (sev === 'error') errorRules.push(rule);
      else if (sev === 'warn') warnRules.push(rule);
    }

    if (errorRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnProject(errorRules, projectFiles, {
          severity: 'error',
          fileExists,
          optionsByRule,
        }),
      );
    }
    if (warnRules.length > 0) {
      allDiagnostics.push(
        ...runRulesOnProject(warnRules, projectFiles, {
          severity: 'warn',
          fileExists,
          optionsByRule,
        }),
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
  optionsByRule: Record<string, Record<string, unknown>>,
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
      ...runRulesOnFile(errorRules, fileContext, {
        severity: 'error',
        optionsByRule,
      }),
    );
  }
  if (warnRules.length > 0) {
    diagnostics.push(
      ...runRulesOnFile(warnRules, fileContext, {
        severity: 'warn',
        optionsByRule,
      }),
    );
  }
  return diagnostics;
}

function resolveSeverity(config: RuleSeverity | undefined): Severity | 'off' {
  if (config === undefined) return 'off';
  if (typeof config === 'string') return config;
  return config[0];
}

/**
 * Build a ruleName → options map from config tuples (`['error', {...}]`).
 * Bare-string severities carry no options and are omitted, so rules without
 * configured options fall back to their `meta.defaultOptions` in the runner.
 */
function extractOptionsByRule(
  ruleSeverity: Record<string, RuleSeverity>,
): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const [name, config] of Object.entries(ruleSeverity)) {
    // Only tuples carry options; guard config[1] so a malformed 1-element
    // `['error']` doesn't put `undefined` into the map.
    if (Array.isArray(config) && config[1]) map[name] = config[1];
  }
  return map;
}
