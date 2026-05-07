import { describe, it, expect } from 'vitest';
import { extractBoldListMetadata, parseFile } from '../../src/core/parser.js';
import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

function ast(md: string): Root {
  return fromMarkdown(md);
}

describe('parser/extractBoldListMetadata', () => {
  it('extracts a single key/value pair', () => {
    const md = '# T\n\n- **Status**: Proposed\n';
    expect(extractBoldListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });

  it('extracts multiple key/value pairs from one list', () => {
    const md = [
      '# T',
      '',
      '- **Status**: Proposed',
      '- **Date**: 2026-05-01',
      '- **Deciders**: knktkc',
    ].join('\n');
    expect(extractBoldListMetadata(ast(md))).toEqual({
      status: 'Proposed',
      date: '2026-05-01',
      deciders: 'knktkc',
    });
  });

  it('normalizes keys: lowercase + spaces to hyphens', () => {
    const md = '# T\n\n- **Decision Makers**: knktkc\n';
    expect(extractBoldListMetadata(ast(md))).toEqual({
      'decision-makers': 'knktkc',
    });
  });

  it('only considers the FIRST list before any H2 heading', () => {
    const md = [
      '# T',
      '',
      '- **Status**: Proposed',
      '',
      '## Context',
      '',
      '- **NotMetadata**: nope',
    ].join('\n');
    expect(extractBoldListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });

  it('returns null when no list precedes the first H2', () => {
    const md = '# T\n\n## Context\n\nNo list.\n';
    expect(extractBoldListMetadata(ast(md))).toBeNull();
  });

  it('returns null for an empty doc', () => {
    expect(extractBoldListMetadata(ast(''))).toBeNull();
  });

  it('skips list items not shaped as `- **Key**: value`', () => {
    const md = [
      '# T',
      '',
      '- not a kv item',
      '- **Status**: Proposed',
      '- **BadKey!**: ignored',
      '- **Date**: 2026-05-01',
    ].join('\n');
    expect(extractBoldListMetadata(ast(md))).toEqual({
      status: 'Proposed',
      date: '2026-05-01',
    });
  });

  it('first occurrence wins on duplicate keys', () => {
    const md = '# T\n\n- **Status**: Proposed\n- **Status**: Accepted\n';
    expect(extractBoldListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });

  it('preserves inline value text via mdast-util-to-string', () => {
    const md = '# T\n\n- **Status**: superseded by `ADR-0042`\n';
    expect(extractBoldListMetadata(ast(md))).toEqual({
      status: 'superseded by ADR-0042',
    });
  });

  it('handles colon with no leading space', () => {
    const md = '# T\n\n- **Status**:Proposed\n';
    expect(extractBoldListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });
});

describe('parser/parseFile metadata combination', () => {
  it('frontmatter only → metadata equals frontmatter', () => {
    const parsed = parseFile('---\nstatus: accepted\n---\n\n# T\n');
    expect(parsed.frontmatter).toEqual({ status: 'accepted' });
    expect(parsed.boldListMetadata).toBeNull();
    expect(parsed.metadata).toEqual({ status: 'accepted' });
  });

  it('bold-list only → metadata equals bold-list', () => {
    const parsed = parseFile('# T\n\n- **Status**: Proposed\n');
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.boldListMetadata).toEqual({ status: 'Proposed' });
    expect(parsed.metadata).toEqual({ status: 'Proposed' });
  });

  it('both: frontmatter wins on conflict', () => {
    const parsed = parseFile(
      '---\nstatus: accepted\n---\n\n# T\n\n- **Status**: Proposed\n- **Date**: 2026-05-01\n',
    );
    expect(parsed.frontmatter).toEqual({ status: 'accepted' });
    expect(parsed.boldListMetadata).toEqual({
      status: 'Proposed',
      date: '2026-05-01',
    });
    // status from frontmatter, date from bold-list
    expect(parsed.metadata).toEqual({
      status: 'accepted',
      date: '2026-05-01',
    });
  });

  it('neither → metadata is null', () => {
    const parsed = parseFile('# Just body\n\nNo metadata here.\n');
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.boldListMetadata).toBeNull();
    expect(parsed.metadata).toBeNull();
  });
});
