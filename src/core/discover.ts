import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolves a target path to a list of `.md` files to lint.
 *
 * - If the target is a directory: recursively walks it and returns every `.md`
 *   file, sorted lexicographically.
 * - If the target is a `.md` file: returns just that file.
 * - If the target is a non-`.md` file or does not exist: returns `[]`.
 *
 * The empty-array fallback lets the CLI print "No .md files found" rather
 * than crashing — the caller decides whether that is an error.
 */
export function findAdrFiles(target: string): string[] {
  if (!existsSync(target)) return [];

  const stat = statSync(target);
  if (stat.isFile()) {
    return target.endsWith('.md') ? [target] : [];
  }
  if (!stat.isDirectory()) return [];

  const entries = readdirSync(target, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(e.parentPath, e.name))
    .toSorted();
}
