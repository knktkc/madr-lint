import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recommended } from '../../src/configs/recommended.js';
import {
  InvalidConfigError,
  loadConfig,
  loadConfigFromPath,
  resolveExtends,
} from '../../src/core/config.js';
import type { MadrLintConfig } from '../../src/index.js';
import * as builtinRules from '../../src/rules/index.js';

// The exact reproduction from issue #206.
const ISSUE_206_CONFIG = {
  extends: ['madr-lint:recomended'],
  rules: { 'madr/status-enmu': 'error' },
};

// For values a JSON or JS config can hold but the TypeScript type does not allow.
function asConfig(raw: Record<string, unknown>): MadrLintConfig {
  return raw as MadrLintConfig;
}

function configError(config: MadrLintConfig): string {
  try {
    resolveExtends(config);
  } catch (err) {
    expect(err).toBeInstanceOf(InvalidConfigError);
    return (err as Error).message;
  }
  throw new Error('expected resolveExtends to throw');
}

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

    it('rejects unknown extends entries (#206)', () => {
      expect(() => resolveExtends({ extends: ['unknown-preset'] })).toThrow(
        InvalidConfigError,
      );
    });

    it('passes through madrVersion', () => {
      expect(resolveExtends({ madrVersion: 'v4' }).madrVersion).toBe('v4');
    });

    // madrVersion now selects the metadata source and which rules run (#207),
    // so a typo must not silently skip every project rule.
    it.for(['V3', 'v5', '', 'latest'])('rejects madrVersion %j', (value) => {
      expect(() =>
        resolveExtends({ madrVersion: value as 'v3' }),
      ).toThrow(InvalidConfigError);
      expect(() => resolveExtends({ madrVersion: value as 'v3' })).toThrow(
        /madrVersion.*"v2", "v3", "v4", "auto"/,
      );
    });

    it('passes through ignorePatterns', () => {
      expect(
        resolveExtends({ ignorePatterns: ['template.md'] }).ignorePatterns,
      ).toEqual(['template.md']);
    });
  });

  // A typo in a rule ID or preset name used to be dropped silently, so the
  // run checked nothing and exited 0 (#206).
  describe('unknown rule IDs and extends entries (#206)', () => {
    it('rejects an unknown rule ID and names the closest one', () => {
      const message = configError({ rules: { 'madr/status-enmu': 'error' } });
      expect(message).toContain('"madr/status-enmu"');
      expect(message).toContain('Did you mean "madr/status-enum"?');
    });

    it('rejects an unknown rule ID even when it is set to off', () => {
      const message = configError({ rules: { 'madr/required-section': 'off' } });
      expect(message).toContain('Did you mean "madr/required-sections"?');
    });

    it('suggests the namespaced ID for a rule written without its namespace', () => {
      const message = configError({ rules: { 'status-enum': 'error' } });
      expect(message).toContain('Did you mean "madr/status-enum"?');
    });

    it('rejects an unknown extends entry and names the closest preset', () => {
      const message = configError({ extends: ['madr-lint:recomended'] });
      expect(message).toContain('"madr-lint:recomended"');
      expect(message).toContain('Did you mean "madr-lint:recommended"?');
    });

    it('rejects a typo in a bare-string extends', () => {
      const message = configError({
        extends: 'madr-lint:recomended' as unknown as string[],
      });
      expect(message).toContain('Did you mean "madr-lint:recommended"?');
    });

    it('reports the issue reproduction (both typos) in one error', () => {
      const message = configError({
        extends: ['madr-lint:recomended'],
        rules: { 'madr/status-enmu': 'error' },
      });
      // The docs and changeset quote this text, so pin it exactly.
      expect(message).toBe(
        [
          'Invalid config (2 problems):',
          '  - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?',
          '  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?',
        ].join('\n'),
      );
    });

    it('reports every unknown rule, not just the first', () => {
      const message = configError({
        rules: {
          'madr/status-enmu': 'error',
          'madr/date-iso8061': 'warn',
          'madr/filename-format': 'error',
        },
      });
      expect(message).toContain('"madr/status-enmu"');
      expect(message).toContain('"madr/date-iso8061"');
      expect(message).not.toContain('"madr/filename-format"');
    });

    it('reports an invalid madrVersion together with unknown names', () => {
      const message = configError({
        madrVersion: 'V3' as 'v3',
        rules: { 'madr/status-enmu': 'error' },
      });
      expect(message).toContain('madrVersion');
      expect(message).toContain('"madr/status-enmu"');
    });

    it.for(['core/internal-error', 'core/anything'])(
      'rejects the reserved ID %s',
      (id) => {
        const message = configError({ rules: { [id]: 'off' } });
        expect(message).toContain(`"${id}"`);
        expect(message).toMatch(/reserved/);
        expect(message).not.toContain('Did you mean');
      },
    );

    it('does not suggest a rule when nothing is close', () => {
      const message = configError({ rules: { 'madr/foo': 'error' } });
      expect(message).toContain('"madr/foo"');
      expect(message).not.toContain('Did you mean');
      expect(message).toContain('https://knktkc.github.io/madr-lint/rules/');
    });

    it('lists the known presets when no preset is close', () => {
      const message = configError({ extends: ['eslint:all'] });
      expect(message).toContain('"eslint:all"');
      expect(message).not.toContain('Did you mean');
      expect(message).toContain('"madr-lint:recommended"');
    });

    it('does not accept Object.prototype names as rules or presets', () => {
      expect(() => resolveExtends({
          rules: JSON.parse('{"toString":"error"}') as MadrLintConfig['rules'],
        })).toThrow(
        InvalidConfigError,
      );
      expect(() => resolveExtends({ extends: ['constructor'] })).toThrow(
        InvalidConfigError,
      );
    });

    it('rejects a non-string extends entry as a config error', () => {
      expect(() =>
        resolveExtends({ extends: [42] as unknown as string[] }),
      ).toThrow(InvalidConfigError);
    });

    describe('valid configs still resolve', () => {
      it('accepts every built-in rule ID', () => {
        const all = Object.fromEntries(
          Object.values(builtinRules).map((r) => [r.meta.name, 'warn' as const]),
        );
        expect(resolveExtends({ rules: all }).rules).toEqual(all);
      });

      it('accepts the recommended preset with tuple and off overrides', () => {
        const config = resolveExtends({
          extends: ['madr-lint:recommended'],
          rules: {
            'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
            'madr/status-enum': 'off',
          },
        });
        expect(config.rules['madr/filename-format']).toEqual([
          'error',
          { pattern: '^ADR-[0-9]+\\.md$' },
        ]);
        expect(config.rules['madr/status-enum']).toBe('off');
        expect(config.rules['madr/required-sections']).toBe('error');
      });

      it('accepts a bare-string extends of the recommended preset', () => {
        const config = resolveExtends({
          extends: 'madr-lint:recommended' as unknown as string[],
        });
        expect(config.rules).toEqual(recommended);
      });

      it('accepts an empty config', () => {
        expect(resolveExtends({}).rules).toEqual({});
        expect(resolveExtends({ extends: [], rules: {} }).rules).toEqual({});
      });

      // These worked before #206, so they must keep working.
      it('treats extends: null and rules: null as absent', () => {
        expect(resolveExtends(asConfig({ extends: null })).rules).toEqual({});
        expect(resolveExtends(asConfig({ rules: null })).rules).toEqual({});
      });

      it('skips null, undefined, and false extends entries (the `cond && preset` idiom)', () => {
        const config = resolveExtends(
          asConfig({ extends: [null, 'madr-lint:recommended', undefined, false] }),
        );
        expect(config.rules).toEqual(recommended);
      });
    });

    describe('value shapes and formatting', () => {
      it.for([
        ['42', 42, 'Unknown preset 42 in extends.'],
        ['{}', {}, 'Unknown preset {} in extends.'],
        ['true', true, 'Unknown preset true in extends.'],
        ["''", '', 'Unknown preset "" in extends.'],
      ] as const)('still rejects the extends entry %s', ([, entry, expected]) => {
        expect(configError(asConfig({ extends: [entry] }))).toContain(expected);
      });

      it.for([
        ['a bigint', 10n, '10n'],
        ['a symbol', Symbol('x'), 'Symbol(x)'],
        ['a function', () => 'x', 'a function'],
      ] as const)('reports %s extends entry without crashing', ([, entry, shown]) => {
        const message = configError(asConfig({ extends: [entry] }));
        expect(message).toBe(
          `Unknown preset ${shown} in extends. Known presets: "madr-lint:recommended".`,
        );
      });

      it('reports a circular extends entry without crashing', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(configError(asConfig({ extends: [circular] }))).toMatch(
          /^Unknown preset .+ in extends\./,
        );
      });

      it('reports a bigint madrVersion without crashing', () => {
        expect(configError(asConfig({ madrVersion: 10n }))).toBe(
          'Invalid madrVersion 10n: use one of "v2", "v3", "v4", "auto".',
        );
      });

      it('keeps the madrVersion message for a string value unchanged', () => {
        expect(configError(asConfig({ madrVersion: 'V3' }))).toBe(
          'Invalid madrVersion "V3": use one of "v2", "v3", "v4", "auto".',
        );
      });

      it.for([
        ['an array', ['madr/status-enum'], '["madr/status-enum"]'],
        ['a string', 'madr/status-enum', '"madr/status-enum"'],
        ['a number', 1, '1'],
      ] as const)('reports rules given as %s as one problem', ([, rules, shown]) => {
        expect(configError(asConfig({ rules }))).toBe(
          `Invalid rules ${shown}: use an object that maps rule IDs to severities.`,
        );
      });

      it('compares names case-insensitively', () => {
        expect(configError({ rules: { 'MADR/STATUS-ENUM': 'error' } })).toContain(
          'Did you mean "madr/status-enum"?',
        );
      });

      it('suggests the full preset name for a preset written without its prefix', () => {
        expect(configError({ extends: ['recommended'] })).toContain(
          'Did you mean "madr-lint:recommended"?',
        );
      });

      it('handles a very long rule key quickly and truncates it in the message', () => {
        const key = `madr/${'x'.repeat(200_000)}`;
        const started = performance.now();
        const message = configError({ rules: { [key]: 'error' } });
        expect(performance.now() - started).toBeLessThan(200);
        expect(message).not.toContain('Did you mean');
        expect(message).toContain(`"madr/${'x'.repeat(75)}…"`);
        expect(message.length).toBeLessThan(250);
      });

      it('does not truncate a realistic rule ID', () => {
        const key = `madr/${'a'.repeat(75)}`;
        expect(configError({ rules: { [key]: 'error' } })).toContain(`"${key}"`);
      });
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

    it('parses .madrlintrc.mjs (ESM)', () => {
      writeFileSync(
        join(dir, '.madrlintrc.mjs'),
        `export default { adrDir: 'mjs-adr', extends: ['madr-lint:recommended'] };`,
      );
      const config = loadConfig(dir);
      expect(config.adrDir).toBe('mjs-adr');
      expect(config.rules['madr/filename-format']).toBe('error');
    });

    it('parses .madrlintrc.ts (TypeScript via jiti)', () => {
      writeFileSync(
        join(dir, '.madrlintrc.ts'),
        [
          'import type { MadrLintConfig } from "../../src/index.js";',
          'const config: MadrLintConfig = {',
          '  adrDir: "ts-adr",',
          '  extends: ["madr-lint:recommended"],',
          '  ignorePatterns: ["template.md"],',
          '};',
          'export default config;',
        ].join('\n'),
      );
      const config = loadConfig(dir);
      expect(config.adrDir).toBe('ts-adr');
      expect(config.rules['madr/filename-format']).toBe('error');
      expect(config.ignorePatterns).toEqual(['template.md']);
    });

    it('parses madr-lint.config.js (CommonJS-style export)', () => {
      writeFileSync(
        join(dir, 'madr-lint.config.js'),
        `export default { adrDir: 'cfg-js' };`,
      );
      const config = loadConfig(dir);
      expect(config.adrDir).toBe('cfg-js');
    });

    it('JSON wins over JS when both exist', () => {
      writeFileSync(
        join(dir, '.madrlintrc.json'),
        JSON.stringify({ adrDir: 'from-json' }),
      );
      writeFileSync(
        join(dir, '.madrlintrc.mjs'),
        `export default { adrDir: 'from-mjs' };`,
      );
      expect(loadConfig(dir).adrDir).toBe('from-json');
    });

    it('rejects the issue #206 reproduction from a discovered .madrlintrc.json', () => {
      writeFileSync(join(dir, '.madrlintrc.json'), JSON.stringify(ISSUE_206_CONFIG));
      expect(() => loadConfig(dir)).toThrow(InvalidConfigError);
      expect(() => loadConfig(dir)).toThrow(/madr-lint:recommended[\s\S]*madr\/status-enum/);
    });

    it('rejects the issue #206 reproduction from a discovered JS module config', () => {
      writeFileSync(
        join(dir, 'madr-lint.config.mjs'),
        `export default ${JSON.stringify(ISSUE_206_CONFIG)};`,
      );
      expect(() => loadConfig(dir)).toThrow(InvalidConfigError);
    });

    it('accepts a JS config that uses the `cond && preset` idiom in extends', () => {
      writeFileSync(
        join(dir, 'madr-lint.config.mjs'),
        'const ci = false;\nexport default { extends: ["madr-lint:recommended", ci && "x"] };\n',
      );
      expect(loadConfig(dir).rules).toEqual(recommended);
    });

    it('rejects a bigint extends entry as a config error, not a crash', () => {
      writeFileSync(join(dir, 'madr-lint.config.mjs'), 'export default { extends: [10n] };\n');
      expect(() => loadConfig(dir)).toThrow(InvalidConfigError);
    });

    it('rejects the issue #206 reproduction from an explicit path', () => {
      const path = join(dir, 'custom.json');
      writeFileSync(path, JSON.stringify(ISSUE_206_CONFIG));
      expect(() => loadConfigFromPath(path)).toThrow(InvalidConfigError);
      expect(() => loadConfigFromPath(path)).toThrow(
        /madr-lint:recommended[\s\S]*madr\/status-enum/,
      );
    });
  });
});
