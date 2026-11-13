import { describe, expect, it } from 'vitest';
import { closestMatch } from '../../src/core/suggest.js';
import * as builtinRules from '../../src/rules/index.js';

const CONFIG_KEYS = [
  'extends',
  'madrVersion',
  'adrDir',
  'rules',
  'ignorePatterns',
  'cache',
  'cacheLocation',
];
const RULE_IDS = Object.values(builtinRules).map((rule) => rule.meta.name);
const PRESETS = ['madr-lint:recommended'];

describe('core/suggest closestMatch', () => {
  it.for([
    ['rule', 'rules'],
    ['Rules', 'rules'],
    ['rulse', 'rules'],
    ['extend', 'extends'],
    ['extends_', 'extends'],
    ['adr_dir', 'adrDir'],
    ['adrdir', 'adrDir'],
    ['adr-dir', 'adrDir'],
    ['ADRDIR', 'adrDir'],
    ['ignorePattern', 'ignorePatterns'],
    ['cachelocation', 'cacheLocation'],
    ['cache_location', 'cacheLocation'],
    ['cachLocation', 'cacheLocation'],
    ['madr_version', 'madrVersion'],
    ['madrversion', 'madrVersion'],
  ] as const)('suggests a config key for %s', ([value, expected]) => {
    expect(closestMatch(value, CONFIG_KEYS)).toBe(expected);
  });

  // ESLint-style keys and other short words that are not typos of a key.
  it.for([
    'files',
    'ignore',
    'ignores',
    'cacheDir',
    'version',
    'plugins',
    'overrides',
    'config',
    'default',
  ])('suggests no config key for %s', (value) => {
    expect(closestMatch(value, CONFIG_KEYS)).toBeUndefined();
  });

  it.for([
    ['madr/status-enmu', 'madr/status-enum'],
    ['status-enum', 'madr/status-enum'],
  ] as const)('still suggests the rule ID for %s (#206)', ([value, expected]) => {
    expect(closestMatch(value, RULE_IDS)).toBe(expected);
  });

  it.for([
    ['madr-lint:recomended', 'madr-lint:recommended'],
    ['recommended', 'madr-lint:recommended'],
  ] as const)('still suggests the preset for %s (#206)', ([value, expected]) => {
    expect(closestMatch(value, PRESETS)).toBe(expected);
  });
});
