import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

export class SymlinkedPathError extends Error {
  constructor(path: string) {
    super(`Refusing to write through a symbolic link: ${path}`);
    this.name = 'SymlinkedPathError';
  }
}

/** The first link among the parents of `path` below `root`, or null. */
function findLinkedParent(path: string, root: string): string | null {
  const rel = relative(root, dirname(path));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) return null;
    if (stat.isSymbolicLink()) return current;
  }
  return null;
}

/**
 * Whether `path` is a regular file reached without a link below `root`. A link
 * is not a regular file, whatever it targets.
 */
export function isRegularFile(path: string, root: string = dirname(path)): boolean {
  if (findLinkedParent(path, root)) return false;
  return lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

/** Whether `path` is a directory reached without a link below `root`. */
export function isRealDirectory(path: string, root: string): boolean {
  if (findLinkedParent(path, root)) return false;
  return lstatSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * Write `data` to `path` without following a link at `path`, or at any parent
 * below `root`. The rename replaces a link instead of writing to its target.
 * Parents above `root` are the caller's own environment, so they may be links.
 * Races with a process that can already write here are out of scope; this
 * covers links committed to the repository.
 */
export function writeFileReplacingLinks(path: string, data: string, root: string): void {
  const linked = findLinkedParent(path, root);
  if (linked) throw new SymlinkedPathError(linked);
  mkdirSync(dirname(path), { recursive: true });
  const existing = lstatSync(path, { throwIfNoEntry: false });
  const mode = existing?.isFile() ? existing.mode & 0o777 : undefined;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, data, { encoding: 'utf8', flag: 'wx', ...(mode === undefined ? {} : { mode }) });
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
