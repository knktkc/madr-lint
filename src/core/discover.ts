import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export class PathOutsideRootError extends Error {
  constructor(input: string) {
    super(
      `"${input}" is a symbolic link path that resolves outside the working directory. Run from a directory that contains the target, or pass the real path.`,
    );
    this.name = 'PathOutsideRootError';
  }
}

/**
 * Resolves a target path to a list of `.md` files to lint.
 *
 * - If the target is a directory: recursively walks it and returns every `.md`
 *   file, sorted lexicographically. Links found during the walk are skipped. See
 *   ADR-0010.
 * - If the target is a `.md` file: returns just that file. A link counts only
 *   if its target is also named `.md`.
 * - If the target is a non-`.md` file or does not exist: returns `[]`.
 *
 * The empty-array fallback lets the CLI print "No .md files found" rather
 * than crashing — the caller decides whether that is an error.
 */
export function findAdrFiles(target: string): string[] {
  if (!existsSync(target)) return [];

  const stat = statSync(target);
  if (stat.isFile()) {
    return target.endsWith('.md') && realpathSync(target).endsWith('.md')
      ? [target]
      : [];
  }
  if (!stat.isDirectory()) return [];

  // Not `readdirSync({ recursive: true })`: since Node 22.13 it also recurses
  // through directory links, which never ends with two self-referential links.
  const files: string[] = [];
  const pending = [target];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
    }
  }
  return files.toSorted();
}

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

/**
 * `findAdrFiles` for a path from the command line or the config. Throws when a
 * link takes the path outside `root`. A path outside `root` that contains no
 * link stays allowed, since the repository cannot redirect it.
 */
export function findAdrFilesWithinRoot(input: string, root: string): string[] {
  // resolve() would turn an empty path into the whole working directory.
  if (input === '') return [];
  const absolute = resolve(root, input);
  let real: string;
  try {
    real = realpathSync(absolute);
  } catch {
    return findAdrFiles(absolute);
  }
  const realRoot = realpathSync(root);
  const lexical = resolve(realRoot, input);
  if (!isInside(realRoot, real) && relative(lexical, real) !== '') {
    throw new PathOutsideRootError(input);
  }
  return findAdrFiles(absolute);
}
