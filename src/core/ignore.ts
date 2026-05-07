import { basename } from 'node:path';

/**
 * Should the given relative path be excluded from linting?
 *
 * Patterns supported in v0.1 (intentionally simple):
 * - Exact basename match: `README.md` matches `docs/adr/README.md`
 * - Exact relative-path match: `docs/adr/draft.md` matches itself
 * - Path suffix match: any pattern matches when relativePath endsWith `/<pattern>`
 * - Trailing wildcard: `9999-*` matches files whose basename starts with `9999-`
 *
 * Full glob (`**`, `?`, character classes) is deferred to a future
 * minor release with a proper glob library. The Phase 1 form covers
 * the typical cases (README/template ignore, "draft" prefix, etc.).
 */
export function shouldIgnore(
  relativePath: string,
  patterns: readonly string[],
): boolean {
  if (patterns.length === 0) return false;
  const base = basename(relativePath);
  for (const pattern of patterns) {
    if (matchesPattern(relativePath, base, pattern)) return true;
  }
  return false;
}

function matchesPattern(
  relativePath: string,
  base: string,
  pattern: string,
): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return base.startsWith(prefix);
  }
  if (base === pattern) return true;
  if (relativePath === pattern) return true;
  if (relativePath.endsWith(`/${pattern}`)) return true;
  return false;
}
