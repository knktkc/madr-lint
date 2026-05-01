import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recursively finds all `.md` files under `adrDir`.
 * Returns absolute paths sorted lexicographically (so `0001-…` precedes `0002-…`).
 * Returns an empty array if the directory does not exist (the caller decides
 * whether that is an error).
 */
export function findAdrFiles(adrDir: string): string[] {
  if (!existsSync(adrDir)) return [];

  const entries = readdirSync(adrDir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(e.parentPath, e.name));

  return files.toSorted();
}
