import { basename } from 'node:path';
import picomatch from 'picomatch';

/**
 * Should the given relative path be excluded from linting?
 *
 * Patterns are tested in three forms (any match wins):
 * - **Full glob via picomatch** against the relative POSIX path:
 *   `docs/**\/draft-*.md`, `**\/template.md`, `9999-*.md`
 * - Full glob via picomatch against the file's basename, so patterns
 *   like `README.md` or `9999-*` work without a `**\/` prefix.
 * - Exact relative-path match (defensive — picomatch with default
 *   options also handles this, but we keep the explicit branch for
 *   clarity and to avoid surprises if picomatch ever changes default
 *   `dot`/`bash` semantics).
 *
 * Picomatch is invoked with `{ dot: true }` so dotfiles (rare for ADRs
 * but possible — e.g. `.archived/*.md`) are matched naturally.
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
  if (relativePath === pattern) return true;
  const matcher = picomatch(pattern, { dot: true });
  if (matcher(relativePath)) return true;
  if (matcher(base)) return true;
  // Back-compat shortcut: a pattern like `adr/template.md` (sub-path
  // without leading `**/`) should match `docs/adr/template.md`. Also
  // handles `adr/9999-*` against `docs/adr/9999-x.md` via picomatch
  // applied to the suffix.
  if (pattern.includes('/') && !pattern.startsWith('**/')) {
    const suffixMatcher = picomatch(`**/${pattern}`, { dot: true });
    if (suffixMatcher(relativePath)) return true;
  }
  return false;
}
