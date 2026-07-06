import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  computeContentHash,
  computeConfigHash,
  loadManifest,
  saveManifest,
  manifestPath,
  CACHE_SCHEMA_VERSION,
  type CacheManifest,
} from '../../src/core/cache.js';

describe('core/cache', () => {
  describe('computeContentHash', () => {
    it('produces a deterministic 40-char sha1 hex digest', () => {
      const h = computeContentHash('# Hello\n');
      expect(h).toMatch(/^[a-f0-9]{40}$/);
      expect(computeContentHash('# Hello\n')).toBe(h);
    });

    it('different content yields different hash', () => {
      expect(computeContentHash('a')).not.toBe(computeContentHash('b'));
    });
  });

  describe('computeConfigHash', () => {
    it('is stable across key insertion order', () => {
      const a = computeConfigHash({ a: 1, b: 2 });
      const b = computeConfigHash({ b: 2, a: 1 });
      expect(a).toBe(b);
    });

    it('changes when a value changes', () => {
      const a = computeConfigHash({ rules: { foo: 'error' } });
      const b = computeConfigHash({ rules: { foo: 'warn' } });
      expect(a).not.toBe(b);
    });

    it('handles nested objects and arrays', () => {
      const a = computeConfigHash({
        rules: { foo: ['error', { x: 1, y: [2, 3] }] },
      });
      const b = computeConfigHash({
        rules: { foo: ['error', { y: [2, 3], x: 1 }] },
      });
      expect(a).toBe(b);
    });
  });

  describe('manifest IO', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'madr-lint-cache-'));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it('returns null when manifest does not exist', () => {
      expect(loadManifest(manifestPath(tmp))).toBeNull();
    });

    it('round-trips a manifest unchanged', () => {
      const path = manifestPath(tmp);
      const m: CacheManifest = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        version: '0.1.0-alpha.0',
        configHash: 'abc123',
        files: {
          'docs/adr/0001-x.md': {
            contentHash: 'deadbeef',
            perFileDiagnostics: [
              {
                ruleName: 'madr/required-sections',
                messageId: 'missingSection',
                severity: 'error',
                path: 'docs/adr/0001-x.md',
                data: { section: 'Context' },
                suggestion: 'add a "## Context" heading to the document body',
                docsUrl: 'https://knktkc.github.io/madr-lint/rules/required-sections/',
              },
            ],
          },
        },
      };
      saveManifest(path, m);
      expect(loadManifest(path)).toEqual(m);
    });

    it('returns null when the manifest file is malformed JSON', () => {
      const path = manifestPath(tmp);
      saveManifest(path, {
        schemaVersion: CACHE_SCHEMA_VERSION,
        version: '1',
        configHash: 'h',
        files: {},
      });
      writeFileSync(path, 'not json', 'utf8');
      expect(loadManifest(path)).toBeNull();
    });

    it('returns null when the manifest is missing required fields', () => {
      const path = manifestPath(tmp);
      writeFileSync(path, JSON.stringify({ version: 'x' }), 'utf8');
      expect(loadManifest(path)).toBeNull();
    });

    it('creates the cache directory if it does not exist', () => {
      const nested = join(tmp, 'a', 'b', 'c');
      const path = manifestPath(nested);
      const m: CacheManifest = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        version: '1',
        configHash: 'h',
        files: {},
      };
      saveManifest(path, m);
      expect(loadManifest(path)).toEqual(m);
    });
  });

  // Self-contained diagnostics (#67) changed the CACHED Diagnostic shape:
  // entries written by an older madr-lint at the SAME pkgVersion would be
  // served verbatim and silently drop the new suggestion/docsUrl keys from
  // json/API output. The manifest therefore carries a schema version; any
  // mismatch (including the field being absent in pre-schema manifests) is
  // treated exactly like a pkgVersion mismatch — cold.
  describe('schema version invalidation', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'madr-lint-cache-schema-'));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it('returns null for a pre-schema manifest (no schemaVersion field)', () => {
      const path = manifestPath(tmp);
      writeFileSync(
        path,
        JSON.stringify({ version: '1', configHash: 'h', files: {} }),
        'utf8',
      );
      expect(loadManifest(path)).toBeNull();
    });

    it('returns null for a manifest with an older schemaVersion', () => {
      const path = manifestPath(tmp);
      writeFileSync(
        path,
        JSON.stringify({ schemaVersion: 1, version: '1', configHash: 'h', files: {} }),
        'utf8',
      );
      expect(loadManifest(path)).toBeNull();
    });

    it('accepts a manifest with the current schemaVersion', () => {
      const path = manifestPath(tmp);
      const m: CacheManifest = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        version: '1',
        configHash: 'h',
        files: {},
      };
      saveManifest(path, m);
      expect(loadManifest(path)).toEqual(m);
    });
  });
});
