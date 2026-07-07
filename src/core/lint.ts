import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { applyBaseline, type Baseline } from './baseline.js';
import {
  computeContentHash,
  loadManifest,
  manifestPath,
  saveManifest,
  CACHE_SCHEMA_VERSION,
  type CacheEntry,
  type CacheManifest,
} from './cache.js';
import { fixFileContent } from './fix.js';
import {
  buildProjectFile,
  runRulesOnFile,
  runRulesOnProject,
} from './runner.js';
import {
  collectDirectives,
  isSuppressed,
  DIRECTIVE_PREFIX,
  type DirectiveIndex,
} from './suppression.js';

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
  INTERNAL_ERROR_RULE_NAME,
  isProjectRule,
  type AnyRule,
  type Diagnostic,
  type ProjectFile,
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
  /**
   * Parsed baseline to subtract, or null/undefined to disable. Subtraction
   * runs AFTER inline-suppression filtering and is NEVER written to the cache
   * (the cache keeps pre-baseline diagnostics, so editing or deleting the
   * baseline file takes effect without cache invalidation). See ADR-0007.
   */
  baseline?: Baseline | null;
}

export interface LintResult {
  filesChecked: number;
  filesFromCache: number;
  diagnostics: Diagnostic[];
  /** How many diagnostics the baseline absorbed (0 when no baseline). */
  baselineHidden: number;
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
        schemaVersion: CACHE_SCHEMA_VERSION,
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
    allDiagnostics.push(
      ...runProjectPass(
        projectFiles,
        enabledProjectRules,
        opts.ruleSeverity,
        optionsByRule,
        opts.cwd,
      ),
    );
  }

  // ── Persist cache ────────────────────────────────────────────────
  // Cache the PRE-baseline diagnostics: subtraction happens below, after the
  // save, so the on-disk cache is independent of the baseline file.
  if (manifest && opts.cache) {
    saveManifest(manifestPath(opts.cache.dir), manifest);
  }

  // ── Baseline subtraction ─────────────────────────────────────────
  // Zero work when no baseline is provided (the common hot path).
  if (!opts.baseline) {
    return {
      filesChecked: opts.files.length,
      filesFromCache,
      diagnostics: allDiagnostics,
      baselineHidden: 0,
    };
  }
  const applied = applyBaseline(allDiagnostics, opts.baseline);
  return {
    filesChecked: opts.files.length,
    filesFromCache,
    diagnostics: applied.kept,
    baselineHidden: applied.hidden,
  };
}

// ──────────────────────────────────────────────────────────────────
// Autofix orchestration (issue #28). Kept OUT of lintFiles so the linting
// hot path gains no branch. The cache is intentionally not consulted here:
// fixes need live `fix` thunks, which cache-hydrated diagnostics lack, and a
// fixed file re-enters the normal pipeline on the next run with a fresh hash.
// ──────────────────────────────────────────────────────────────────

export interface FixedFile {
  /** POSIX relative path (diagnostics + diff header). */
  path: string;
  /** Absolute path (for writing). */
  absPath: string;
  /** Original on-disk content. */
  original: string;
  /** Content after the fixpoint loop. */
  fixed: string;
  /** Whether `fixed` differs from `original`. */
  changed: boolean;
}

export interface LintAndFixResult {
  files: FixedFile[];
  /** Remaining diagnostics on the FIXED contents (per-file + project). */
  diagnostics: Diagnostic[];
  /** Count of edits applied across every file/pass. */
  fixed: number;
  /** Diagnostics the baseline absorbed on the final contents. */
  baselineHidden: number;
}

export interface LintAndFixOptions {
  rules: readonly AnyRule[];
  ruleSeverity: Record<string, RuleSeverity>;
  files: readonly string[];
  cwd: string;
  baseline?: Baseline | null;
  /** Fixpoint pass cap; defaults to the applier's MAX_FIX_PASSES. */
  maxPasses?: number;
}

/**
 * Lint AND autofix: run the per-file fixpoint on every file (fixes are
 * collected from REPORTED diagnostics only — suppression + baseline already
 * subtracted, so suppressed/baselined problems are never rewritten), then run
 * the project pass on the FIXED contents for the final diagnostic set. Files
 * are returned with their fixed content; the caller writes them (or prints a
 * diff for a dry run). Per-file only — project-rule fixes are #29.
 */
export function lintAndFix(opts: LintAndFixOptions): LintAndFixResult {
  const perFileRules: Rule[] = [];
  const projectRules: ProjectRule[] = [];
  for (const rule of opts.rules) {
    if (isProjectRule(rule)) projectRules.push(rule);
    else perFileRules.push(rule);
  }
  const optionsByRule = extractOptionsByRule(opts.ruleSeverity);
  const baseline = opts.baseline ?? null;

  const files: FixedFile[] = [];
  const remaining: Diagnostic[] = [];
  let fixed = 0;
  let baselineHidden = 0;

  for (const absPath of opts.files) {
    const relativePath = toPosix(relative(opts.cwd, absPath));
    const original = readFileSync(absPath, 'utf8');

    // `lint` returns the REPORTED (post-suppression, post-baseline) diagnostics
    // for the given content, carrying live fix thunks. `lastHidden` tracks the
    // final pass's baseline absorption for the summary.
    let lastHidden = 0;
    const lint = (content: string): Diagnostic[] => {
      const raw = runPerFileRulesForFile(
        perFileRules,
        opts.ruleSeverity,
        optionsByRule,
        { relativePath, content },
      );
      if (!baseline) {
        lastHidden = 0;
        return raw;
      }
      const sub = applyBaseline(raw, baseline);
      lastHidden = sub.hidden;
      return sub.kept;
    };

    const res = fixFileContent(original, lint, opts.maxPasses);
    files.push({
      path: relativePath,
      absPath,
      original,
      fixed: res.fixedContent,
      changed: res.changed,
    });
    remaining.push(...res.remaining);
    fixed += res.applied;
    baselineHidden += lastHidden;
  }

  // Project pass on the FIXED contents.
  const enabledProjectRules = projectRules.filter(
    (rule) => resolveSeverity(opts.ruleSeverity[rule.meta.name]) !== 'off',
  );
  if (enabledProjectRules.length > 0) {
    const projectFiles = files.map((f) =>
      buildProjectFile({ path: f.path, content: f.fixed }),
    );
    let projectDiags = runProjectPass(
      projectFiles,
      enabledProjectRules,
      opts.ruleSeverity,
      optionsByRule,
      opts.cwd,
    );
    if (baseline) {
      const sub = applyBaseline(projectDiags, baseline);
      projectDiags = sub.kept;
      baselineHidden += sub.hidden;
    }
    remaining.push(...projectDiags);
  }

  return { files, diagnostics: remaining, fixed, baselineHidden };
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

/**
 * Build the `fileExists` predicate exposed to project rules. Does a path exist
 * as a regular file WITHIN the project root? Lets project rules verify link
 * targets not in the linted .md set (non-Markdown assets, files outside the
 * scanned paths). Contract:
 *   - a target that resolves at or above the root escapes the project →
 *     false (path traversal cannot reach above the root);
 *   - directories are not files → false (a link must point at a file);
 *   - results are memoized per lint run (repeated targets cost one stat).
 * The containment test compares the resolved absolute path to the root rather
 * than a lexical prefix on `resolvedPath`, which may be un-normalized (e.g. a
 * `/`-rooted link resolving to `foo/../../x`). NOTE: statSync follows symlinks,
 * so a symlink that lives inside the root but points outside it is accepted —
 * it is a real entry in the project tree. `resolvedPath` is POSIX; node's
 * path.resolve accepts forward slashes on all platforms.
 */
function makeFileExists(cwd: string): (resolvedPath: string) => boolean {
  const projectRoot = resolve(cwd);
  const existsCache = new Map<string, boolean>();
  return (resolvedPath: string): boolean => {
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
}

/**
 * Run enabled project rules over the given (already-built) project files and
 * return suppression-filtered, PRE-baseline diagnostics. Shared by `lintFiles`
 * (files as read) and `lintAndFix` (files after autofix). Baseline subtraction
 * is the caller's job.
 */
function runProjectPass(
  projectFiles: readonly ProjectFile[],
  enabledProjectRules: readonly ProjectRule[],
  ruleSeverity: Record<string, RuleSeverity>,
  optionsByRule: Record<string, Record<string, unknown>>,
  cwd: string,
): Diagnostic[] {
  const fileExists = makeFileExists(cwd);
  const errorRules: ProjectRule[] = [];
  const warnRules: ProjectRule[] = [];
  for (const rule of enabledProjectRules) {
    const sev = resolveSeverity(ruleSeverity[rule.meta.name]);
    if (sev === 'error') errorRules.push(rule);
    else if (sev === 'warn') warnRules.push(rule);
  }

  const projectDiagnostics: Diagnostic[] = [];
  if (errorRules.length > 0) {
    projectDiagnostics.push(
      ...runRulesOnProject(errorRules, projectFiles, {
        severity: 'error',
        fileExists,
        optionsByRule,
      }),
    );
  }
  if (warnRules.length > 0) {
    projectDiagnostics.push(
      ...runRulesOnProject(warnRules, projectFiles, {
        severity: 'warn',
        fileExists,
        optionsByRule,
      }),
    );
  }

  // Inline suppression for project diagnostics (issue #23): a directive lives
  // in the file the diagnostic is attributed to (project rules report an
  // explicit `path`). File-scoped directives (disable-file, or an open-ended
  // disable) suppress line-less project diagnostics; line-scoped directives
  // apply when the diagnostic carries a line.
  return filterSuppressedProjectDiagnostics(projectDiagnostics, projectFiles);
}

/**
 * Filter suppressed project-rule diagnostics. Each diagnostic is matched
 * against the directives of the file it is attributed to (by `path`).
 * Directive indexes are collected lazily and memoized so a file with no
 * suppressed diagnostics is walked at most once. `core/internal-error`
 * diagnostics (and any diagnostic whose path has no source file, e.g. the
 * `<project>` sentinel) are never suppressed.
 */
function filterSuppressedProjectDiagnostics(
  diagnostics: readonly Diagnostic[],
  projectFiles: readonly ProjectFile[],
): Diagnostic[] {
  if (diagnostics.length === 0) return [];

  const fileByPath = new Map(projectFiles.map((f) => [f.path, f]));
  const indexByPath = new Map<string, DirectiveIndex | null>();
  const indexFor = (path: string): DirectiveIndex | null => {
    const cached = indexByPath.get(path);
    if (cached !== undefined) return cached;
    const file = fileByPath.get(path);
    // Unlike the per-file path, no parse can be forced here — project files
    // are eager-parsed by buildProjectFile before rules run. The prefix
    // check just skips the AST walk for directive-free files (same
    // soundness argument: no 'madr-lint-' in content ⇒ no directives).
    const index =
      file && file.content.includes(DIRECTIVE_PREFIX)
        ? collectDirectives(file.ast, file.body)
        : null;
    indexByPath.set(path, index);
    return index;
  };

  return diagnostics.filter((d) => {
    if (d.ruleName === INTERNAL_ERROR_RULE_NAME) return true;
    const index = indexFor(d.path);
    if (!index) return true;
    return !isSuppressed(index, d.ruleName, d.loc?.line);
  });
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
