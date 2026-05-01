import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/filename-format/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures/filename-format');

describe('madr/filename-format', () => {
  describe('valid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'valid'))) {
      it(`${file} produces no diagnostics`, () => {
        const content = readFileSync(join(fixturesDir, 'valid', file), 'utf8');
        expect(runRule(rule, { content, path: file })).toEqual([]);
      });
    }
  });

  describe('invalid fixtures', () => {
    for (const file of readdirSync(join(fixturesDir, 'invalid'))) {
      it(`${file} produces invalidFilename diagnostic`, () => {
        const content = readFileSync(join(fixturesDir, 'invalid', file), 'utf8');
        const diagnostics = runRule(rule, { content, path: file });
        expect(diagnostics, `expected exactly one diagnostic for ${file}`).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleName: 'madr/filename-format',
          messageId: 'invalidFilename',
          severity: 'error',
          path: file,
          data: {
            filename: file,
            expected: '^[0-9]{4}-[a-z0-9-]+\\.md$',
          },
        });
      });
    }
  });
});
