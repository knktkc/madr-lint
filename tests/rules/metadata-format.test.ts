import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/metadata-format/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures/metadata-format');
const read = (name: string): string =>
  readFileSync(join(fixturesDir, name), 'utf8');

type Version = 'auto' | 'v2' | 'v3' | 'v4';

function lint(name: string, madrVersion: Version) {
  return runRule(rule, { content: read(name), path: name }, { madrVersion });
}

describe('madr/metadata-format', () => {
  describe('valid: the metadata format matches madrVersion', () => {
    it.for([
      ['frontmatter.md', 'v3'],
      ['frontmatter.md', 'v4'],
      ['body-list.md', 'v2'],
      ['both.md', 'v3'],
      ['both.md', 'v4'],
      // No metadata: every MADR metadata field is optional.
      ['no-metadata.md', 'v2'],
      ['no-metadata.md', 'v4'],
      // Site-generator frontmatter (Jekyll, Docusaurus) is not MADR metadata.
      ['site-frontmatter-list.md', 'v2'],
    ] as const)('%s under %s', ([name, version]) => {
      expect(lint(name, version)).toEqual([]);
    });

    it.for([
      'frontmatter.md',
      'body-list.md',
      'both.md',
      'no-metadata.md',
      'site-frontmatter-list.md',
    ])(
      '%s under auto (the version is detected from the format)',
      (name) => {
        expect(lint(name, 'auto')).toEqual([]);
      },
    );
  });

  describe('invalid: the metadata format does not match madrVersion', () => {
    it.for([
      ['body-list.md', 'v3'],
      ['body-list.md', 'v4'],
      ['site-frontmatter-list.md', 'v4'],
    ] as const)(
      '%s under %s reports expectedFrontmatter',
      ([name, version]) => {
        const diagnostics = lint(name, version);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleName: 'madr/metadata-format',
          messageId: 'expectedFrontmatter',
          severity: 'error',
          path: name,
          data: { version },
          docsUrl: 'https://knktkc.github.io/madr-lint/rules/metadata-format/',
        });
        expect(diagnostics[0]?.suggestion).toContain('YAML frontmatter');
      },
    );

    it.for(['frontmatter.md', 'both.md'])(
      '%s under v2 reports expectedList',
      (name) => {
        const diagnostics = lint(name, 'v2');
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleName: 'madr/metadata-format',
          messageId: 'expectedList',
          data: { version: 'v2' },
        });
        expect(diagnostics[0]?.suggestion).toContain('* Status:');
      },
    );
  });
});
