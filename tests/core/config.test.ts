import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveExtends } from '../../src/core/config.js';

describe('core/config', () => {
  describe('resolveExtends (pure)', () => {
    it('returns defaults when config is empty', () => {
      const config = resolveExtends({});
      expect(config.adrDir).toBe('docs/adr');
      expect(config.madrVersion).toBe('auto');
      expect(config.rules).toEqual({});
      expect(config.ignorePatterns).toEqual([]);
    });

    it('extends madr-lint:recommended', () => {
      const config = resolveExtends({ extends: ['madr-lint:recommended'] });
      expect(config.rules['madr/filename-format']).toBe('error');
      expect(config.rules['madr/required-sections']).toBe('error');
    });

    it('user rules override extended values', () => {
      const config = resolveExtends({
        extends: ['madr-lint:recommended'],
        rules: { 'madr/filename-format': 'off' },
      });
      expect(config.rules['madr/filename-format']).toBe('off');
      // other recommended rules remain
      expect(config.rules['madr/required-sections']).toBe('error');
    });

    it('ignores unknown extends entries silently', () => {
      const config = resolveExtends({ extends: ['unknown-preset'] });
      expect(config.rules).toEqual({});
    });

    it('passes through madrVersion', () => {
      expect(resolveExtends({ madrVersion: 'v4' }).madrVersion).toBe('v4');
    });

    it('passes through ignorePatterns', () => {
      expect(
        resolveExtends({ ignorePatterns: ['template.md'] }).ignorePatterns,
      ).toEqual(['template.md']);
    });
  });

  describe('loadConfig (file I/O)', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'madr-lint-config-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('returns defaults when no config file exists', () => {
      const config = loadConfig(dir);
      expect(config.adrDir).toBe('docs/adr');
    });

    it('parses .madrlintrc.json', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ adrDir: 'custom', extends: ['madr-lint:recommended'] }),
      );
      const config = loadConfig(dir);
      expect(config.adrDir).toBe('custom');
      expect(config.rules['madr/filename-format']).toBe('error');
    });

    it('throws on invalid JSON', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), '{ not valid json');
      expect(() => loadConfig(dir)).toThrow();
    });
  });
});
