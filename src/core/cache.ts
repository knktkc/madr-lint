import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Diagnostic } from './types.js';

/**
 * Per-file cache entry: the file content's sha1 hash plus the per-file
 * diagnostics that the rule pipeline emitted last time.
 *
 * Note: project (cross-file) diagnostics are NOT cached — they depend on
 * the entire file set and would invalidate on any add/remove/rename.
 */
export interface CacheEntry {
  contentHash: string;
  perFileDiagnostics: Diagnostic[];
}

/**
 * On-disk manifest schema version. Bump whenever the shape of what we CACHE
 * changes — in particular the `Diagnostic` shape inside `perFileDiagnostics`.
 * pkgVersion invalidation only saves npm upgraders; repo devs and
 * same-version CI caches would otherwise be served stale-shape entries
 * verbatim (e.g. diagnostics missing the #67 `suggestion`/`docsUrl` keys,
 * silently dropped from json output). History: 3 = Diagnostic gained the
 * `fixable` boolean (#28); 2 = Diagnostic gained `suggestion` + `docsUrl`
 * (#67); 1 (implicit) = pre-schema manifests, which carry no `schemaVersion`
 * field at all.
 */
export const CACHE_SCHEMA_VERSION = 3;

export interface CacheManifest {
  /** Manifest schema version. Missing or mismatched ⇒ the cache is cold. */
  schemaVersion: number;
  /** madr-lint version when this manifest was written. Mismatch invalidates the cache. */
  version: string;
  /** Stable hash of the resolved config. Mismatch invalidates the cache. */
  configHash: string;
  /** Per-file cached entries, keyed by POSIX-normalized relative path. */
  files: Record<string, CacheEntry>;
}

export function computeContentHash(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex');
}

export function computeConfigHash(config: unknown): string {
  return createHash('sha1').update(stableStringify(config), 'utf8').digest('hex');
}

/**
 * Stable JSON stringify: object keys are sorted so the same logical
 * config always produces the same hash regardless of property insertion
 * order. Cycles are not handled — config objects are tree-shaped.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>).toSorted(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return (
    '{' +
    entries
      .map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v))
      .join(',') +
    '}'
  );
}

export function manifestPath(cacheDir: string): string {
  return join(cacheDir, 'manifest.json');
}

export function loadManifest(path: string): CacheManifest | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<CacheManifest>;
    if (
      // Single invalidation point for schema drift: an unknown (or absent)
      // schema version nulls here, so every consumer sees a cold cache — no
      // scattered re-hydration of stale-shape entries downstream.
      data.schemaVersion !== CACHE_SCHEMA_VERSION ||
      typeof data.version !== 'string' ||
      typeof data.configHash !== 'string' ||
      typeof data.files !== 'object' ||
      data.files === null
    ) {
      return null;
    }
    return data as CacheManifest;
  } catch {
    return null;
  }
}

export function saveManifest(path: string, manifest: CacheManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest), 'utf8');
}
