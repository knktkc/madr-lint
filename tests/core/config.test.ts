import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recommended } from '../../src/configs/recommended.js';
import {
  CONFIG_FILES,
  InvalidConfigError,
  loadConfig,
  loadConfigFromPath,
  resolveExtends,
} from '../../src/core/config.js';
import { renderConfig } from '../../src/core/init.js';
import type { MadrLintConfig } from '../../src/index.js';
import * as builtinRules from '../../src/rules/index.js';

// Forward slashes so the path also works as an import specifier on Windows.
const SRC_INDEX = join(import.meta.dirname, '../../src/index.ts').replaceAll('\\', '/');

// The exact reproduction from issue #206.
const ISSUE_206_CONFIG = {
  extends: ['madr-lint:recomended'],
  rules: { 'madr/status-enmu': 'error' },
};

const KNOWN_KEYS =
  '"extends", "madrVersion", "adrDir", "rules", "ignorePatterns", "cache", "cacheLocation"';

// At most one of these follows the problems, and only for a JS/TS module
// without a default export (#222). The first names an unknown key whose value
// has a known config key; the second is for ESM-shaped modules otherwise.
function looksLikeConfigHint(key: string): string {
  return `The export "${key}" looks like a config. Export it as the default: \`export default ${key}\` (ESM) or \`module.exports = ${key}\` (CommonJS).`;
}
const PROMISE_ERROR =
  'The config must be an object, not a Promise. Async configs are not supported: export the config object itself.';

const NO_DEFAULT_EXPORT_NOTE =
  'The config file has no default export, so its exports were read as the config.';

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

// Adds an enumerable property to Object.prototype for one callback, as a
// careless dependency might, and always removes it again.
function withObjectPrototypeKey<T>(key: string, value: unknown, run: () => T): T {
  // oxlint-disable-next-line no-extend-native -- the pollution is the input under test
  Object.defineProperty(Object.prototype, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    delete (Object.prototype as Record<string, unknown>)[key];
  }
}

function loadError(load: () => unknown): string {
  try {
    load();
  } catch (err) {
    expect(err).toBeInstanceOf(InvalidConfigError);
    return (err as Error).message;
  }
  throw new Error('expected the config to be rejected');
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
      // One rule for top-level values and extends entries alike: null,
      // undefined, and false mean "absent" (`rules: ci && {...}`).
      it.for([null, undefined, false])('treats %s as absent for top-level extends and rules', (value) => {
        expect(resolveExtends(asConfig({ extends: value })).rules).toEqual({});
        expect(resolveExtends(asConfig({ rules: value })).rules).toEqual({});
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
        ['zero', 0, '0'],
        ['an empty string', '', '""'],
        ['an empty array', [], '[]'],
        ['true', true, 'true'],
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

      // Without the length check in closestMatch this input takes several
      // seconds; with it, a few milliseconds. The bound leaves room for a
      // loaded CI runner.
      it('handles a very long rule key quickly and truncates it in the message', () => {
        const key = `madr/${'x'.repeat(1_000_000)}`;
        const started = performance.now();
        const message = configError({ rules: { [key]: 'error' } });
        expect(performance.now() - started).toBeLessThan(2000);
        expect(message).not.toContain('Did you mean');
        expect(message).toContain(`"madr/${'x'.repeat(75)}…"`);
        expect(message.length).toBeLessThan(250);
      });

      it.for([
        ['0', 0, 'Invalid extends 0: use a preset name or a list of preset names.'],
        ['true', true, 'Invalid extends true: use a preset name or a list of preset names.'],
        ["''", '', 'Unknown preset "" in extends. Known presets: "madr-lint:recommended".'],
      ] as const)('still rejects extends: %s', ([, value, expected]) => {
        expect(configError(asConfig({ extends: value }))).toBe(expected);
      });

      it('reports a revoked Proxy as an unprintable value', () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        expect(configError(asConfig({ extends: [proxy] }))).toBe(
          'Unknown preset an unprintable value in extends. Known presets: "madr-lint:recommended".',
        );
        expect(configError(asConfig({ extends: proxy }))).toBe(
          'Invalid extends an unprintable value: use a preset name or a list of preset names.',
        );
        expect(configError(asConfig({ rules: proxy }))).toBe(
          'Invalid rules an unprintable value: use an object that maps rule IDs to severities.',
        );
      });

      it('reports a value whose toJSON and toStringTag throw as an unprintable value', () => {
        const hostile = {
          toJSON(): never {
            throw new Error('j');
          },
          get [Symbol.toStringTag](): never {
            throw new Error('t');
          },
        };
        expect(configError(asConfig({ extends: [hostile] }))).toContain(
          'Unknown preset an unprintable value in extends.',
        );
      });

      // A high surrogate left without its pair prints as a broken character.
      const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

      it('does not cut a string value inside a surrogate pair', () => {
        const message = configError({ rules: { [`${'x'.repeat(79)}😀`]: 'error' } });
        expect(message).toContain(`"${'x'.repeat(79)}…"`);
        expect(message).not.toMatch(LONE_SURROGATE);
      });

      it('does not cut a symbol description inside a surrogate pair', () => {
        const message = configError(
          asConfig({ extends: [Symbol(`${'x'.repeat(72)}😀`)] }),
        );
        expect(message).toContain(`Symbol(${'x'.repeat(72)}…`);
        expect(message).not.toMatch(LONE_SURROGATE);
      });

      it('does not truncate a realistic rule ID', () => {
        const key = `madr/${'a'.repeat(75)}`;
        expect(configError({ rules: { [key]: 'error' } })).toContain(`"${key}"`);
      });
    });
  });

  // Top-level keys madr-lint does not read used to be dropped silently, so a
  // typo (`rule`, `adrdir`) or a named export (`export const config`) left the
  // config without effect while the CLI linted with defaults (#222).
  describe('unknown top-level keys and config shape (#222)', () => {
    it('rejects an unknown key and names the closest known key', () => {
      expect(configError(asConfig({ rule: { 'madr/status-enum': 'off' } }))).toBe(
        'Unknown key "rule" in the config. Did you mean "rules"?',
      );
    });

    it('suggests a known key that differs only in case', () => {
      expect(configError(asConfig({ adrdir: 'x' }))).toBe(
        'Unknown key "adrdir" in the config. Did you mean "adrDir"?',
      );
      expect(configError(asConfig({ IgnorePatterns: [] }))).toBe(
        'Unknown key "IgnorePatterns" in the config. Did you mean "ignorePatterns"?',
      );
    });

    it('lists the known keys when no key is close', () => {
      expect(configError(asConfig({ config: { rules: {} } }))).toBe(
        `Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`,
      );
    });

    it('reports an unknown key even when its value is undefined', () => {
      expect(configError(asConfig({ rule: undefined }))).toBe(
        'Unknown key "rule" in the config. Did you mean "rules"?',
      );
    });

    it('treats $schema as an unknown key', () => {
      expect(configError(asConfig({ $schema: 'https://example.com/s.json' }))).toBe(
        `Unknown key "$schema" in the config. Known keys: ${KNOWN_KEYS}.`,
      );
    });

    it('lists unknown keys first, in one error with the #206 problems', () => {
      const message = configError(
        asConfig({
          rule: {},
          adrdir: 'x',
          madrVersion: 'V3',
          extends: ['madr-lint:recomended'],
          rules: { 'madr/status-enmu': 'error' },
        }),
      );
      expect(message).toBe(
        [
          'Invalid config (5 problems):',
          '  - Unknown key "rule" in the config. Did you mean "rules"?',
          '  - Unknown key "adrdir" in the config. Did you mean "adrDir"?',
          '  - Invalid madrVersion "V3": use one of "v2", "v3", "v4", "auto".',
          '  - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?',
          '  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?',
        ].join('\n'),
      );
    });

    it('reports Object.prototype names as unknown keys', () => {
      const raw = JSON.parse('{"constructor":1,"toString":2,"__proto__":{}}') as unknown;
      expect(configError(raw as MadrLintConfig)).toBe(
        [
          'Invalid config (3 problems):',
          `  - Unknown key "constructor" in the config. Known keys: ${KNOWN_KEYS}.`,
          `  - Unknown key "toString" in the config. Known keys: ${KNOWN_KEYS}.`,
          `  - Unknown key "__proto__" in the config. Known keys: ${KNOWN_KEYS}.`,
        ].join('\n'),
      );
    });

    it('truncates a very long key in the message', () => {
      const key = 'x'.repeat(1_000_000);
      const started = performance.now();
      const message = configError(asConfig({ [key]: 1 }));
      expect(performance.now() - started).toBeLessThan(2000);
      expect(message).toBe(
        `Unknown key "${'x'.repeat(80)}…" in the config. Known keys: ${KNOWN_KEYS}.`,
      );
    });

    it('accepts every known key', () => {
      const config = resolveExtends({
        extends: ['madr-lint:recommended'],
        madrVersion: 'v4',
        adrDir: 'decisions',
        rules: { 'madr/status-enum': 'off' },
        ignorePatterns: ['template.md'],
        cache: false,
        cacheLocation: 'c',
      });
      expect(config).toEqual({
        adrDir: 'decisions',
        rules: { ...recommended, 'madr/status-enum': 'off' },
        ignorePatterns: ['template.md'],
        madrVersion: 'v4',
        cache: false,
        cacheLocation: 'c',
      });
    });

    it('ignores symbol and non-enumerable keys', () => {
      const raw: Record<PropertyKey, unknown> = { [Symbol('meta')]: 1 };
      Object.defineProperty(raw, 'hidden', { value: 1, enumerable: false });
      expect(resolveExtends(raw as MadrLintConfig).adrDir).toBe('docs/adr');
    });

    it.for([
      ['a function', () => ({}), 'a function'],
      ['undefined', undefined, 'undefined'],
      ['null', null, 'null'],
      ['an empty array', [], '[]'],
      ['an array', [{ rules: {} }], '[{"rules":{}}]'],
      ['a string', 'x', '"x"'],
      ['a number', 42, '42'],
      ['true', true, 'true'],
    ] as const)('rejects %s as the whole config', ([, raw, shown]) => {
      expect(configError(raw as unknown as MadrLintConfig)).toBe(
        `The config must be an object, not ${shown}.`,
      );
    });

    // These objects are thenable on purpose: that is the input under test.
    // oxlint-disable-next-line unicorn/no-thenable
    const THEN = 'then';

    it.for([
      ['a resolved Promise', () => Promise.resolve({ rules: {} })],
      ['an async function result', () => (async () => ({ rules: {} }))()],
      ['a thenable object', () => ({ [THEN]: (): void => {}, rules: {} })],
      ['a thenable function', () => Object.assign(() => ({}), { [THEN]: (): void => {} })],
    ] as const)('rejects %s as the whole config', ([, make]) => {
      expect(configError(make() as unknown as MadrLintConfig)).toBe(PROMISE_ERROR);
    });

    it('does not treat a non-callable then as a Promise', () => {
      expect(configError(asConfig({ [THEN]: 1 }))).toBe(
        `Unknown key "then" in the config. Known keys: ${KNOWN_KEYS}.`,
      );
    });

    it('reads a config whose then getter throws without crashing', () => {
      const raw = Object.defineProperty({ adrDir: 'x' }, THEN, {
        enumerable: false,
        get(): never {
          throw new Error('then');
        },
      });
      expect(resolveExtends(raw).adrDir).toBe('x');
    });

    // Accepted before #222 and still accepted: they have no enumerable keys.
    it.for([
      ['a Map', () => new Map([['rules', {}]])],
      ['a Date', () => new Date(0)],
      ['a RegExp', () => /x/],
    ] as const)('accepts %s as an empty config', ([, make]) => {
      expect(resolveExtends(make() as unknown as MadrLintConfig)).toEqual(resolveExtends({}));
    });

    it('reads config fields of a class instance and ignores its prototype getter', () => {
      class Config {
        adrDir = 'decisions';
        rules = { 'madr/status-enum': 'off' as const };
        get helper(): number {
          return 1;
        }
      }
      const config = resolveExtends(new Config());
      expect(config.adrDir).toBe('decisions');
      expect(config.rules).toEqual({ 'madr/status-enum': 'off' });
    });

    it('reports a class instance field that is not a config key', () => {
      class Config {
        rule = {};
      }
      expect(configError(new Config() as MadrLintConfig)).toBe(
        'Unknown key "rule" in the config. Did you mean "rules"?',
      );
    });

    // Inherited enumerable keys are read (`config.rules` finds them), so they
    // are checked too.
    it('reports an inherited unknown key', () => {
      expect(configError(Object.create({ rule: {} }) as MadrLintConfig)).toBe(
        'Unknown key "rule" in the config. Did you mean "rules"?',
      );
    });

    it('reads an inherited known key', () => {
      const raw = Object.create({ rules: { 'madr/status-enum': 'off' } }) as MadrLintConfig;
      expect(resolveExtends(raw).rules).toEqual({ 'madr/status-enum': 'off' });
    });

    it('lists own keys before inherited ones', () => {
      const raw = Object.assign(Object.create({ inherited: 1 }), { own: 1 }) as MadrLintConfig;
      expect(configError(raw)).toBe(
        [
          'Invalid config (2 problems):',
          `  - Unknown key "own" in the config. Known keys: ${KNOWN_KEYS}.`,
          `  - Unknown key "inherited" in the config. Known keys: ${KNOWN_KEYS}.`,
        ].join('\n'),
      );
    });

    it('ignores an inherited non-enumerable key', () => {
      const proto = Object.defineProperty({}, 'rule', { value: 1, enumerable: false });
      expect(resolveExtends(Object.create(proto) as MadrLintConfig).adrDir).toBe('docs/adr');
    });

    // A dependency's enumerable addition to Object.prototype is not something
    // the user can fix in the config, so it is not read as a config key.
    describe('enumerable keys added to Object.prototype', () => {
      it('ignores them in an empty and a JSON-parsed config', () => {
        withObjectPrototypeKey('polluted', 1, () => {
          expect(resolveExtends({})).toEqual(
            expect.objectContaining({ adrDir: 'docs/adr', rules: {} }),
          );
          expect(resolveExtends(JSON.parse('{"rules":{}}') as unknown).rules).toEqual({});
        });
      });

      it('still reports an own key of the same name', () => {
        withObjectPrototypeKey('polluted', 1, () => {
          expect(configError(JSON.parse('{"polluted":1}') as MadrLintConfig)).toBe(
            `Unknown key "polluted" in the config. Known keys: ${KNOWN_KEYS}.`,
          );
        });
      });

      it('still reports keys inherited from another prototype', () => {
        withObjectPrototypeKey('polluted', 1, () => {
          expect(configError(Object.create({ rule: {} }) as MadrLintConfig)).toBe(
            'Unknown key "rule" in the config. Did you mean "rules"?',
          );
        });
      });

      it('still reports own Object.prototype names in JSON', () => {
        withObjectPrototypeKey('polluted', 1, () => {
          const raw = JSON.parse('{"constructor":1,"toString":2,"__proto__":{}}') as unknown;
          expect(configError(raw as MadrLintConfig)).toBe(
            [
              'Invalid config (3 problems):',
              `  - Unknown key "constructor" in the config. Known keys: ${KNOWN_KEYS}.`,
              `  - Unknown key "toString" in the config. Known keys: ${KNOWN_KEYS}.`,
              `  - Unknown key "__proto__" in the config. Known keys: ${KNOWN_KEYS}.`,
            ].join('\n'),
          );
        });
      });
    });

    it('reports a config whose prototype cannot be read as a config error', () => {
      const hostile = new Proxy(
        { adrDir: 'x' },
        {
          getPrototypeOf(): never {
            throw new Error('no prototype');
          },
        },
      );
      expect(configError(hostile as MadrLintConfig)).toBe(
        'Cannot list the keys of the config.',
      );
    });

    it('reports a revoked Proxy as the whole config without crashing', () => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      expect(configError(proxy as MadrLintConfig)).toBe(
        'The config must be an object, not an unprintable value.',
      );
    });

    // main never listed the top-level keys, so this read is new and must not
    // turn into a crash.
    it('reports a config whose keys cannot be listed as a config error', () => {
      const hostile = new Proxy(
        {},
        {
          ownKeys(): never {
            throw new Error('no keys');
          },
        },
      );
      expect(configError(hostile as MadrLintConfig)).toBe(
        'Cannot list the keys of the config.',
      );
    });
  });

  // The values of adrDir, ignorePatterns, cache, cacheLocation and each rule
  // severity were not checked: a wrong value weakened the lint without a
  // message (a string ignorePatterns read character by character, a typo in a
  // severity ran the rule as a warning) or crashed with exit 1 (#229).
  describe('config values (#229)', () => {
    const ADR_DIR_USE = 'use a non-empty string, such as "docs/adr".';
    const CACHE_LOCATION_USE = 'use a non-empty string, such as ".madr-lint/cache".';
    const IGNORE_PATTERNS_USE = 'use a list of glob patterns, such as ["template.md"].';
    const SEVERITY_USE = 'use one of "error", "warn", "off".';
    const RULE_VALUE_USE = 'use one of "error", "warn", "off", or a list [severity, options].';

    function throwingGetter(key: string): Record<string, unknown> {
      return Object.defineProperty({}, key, {
        enumerable: true,
        get(): never {
          throw new Error(key);
        },
      });
    }

    function revokedProxy(): object {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      return proxy;
    }

    describe('adrDir', () => {
      it.for([
        ['a number', 42, '42'],
        ['an array', ['docs/adr'], '["docs/adr"]'],
        ['an empty string', '', '""'],
        ['false', false, 'false'],
        ['true', true, 'true'],
        ['an object', { path: 'docs/adr' }, '{"path":"docs/adr"}'],
        ['a function', () => 'docs/adr', 'a function'],
        ['a bigint', 10n, '10n'],
      ] as const)('rejects %s', ([, value, shown]) => {
        expect(configError(asConfig({ adrDir: value }))).toBe(
          `Invalid adrDir ${shown}: ${ADR_DIR_USE}`,
        );
      });

      it('rejects a revoked Proxy and a throwing getter without crashing', () => {
        expect(configError(asConfig({ adrDir: revokedProxy() }))).toBe(
          `Invalid adrDir an unprintable value: ${ADR_DIR_USE}`,
        );
        expect(configError(throwingGetter('adrDir') as MadrLintConfig)).toBe(
          `Invalid adrDir an unprintable value: ${ADR_DIR_USE}`,
        );
      });

      it('accepts a path', () => {
        expect(resolveExtends({ adrDir: 'decisions' }).adrDir).toBe('decisions');
        expect(resolveExtends({ adrDir: '/abs/adr' }).adrDir).toBe('/abs/adr');
      });

      it.for([null, undefined])('treats %s as not set', (value) => {
        expect(resolveExtends(asConfig({ adrDir: value })).adrDir).toBe('docs/adr');
      });
    });

    describe('ignorePatterns', () => {
      it.for([
        ['a string', '0001-*', '"0001-*"'],
        ['an empty string', '', '""'],
        ['an object', {}, '{}'],
        ['an object with a length', { 0: 'x', length: 1 }, '{"0":"x","length":1}'],
        ['a number', 42, '42'],
        ['false', false, 'false'],
        ['true', true, 'true'],
        ['a function', () => ['x'], 'a function'],
      ] as const)('rejects %s', ([, value, shown]) => {
        expect(configError(asConfig({ ignorePatterns: value }))).toBe(
          `Invalid ignorePatterns ${shown}: ${IGNORE_PATTERNS_USE}`,
        );
      });

      it.for([
        ['a number', [42], '42'],
        ['an empty string', [''], '""'],
        ['null', [null], 'null'],
        ['false', [false], 'false'],
        ['a nested list', [['x']], '["x"]'],
        ['a bigint', [10n], '10n'],
        ['a number after a valid pattern', ['template.md', 42], '42'],
        // oxlint-disable-next-line no-sparse-arrays -- the hole is the input under test
        ['a hole', ['template.md', , '9999-*'], 'undefined'],
      ] as const)('rejects an entry that is %s', ([, value, shown]) => {
        expect(configError(asConfig({ ignorePatterns: value }))).toBe(
          `Invalid ignorePatterns entry ${shown}: use a non-empty string.`,
        );
      });

      // One line per ignorePatterns, not per entry: a sparse array of length
      // 1e8 would otherwise produce 1e8 problems.
      it('reports only the first invalid entry, quickly for a huge sparse array', () => {
        expect(configError(asConfig({ ignorePatterns: [42, null] }))).toBe(
          'Invalid ignorePatterns entry 42: use a non-empty string.',
        );
        const sparse: unknown[] = [];
        sparse.length = 1e8;
        const started = performance.now();
        expect(configError(asConfig({ ignorePatterns: sparse }))).toBe(
          'Invalid ignorePatterns entry undefined: use a non-empty string.',
        );
        expect(performance.now() - started).toBeLessThan(2000);
      });

      it('rejects entries that cannot be read without crashing', () => {
        const entryThrows = Object.defineProperty(['template.md', 'x'], 1, {
          get(): never {
            throw new Error('entry');
          },
        });
        expect(configError(asConfig({ ignorePatterns: entryThrows }))).toBe(
          'Invalid ignorePatterns entry an unprintable value: use a non-empty string.',
        );
        const lengthThrows = new Proxy(['template.md'], {
          get(target, key, receiver): unknown {
            if (key === 'length') throw new Error('length');
            return Reflect.get(target, key, receiver) as unknown;
          },
        });
        expect(configError(asConfig({ ignorePatterns: lengthThrows }))).toBe(
          `Invalid ignorePatterns an unprintable value: ${IGNORE_PATTERNS_USE}`,
        );
        expect(configError(asConfig({ ignorePatterns: revokedProxy() }))).toBe(
          `Invalid ignorePatterns an unprintable value: ${IGNORE_PATTERNS_USE}`,
        );
        expect(configError(throwingGetter('ignorePatterns') as MadrLintConfig)).toBe(
          `Invalid ignorePatterns an unprintable value: ${IGNORE_PATTERNS_USE}`,
        );
      });

      it('accepts a list of patterns', () => {
        expect(
          resolveExtends({ ignorePatterns: ['template.md', '9999-*'] }).ignorePatterns,
        ).toEqual(['template.md', '9999-*']);
        expect(resolveExtends({ ignorePatterns: [] }).ignorePatterns).toEqual([]);
      });

      it.for([null, undefined])('treats %s as not set', (value) => {
        expect(resolveExtends(asConfig({ ignorePatterns: value })).ignorePatterns).toEqual([]);
      });
    });

    describe('cache', () => {
      it.for([
        ['the string "false"', 'false', '"false"'],
        ['the string "true"', 'true', '"true"'],
        ['0', 0, '0'],
        ['1', 1, '1'],
        ['an object', {}, '{}'],
        ['an array', [], '[]'],
      ] as const)('rejects %s', ([, value, shown]) => {
        expect(configError(asConfig({ cache: value }))).toBe(
          `Invalid cache ${shown}: use true or false.`,
        );
      });

      it('rejects a throwing getter without crashing', () => {
        expect(configError(throwingGetter('cache') as MadrLintConfig)).toBe(
          'Invalid cache an unprintable value: use true or false.',
        );
      });

      it.for([true, false])('accepts %s', (value) => {
        expect(resolveExtends({ cache: value }).cache).toBe(value);
      });

      it.for([null, undefined])('treats %s as not set', (value) => {
        expect(resolveExtends(asConfig({ cache: value })).cache).toBe(true);
      });
    });

    describe('cacheLocation', () => {
      it.for([
        ['a number', 42, '42'],
        ['an empty string', '', '""'],
        ['an array', ['.cache'], '[".cache"]'],
        ['false', false, 'false'],
      ] as const)('rejects %s', ([, value, shown]) => {
        expect(configError(asConfig({ cacheLocation: value }))).toBe(
          `Invalid cacheLocation ${shown}: ${CACHE_LOCATION_USE}`,
        );
      });

      it('rejects a throwing getter without crashing', () => {
        expect(configError(throwingGetter('cacheLocation') as MadrLintConfig)).toBe(
          `Invalid cacheLocation an unprintable value: ${CACHE_LOCATION_USE}`,
        );
      });

      it('accepts a path', () => {
        expect(resolveExtends({ cacheLocation: '.cache/madr' }).cacheLocation).toBe(
          '.cache/madr',
        );
      });

      it.for([null, undefined])('treats %s as not set', (value) => {
        expect(resolveExtends(asConfig({ cacheLocation: value })).cacheLocation).toBe(
          '.madr-lint/cache',
        );
      });
    });

    describe('rule severities', () => {
      function ruleError(value: unknown): string {
        return configError(asConfig({ rules: { 'madr/status-enum': value } }));
      }

      it.for([
        ['eror', 'error'],
        ['Error', 'error'],
        ['ERROR', 'error'],
        ['erorr', 'error'],
        ['Warn', 'warn'],
        ['wran', 'warn'],
        ['Off', 'off'],
      ] as const)('rejects %j and suggests %j', ([value, match]) => {
        expect(ruleError(value)).toBe(
          `Invalid severity "${value}" for rule "madr/status-enum": ${SEVERITY_USE} Did you mean "${match}"?`,
        );
      });

      it.for(['warning', 'of', 'none', ''])('rejects %j without a suggestion', (value) => {
        expect(ruleError(value)).toBe(
          `Invalid severity ${JSON.stringify(value)} for rule "madr/status-enum": ${SEVERITY_USE}`,
        );
      });

      // ESLint spells severities as 0, 1, 2.
      it.for([
        [0, 'off'],
        [1, 'warn'],
        [2, 'error'],
      ] as const)('rejects the number %s and names %j', ([value, name]) => {
        expect(ruleError(value)).toBe(
          `Invalid severity ${value} for rule "madr/status-enum": use "${name}" instead.`,
        );
        expect(ruleError([value, {}])).toBe(
          `Invalid severity ${value} for rule "madr/status-enum": use "${name}" instead.`,
        );
      });

      it.for([
        ['true', true, 'true'],
        ['3', 3, '3'],
        ['an object', { severity: 'error' }, '{"severity":"error"}'],
        ['an object with a length', { 0: 'error', length: 1 }, '{"0":"error","length":1}'],
        ['a function', () => 'error', 'a function'],
        ['a bigint', 2n, '2n'],
        ['a symbol', Symbol('error'), 'Symbol(error)'],
        ['an empty list', [], '[]'],
        ['a list of three', ['error', {}, {}], '["error",{},{}]'],
      ] as const)('rejects %s as the value', ([, value, shown]) => {
        expect(ruleError(value)).toBe(
          `Invalid severity ${shown} for rule "madr/status-enum": ${RULE_VALUE_USE}`,
        );
      });

      it.for([
        ['"eror"', ['eror', {}], `Invalid severity "eror" for rule "madr/status-enum": ${SEVERITY_USE} Did you mean "error"?`],
        ['true', [true], `Invalid severity true for rule "madr/status-enum": ${SEVERITY_USE}`],
        ['a nested list', [['error']], `Invalid severity ["error"] for rule "madr/status-enum": ${SEVERITY_USE}`],
        // oxlint-disable-next-line no-sparse-arrays -- the hole is the input under test
        ['a hole', [, {}], `Invalid severity undefined for rule "madr/status-enum": ${SEVERITY_USE}`],
      ] as const)('rejects %s as the first entry of a list', ([, value, expected]) => {
        expect(ruleError(value)).toBe(expected);
      });

      it.for([
        ['a string', ['error', 'x'], '"x"'],
        ['a list', ['error', []], '[]'],
        ['a number', ['warn', 42], '42'],
        ['true', ['off', true], 'true'],
        ['a function', ['error', () => ({})], 'a function'],
      ] as const)('rejects options that are %s', ([, value, shown]) => {
        expect(ruleError(value)).toBe(
          `Invalid options ${shown} for rule "madr/status-enum": use an object.`,
        );
      });

      it('reports a bad severity and bad options of one rule together', () => {
        expect(ruleError(['eror', 'x'])).toBe(
          [
            'Invalid config (2 problems):',
            `  - Invalid severity "eror" for rule "madr/status-enum": ${SEVERITY_USE} Did you mean "error"?`,
            '  - Invalid options "x" for rule "madr/status-enum": use an object.',
          ].join('\n'),
        );
      });

      it('reads hostile values without crashing', () => {
        const getter = Object.defineProperty({}, 'madr/status-enum', {
          enumerable: true,
          get(): never {
            throw new Error('value');
          },
        });
        expect(configError(asConfig({ rules: getter }))).toBe(
          `Invalid severity an unprintable value for rule "madr/status-enum": ${RULE_VALUE_USE}`,
        );
        expect(ruleError(revokedProxy())).toBe(
          `Invalid severity an unprintable value for rule "madr/status-enum": ${RULE_VALUE_USE}`,
        );
        const lengthThrows = new Proxy(['error'], {
          get(target, key, receiver): unknown {
            if (key === 'length') throw new Error('length');
            return Reflect.get(target, key, receiver) as unknown;
          },
        });
        expect(ruleError(lengthThrows)).toBe(
          `Invalid severity an unprintable value for rule "madr/status-enum": ${RULE_VALUE_USE}`,
        );
        const severityThrows = Object.defineProperty(['error', {}], 0, {
          get(): never {
            throw new Error('severity');
          },
        });
        expect(ruleError(severityThrows)).toBe(
          `Invalid severity an unprintable value for rule "madr/status-enum": ${SEVERITY_USE}`,
        );
        const optionsThrow = Object.defineProperty(['error', {}], 1, {
          get(): never {
            throw new Error('options');
          },
        });
        expect(ruleError(optionsThrow)).toBe(
          'Invalid options an unprintable value for rule "madr/status-enum": use an object.',
        );
      });

      it('handles a very long severity quickly and truncates it', () => {
        const value = 'e'.repeat(1_000_000);
        const started = performance.now();
        const message = ruleError(value);
        expect(performance.now() - started).toBeLessThan(2000);
        expect(message).toBe(
          `Invalid severity "${'e'.repeat(80)}…" for rule "madr/status-enum": ${SEVERITY_USE}`,
        );
      });

      it('validates a user override of a preset rule', () => {
        expect(
          configError(
            asConfig({ extends: ['madr-lint:recommended'], rules: { 'madr/status-enum': 'eror' } }),
          ),
        ).toBe(
          `Invalid severity "eror" for rule "madr/status-enum": ${SEVERITY_USE} Did you mean "error"?`,
        );
      });

      it('reports the severity of an unknown rule after its name', () => {
        expect(configError(asConfig({ rules: { 'madr/status-enmu': 'eror' } }))).toBe(
          [
            'Invalid config (2 problems):',
            '  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?',
            `  - Invalid severity "eror" for rule "madr/status-enmu": ${SEVERITY_USE} Did you mean "error"?`,
          ].join('\n'),
        );
      });

      it('does not check the value of a reserved rule ID', () => {
        expect(configError(asConfig({ rules: { 'core/internal-error': 'eror' } }))).toBe(
          'Rule "core/internal-error" in rules cannot be configured: "core/" rule IDs are reserved for madr-lint\'s own diagnostics.',
        );
      });

      describe('values that stay valid', () => {
        it.for([
          ['"error"', 'error'],
          ['"warn"', 'warn'],
          ['"off"', 'off'],
          ['["error"]', ['error']],
          ['["warn", {}]', ['warn', {}]],
          ['["off", options]', ['off', { caseSensitive: true }]],
          // Options are checked by the rule's schema when the rule runs.
          ['["error", unknown options]', ['error', { bogus: 1 }]],
          ['["error", null]', ['error', null]],
          ['["error", undefined]', ['error', undefined]],
          ['["error", false]', ['error', false]],
          // oxlint-disable-next-line no-sparse-arrays -- the hole is the input under test
          ['["error", <hole>]', ['error', ,]],
        ] as const)('accepts %s', ([, value]) => {
          expect(
            resolveExtends(asConfig({ rules: { 'madr/status-enum': value } })).rules,
          ).toEqual({ 'madr/status-enum': value });
        });

        it('accepts options with a cycle', () => {
          const options: Record<string, unknown> = {};
          options.self = options;
          expect(
            resolveExtends(asConfig({ rules: { 'madr/status-enum': ['error', options] } }))
              .rules['madr/status-enum'],
          ).toEqual(['error', options]);
        });

        // Like null, undefined and false for top-level rules and extends
        // entries: the entry counts as not written, so a preset's severity
        // stays (`'madr/status-enum': ci && 'error'`).
        it.for([null, undefined, false])('treats a rule set to %s as not written', (value) => {
          expect(
            resolveExtends(asConfig({ rules: { 'madr/status-enum': value } })).rules,
          ).toEqual({});
          expect(
            resolveExtends(
              asConfig({
                extends: ['madr-lint:recommended'],
                rules: { 'madr/status-enum': value, 'madr/date-iso8601': 'warn' },
              }),
            ).rules,
          ).toEqual({ ...recommended, 'madr/date-iso8601': 'warn' });
        });
      });
    });

    it('reports problems of every kind in one error, in the documented order', () => {
      const message = configError(
        asConfig({
          rules: { 'madr/status-enmu': 'error', 'madr/status-enum': 'eror' },
          cacheLocation: 42,
          cache: 'false',
          ignorePatterns: '0001-*',
          adrDir: 42,
          extends: ['madr-lint:recomended'],
          madrVersion: 'V3',
          rule: {},
        }),
      );
      expect(message).toBe(
        [
          'Invalid config (9 problems):',
          '  - Unknown key "rule" in the config. Did you mean "rules"?',
          '  - Invalid madrVersion "V3": use one of "v2", "v3", "v4", "auto".',
          `  - Invalid adrDir 42: ${ADR_DIR_USE}`,
          `  - Invalid ignorePatterns "0001-*": ${IGNORE_PATTERNS_USE}`,
          '  - Invalid cache "false": use true or false.',
          `  - Invalid cacheLocation 42: ${CACHE_LOCATION_USE}`,
          '  - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?',
          '  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?',
          `  - Invalid severity "eror" for rule "madr/status-enum": ${SEVERITY_USE} Did you mean "error"?`,
        ].join('\n'),
      );
    });

    it('leaves the built-in preset severities untouched', () => {
      expect(resolveExtends({ extends: ['madr-lint:recommended'] }).rules).toEqual(recommended);
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

    // Runs the discovered path and the explicit path on the same file, so
    // both loaders are held to the same result.
    function bothLoadErrors(name: string, content: string): [string, string] {
      writeFileSync(join(dir, name), content);
      return [
        loadError(() => loadConfig(dir)),
        loadError(() => loadConfigFromPath(join(dir, name))),
      ];
    }

    function bothLoad(name: string, content: string) {
      writeFileSync(join(dir, name), content);
      const discovered = loadConfig(dir);
      expect(loadConfigFromPath(join(dir, name))).toEqual(discovered);
      return discovered;
    }

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

    it('rejects invalid config values (#229) from a discovered file and an explicit path', () => {
      const [discovered, explicit] = bothLoadErrors(
        '.madrlintrc.json',
        '{ "ignorePatterns": "0001-*", "rules": { "madr/status-enum": "eror" } }\n',
      );
      const expected = [
        'Invalid config (2 problems):',
        '  - Invalid ignorePatterns "0001-*": use a list of glob patterns, such as ["template.md"].',
        '  - Invalid severity "eror" for rule "madr/status-enum": use one of "error", "warn", "off". Did you mean "error"?',
      ].join('\n');
      expect(discovered).toBe(expected);
      expect(explicit).toBe(expected);
    });

    it('reads a JS config with a rule set to null as not written (#229)', () => {
      writeFileSync(
        join(dir, 'madr-lint.config.mjs'),
        'export default { extends: ["madr-lint:recommended"], rules: { "madr/status-enum": null } };\n',
      );
      expect(loadConfig(dir).rules).toEqual(recommended);
    });

    it('rejects the issue #206 reproduction from an explicit path', () => {
      const path = join(dir, 'custom.json');
      writeFileSync(path, JSON.stringify(ISSUE_206_CONFIG));
      expect(() => loadConfigFromPath(path)).toThrow(InvalidConfigError);
      expect(() => loadConfigFromPath(path)).toThrow(
        /madr-lint:recommended[\s\S]*madr\/status-enum/,
      );
    });

    describe('top-level keys and config shape (#222)', () => {
      const MODULE_FILES = CONFIG_FILES.filter((name) => !name.endsWith('.json'));

      it.for(MODULE_FILES)(
        'rejects a named-export-only %s and says to export the config as the default',
        (name) => {
          const content = name.endsWith('.cjs')
            ? 'exports.config = { rules: { "madr/status-enum": "off" } };\n'
            : 'export const config = { rules: { "madr/status-enum": "off" } };\n';
          const expected = [
            `Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`,
            looksLikeConfigHint('config'),
          ].join('\n');
          expect(bothLoadErrors(name, content)).toEqual([expected, expected]);
        },
      );

      it('rejects a CommonJS-style named export in a .js config', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.js',
          'exports.config = { rules: {} };\n',
        );
        expect(message).toBe(
          [
            `Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`,
            looksLikeConfigHint('config'),
          ].join('\n'),
        );
      });

      // No export looks like a config, so an ESM module gets the generic note.
      it('puts the generic note once, after every problem, for an ESM module', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.mjs',
          'export const rule = {};\nexport const adrdir = "x";\nexport const madrVersion = "V3";\n',
        );
        expect(message).toBe(
          [
            'Invalid config (3 problems):',
            '  - Unknown key "adrdir" in the config. Did you mean "adrDir"?',
            '  - Unknown key "rule" in the config. Did you mean "rules"?',
            '  - Invalid madrVersion "V3": use one of "v2", "v3", "v4", "auto".',
            NO_DEFAULT_EXPORT_NOTE,
          ].join('\n'),
        );
      });

      // A module that mixes known named exports with an unrelated one used to
      // work; the unrelated export is now an unknown key.
      it('rejects known named exports mixed with an unknown export', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.ts',
          'export const rules = {};\nexport const helper = 1;\n',
        );
        expect(message).toBe(
          [
            `Unknown key "helper" in the config. Known keys: ${KNOWN_KEYS}.`,
            NO_DEFAULT_EXPORT_NOTE,
          ].join('\n'),
        );
      });

      it('does not add the hint for a default export with an unknown key', () => {
        expect(
          bothLoadErrors('madr-lint.config.ts', 'export default { rule: {} };\n'),
        ).toEqual([
          'Unknown key "rule" in the config. Did you mean "rules"?',
          'Unknown key "rule" in the config. Did you mean "rules"?',
        ]);
      });

      // `module.exports = {...}` is the CommonJS default export, but at runtime
      // it looks like an exports object without `default`. A typo in it must
      // not be told to export the config as the default.
      it.for([
        ['madr-lint.config.cjs', 'module.exports = { rule: {} };\n'],
        ['madr-lint.config.js', 'module.exports = { rule: {} };\n'],
        ['madr-lint.config.ts', 'module.exports = { rule: {} };\n'],
      ] as const)('adds no hint for a typo in module.exports in %s', ([name, content]) => {
        expect(bothLoadErrors(name, content)).toEqual([
          'Unknown key "rule" in the config. Did you mean "rules"?',
          'Unknown key "rule" in the config. Did you mean "rules"?',
        ]);
      });

      it('adds no hint for a CommonJS module with an interop default export', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.cjs',
          'Object.defineProperty(exports, "__esModule", { value: true });\nexports.default = { rule: {} };\n',
        );
        expect(message).toBe('Unknown key "rule" in the config. Did you mean "rules"?');
      });

      it('names the first export that looks like a config, once', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.mjs',
          'export const b = { adrDir: "x" };\nexport const a = { rules: {} };\nexport const c = 1;\n',
        );
        expect(message).toBe(
          [
            'Invalid config (3 problems):',
            `  - Unknown key "a" in the config. Known keys: ${KNOWN_KEYS}.`,
            `  - Unknown key "b" in the config. Known keys: ${KNOWN_KEYS}.`,
            `  - Unknown key "c" in the config. Known keys: ${KNOWN_KEYS}.`,
            looksLikeConfigHint('a'),
          ].join('\n'),
        );
      });

      it('names a CommonJS export that looks like a config, inherited keys included', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.cjs',
          'exports.helper = 1;\nexports.config = Object.create({ extends: ["madr-lint:recommended"] });\n',
        );
        expect(message).toBe(
          [
            'Invalid config (2 problems):',
            `  - Unknown key "helper" in the config. Known keys: ${KNOWN_KEYS}.`,
            `  - Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`,
            looksLikeConfigHint('config'),
          ].join('\n'),
        );
      });

      it('does not put a key that is not an identifier into the code snippet', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.cjs',
          'exports["my-config"] = { rules: {} };\n',
        );
        expect(message).toBe(
          [
            `Unknown key "my-config" in the config. Known keys: ${KNOWN_KEYS}.`,
            'The export "my-config" looks like a config. Export it as the default: `export default {...}` (ESM) or `module.exports = {...}` (CommonJS).',
          ].join('\n'),
        );
      });

      it('does not count an array or a function export as looking like a config', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.cjs',
          'exports.list = Object.assign([], { rules: {} });\nexports.make = Object.assign(() => ({}), { rules: {} });\n',
        );
        expect(message).toBe(
          [
            'Invalid config (2 problems):',
            `  - Unknown key "list" in the config. Known keys: ${KNOWN_KEYS}.`,
            `  - Unknown key "make" in the config. Known keys: ${KNOWN_KEYS}.`,
          ].join('\n'),
        );
      });

      // Reading an export's value is new; a throwing getter must not crash.
      it('reports an export whose getter throws without crashing', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.cjs',
          'Object.defineProperty(exports, "config", { enumerable: true, get() { throw new Error("x"); } });\n',
        );
        expect(message).toBe(`Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`);
      });

      it.for([
        ['.madrlintrc.json', '{ "config": { "rules": {} } }\n'],
        ['madr-lint.config.mjs', 'export default { config: { rules: {} } };\n'],
      ] as const)('adds no hint for a config-like key in %s', ([name, content]) => {
        expect(bothLoadErrors(name, content)).toEqual([
          `Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`,
          `Unknown key "config" in the config. Known keys: ${KNOWN_KEYS}.`,
        ]);
      });

      describe('module interop keys', () => {
        it('reads a CommonJS config that is also its own default export', () => {
          const config = bothLoad(
            'madr-lint.config.cjs',
            'const c = { extends: ["madr-lint:recommended"], rules: { "madr/status-enum": "off" } };\nmodule.exports = c;\nmodule.exports.default = c;\nglobalThis.madrLintDualExport = c;\n',
          );
          expect(config.rules).toEqual({ ...recommended, 'madr/status-enum': 'off' });
          const dual = (globalThis as { madrLintDualExport?: Record<string, unknown> })
            .madrLintDualExport;
          // The user's object is left as written.
          expect(dual?.default).toBe(dual);
          expect(Object.keys(dual ?? {})).toEqual(['extends', 'rules', 'default']);
        });

        it('reads an ESM default export that refers to itself as default', () => {
          expect(
            bothLoad(
              'madr-lint.config.mjs',
              'const c = { adrDir: "self" };\nc.default = c;\nexport default c;\n',
            ).adrDir,
          ).toBe('self');
        });

        it('reads a CommonJS module with an enumerable __esModule flag', () => {
          const config = bothLoad(
            'madr-lint.config.cjs',
            'exports.__esModule = true;\nexports.adrDir = "decisions";\nexports.rules = { "madr/status-enum": "off" };\n',
          );
          expect(config.adrDir).toBe('decisions');
          expect(config.rules).toEqual({ 'madr/status-enum': 'off' });
        });

        // Spreading such a module copies its `default`, which then points at the
        // module object rather than at the new config.
        it('reads a config that spreads a CommonJS base that is its own default', () => {
          writeFileSync(
            join(dir, 'base.cjs'),
            'module.exports = { rules: { "madr/status-enum": "off" } };\nmodule.exports.default = module.exports;\n',
          );
          const config = bothLoad(
            'madr-lint.config.mjs',
            'import base from "./base.cjs";\nexport default { ...base };\n',
          );
          expect(config.rules).toEqual({ 'madr/status-enum': 'off' });
        });

        it('still reports a default key holding an object whose default is something else', () => {
          expect(
            bothLoadErrors(
              'madr-lint.config.mjs',
              'export default { default: { default: { rules: {} } } };\n',
            ),
          ).toEqual([
            `Unknown key "default" in the config. Known keys: ${KNOWN_KEYS}.`,
            `Unknown key "default" in the config. Known keys: ${KNOWN_KEYS}.`,
          ]);
        });

        it('still reports a default key that holds something else', () => {
          expect(
            bothLoadErrors('madr-lint.config.mjs', 'export default { default: { rules: {} } };\n'),
          ).toEqual([
            `Unknown key "default" in the config. Known keys: ${KNOWN_KEYS}.`,
            `Unknown key "default" in the config. Known keys: ${KNOWN_KEYS}.`,
          ]);
        });

        it('still reports default and __esModule in a JSON config', () => {
          const expected = [
            'Invalid config (2 problems):',
            `  - Unknown key "default" in the config. Known keys: ${KNOWN_KEYS}.`,
            `  - Unknown key "__esModule" in the config. Known keys: ${KNOWN_KEYS}.`,
          ].join('\n');
          expect(
            bothLoadErrors('.madrlintrc.json', '{ "default": {}, "__esModule": true }\n'),
          ).toEqual([expected, expected]);
        });
      });

      it.for([
        ['madr-lint.config.mjs', 'export default Promise.resolve({ rules: {} });\n'],
        ['madr-lint.config.mjs', 'export default (async () => ({ rules: {} }))();\n'],
        // jiti hands a Promise from module.exports back unwrapped, so this one
        // arrives as a module without a default export.
        ['madr-lint.config.cjs', 'module.exports = (async () => ({ rules: {} }))();\n'],
      ] as const)('rejects an async config in %s: %j', ([name, content]) => {
        const expected = PROMISE_ERROR;
        expect(bothLoadErrors(name, content)).toEqual([expected, expected]);
      });

      // Every object would otherwise inherit a known key and look like a config.
      it('does not count a known key added to Object.prototype as looking like a config', () => {
        const [message] = withObjectPrototypeKey('rules', {}, () =>
          bothLoadErrors('madr-lint.config.cjs', 'exports.helper = { a: 1 };\n'),
        );
        expect(message).toBe(`Unknown key "helper" in the config. Known keys: ${KNOWN_KEYS}.`);
      });

      // An explicit, enumerable `exports.__esModule = true` declares ESM interop
      // just like jiti's own marker, so the module counts as ESM-shaped.
      it('adds the generic note for CommonJS with an enumerable __esModule flag', () => {
        const [message] = bothLoadErrors(
          'madr-lint.config.cjs',
          'exports.__esModule = true;\nexports.rule = {};\n',
        );
        expect(message).toBe(
          ['Unknown key "rule" in the config. Did you mean "rules"?', NO_DEFAULT_EXPORT_NOTE].join(
            '\n',
          ),
        );
      });

      it('rejects unknown keys in .madrlintrc.json without the hint', () => {
        const expected = [
          'Invalid config (2 problems):',
          '  - Unknown key "rule" in the config. Did you mean "rules"?',
          '  - Unknown key "adrdir" in the config. Did you mean "adrDir"?',
        ].join('\n');
        expect(
          bothLoadErrors(
            '.madrlintrc.json',
            '{ "rule": { "madr/status-enum": "off" }, "adrdir": "x" }\n',
          ),
        ).toEqual([expected, expected]);
      });

      it('reports __proto__ in a JSON config as an unknown key', () => {
        const [message] = bothLoadErrors('.madrlintrc.json', '{ "__proto__": {} }\n');
        expect(message).toBe(
          `Unknown key "__proto__" in the config. Known keys: ${KNOWN_KEYS}.`,
        );
      });

      it.for([
        ['madr-lint.config.mjs', 'export default () => ({ rules: {} });\n', 'a function'],
        ['madr-lint.config.mjs', 'export default undefined;\n', 'undefined'],
        ['madr-lint.config.ts', 'export default undefined;\n', 'undefined'],
        ['madr-lint.config.mjs', 'export default null;\n', 'null'],
        ['madr-lint.config.mjs', 'export default [];\n', '[]'],
        ['madr-lint.config.mjs', 'export default "x";\n', '"x"'],
        ['madr-lint.config.cjs', 'module.exports = () => ({ rules: {} });\n', 'a function'],
        ['madr-lint.config.cjs', 'module.exports = undefined;\n', 'undefined'],
        ['madr-lint.config.cjs', 'module.exports = null;\n', 'null'],
        // Worked before #222: the named export was read when the default was
        // undefined. The default export is what was written, so it wins.
        [
          'madr-lint.config.mjs',
          'export default undefined;\nexport const rules = {};\n',
          'undefined',
        ],
        ['.madrlintrc.json', '[]\n', '[]'],
        ['.madrlintrc.json', '"x"\n', '"x"'],
        ['.madrlintrc.json', 'null\n', 'null'],
        ['.madrlintrc.json', '42\n', '42'],
      ] as const)('rejects %s containing %j as not an object', ([name, content, shown]) => {
        const expected = `The config must be an object, not ${shown}.`;
        expect(bothLoadErrors(name, content)).toEqual([expected, expected]);
      });

      describe('configs that worked before keep working', () => {
        it('reads named exports that are all known keys', () => {
          const config = bothLoad(
            'madr-lint.config.mjs',
            'export const rules = { "madr/status-enum": "off" };\nexport const adrDir = "decisions";\n',
          );
          expect(config.rules).toEqual({ 'madr/status-enum': 'off' });
          expect(config.adrDir).toBe('decisions');
        });

        it('reads module.exports', () => {
          expect(
            bothLoad('madr-lint.config.cjs', 'module.exports = { adrDir: "cjs" };\n').adrDir,
          ).toBe('cjs');
        });

        it('reads export default defineConfig(...)', () => {
          const config = bothLoad(
            'madr-lint.config.ts',
            `import { defineConfig } from ${JSON.stringify(SRC_INDEX)};\nexport default defineConfig({ adrDir: "defined", rules: { "madr/status-enum": "off" } });\n`,
          );
          expect(config.adrDir).toBe('defined');
          expect(config.rules).toEqual({ 'madr/status-enum': 'off' });
        });

        it('reads the default export and ignores other named exports', () => {
          expect(
            bothLoad(
              'madr-lint.config.mjs',
              'export default { adrDir: "d" };\nexport const helper = 1;\n',
            ).adrDir,
          ).toBe('d');
        });

        it('reads a default export defined by a getter', () => {
          expect(
            bothLoad(
              'madr-lint.config.cjs',
              'Object.defineProperty(exports, "__esModule", { value: true });\nObject.defineProperty(exports, "default", { enumerable: true, get() { return { adrDir: "getter" }; } });\n',
            ).adrDir,
          ).toBe('getter');
        });

        it('reads a config that spreads a default-imported CommonJS helper', () => {
          writeFileSync(join(dir, 'base.cjs'), 'module.exports = { adrDir: "from-base" };\n');
          expect(
            bothLoad(
              'madr-lint.config.mjs',
              'import base from "./base.cjs";\nexport default { ...base };\n',
            ).adrDir,
          ).toBe('from-base');
        });

        it.for([
          ['madr-lint.config.ts', 'export {};\n'],
          ['madr-lint.config.mjs', ''],
          ['madr-lint.config.cjs', ''],
          ['.madrlintrc.json', '{}\n'],
        ] as const)('treats an empty %s as the defaults', ([name, content]) => {
          expect(bothLoad(name, content)).toEqual(resolveExtends({}));
        });

        it.for([
          ['json', '.madrlintrc.json'],
          ['ts', 'madr-lint.config.ts'],
        ] as const)('loads the %s config that init writes', ([format, name]) => {
          // The scaffold imports from the published package; point it at the
          // source so the temp dir does not need node_modules.
          const content = renderConfig(format, {
            adrDir: 'docs/decisions',
            madrVersion: 'v3',
          }).replace("'madr-lint'", JSON.stringify(SRC_INDEX));
          const config = bothLoad(name, content);
          expect(config.adrDir).toBe('docs/decisions');
          expect(config.madrVersion).toBe('v3');
          expect(config.rules).toEqual(recommended);
        });
      });
    });
  });
});
