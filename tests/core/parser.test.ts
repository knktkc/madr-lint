import { describe, it, expect } from 'vitest';
import { extractListMetadata, parseFile } from '../../src/core/parser.js';
import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

function ast(md: string): Root {
  return fromMarkdown(md);
}

describe('parser/extractListMetadata', () => {
  it('extracts a single key/value pair', () => {
    const md = '# T\n\n- **Status**: Proposed\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });

  it('extracts multiple key/value pairs from one list', () => {
    const md = [
      '# T',
      '',
      '- **Status**: Proposed',
      '- **Date**: 2026-05-01',
      '- **Deciders**: knktkc',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'Proposed',
      date: '2026-05-01',
      deciders: 'knktkc',
    });
  });

  it('normalizes keys: lowercase + spaces to hyphens', () => {
    const md = '# T\n\n- **Decision Makers**: knktkc\n';
    expect(extractListMetadata(ast(md))).toEqual({
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
    expect(extractListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });

  it('returns null when no list precedes the first H2', () => {
    const md = '# T\n\n## Context\n\nNo list.\n';
    expect(extractListMetadata(ast(md))).toBeNull();
  });

  it('returns null for an empty doc', () => {
    expect(extractListMetadata(ast(''))).toBeNull();
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
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'Proposed',
      date: '2026-05-01',
    });
  });

  it('first occurrence wins on duplicate keys', () => {
    const md = '# T\n\n- **Status**: Proposed\n- **Status**: Accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });

  it('preserves inline value text via mdast-util-to-string', () => {
    const md = '# T\n\n- **Status**: superseded by `ADR-0042`\n';
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'superseded by ADR-0042',
    });
  });

  it('handles colon with no leading space', () => {
    const md = '# T\n\n- **Status**:Proposed\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'Proposed' });
  });
});

// Canonical MADR v2.1.2 declares metadata with PLAIN (non-emphasized) keys
// and asterisk bullets: `* Status: accepted`. MADR even has ADRs rejecting
// emphasis (0007) and mandating asterisks (0011). The extractor must read
// these, not only the bold variant. See the dogfooding notes in ADR-0006.
describe('parser/extractListMetadata — plain (non-bold) v2 keys', () => {
  it('extracts a plain asterisk-bullet key/value pair', () => {
    const md = '# T\n\n* Status: accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('extracts a plain hyphen-bullet key/value pair', () => {
    const md = '# T\n\n- Status: accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('extracts the full canonical MADR v2 metadata block', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '* Deciders: toyota',
      '* Date: 2026-06-22',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      deciders: 'toyota',
      date: '2026-06-22',
    });
  });

  it('normalizes plain keys: lowercase + spaces to hyphens', () => {
    const md = '# T\n\n* Decision Makers: knktkc\n';
    expect(extractListMetadata(ast(md))).toEqual({
      'decision-makers': 'knktkc',
    });
  });

  it('preserves inline value (link) in a plain key item', () => {
    const md = '# T\n\n* Status: superseded by [ADR-0005](0005-x.md)\n';
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'superseded by ADR-0005',
    });
  });

  it('handles a plain key with no space after the colon', () => {
    const md = '# T\n\n* Status:accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('skips plain list items with no colon (not metadata)', () => {
    const md = [
      '# T',
      '',
      '* just a bullet with no colon',
      '* Status: accepted',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('skips plain items whose key fails the key pattern', () => {
    const md = '# T\n\n* Bad!Key: nope\n* Status: accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('mixes bold and plain keys in the same list', () => {
    // Same bullet marker → one mdast list; items may differ in key style.
    const md = [
      '# T',
      '',
      '- Status: accepted',
      '- **Date**: 2026-06-22',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026-06-22',
    });
  });
});

// The plain-key shape (`Foo: bar`) is syntactically identical to prose
// bullets, so the extractor must NOT promote ordinary leading lists to
// metadata. Two guards: (1) only headings may precede the metadata list;
// (2) the list must carry a recognized MADR key. See ADR-0006.
describe('parser/extractListMetadata — precision guards', () => {
  it('does not treat a prose list (no recognized key) as metadata', () => {
    const md = [
      '# T',
      '',
      '- See section 3: details',
      '- Option A: fast but costly',
      '',
      '## Context',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toBeNull();
  });

  it('does not treat a list of only custom keys as metadata', () => {
    const md = '# T\n\n* Author: foo\n* Ticket: bar\n';
    expect(extractListMetadata(ast(md))).toBeNull();
  });

  it('rejects a metadata-shaped list that follows an intervening paragraph', () => {
    const md = [
      '# T',
      '',
      'Some introductory prose before any metadata.',
      '',
      '- Status: draft',
      '',
      '## Context',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toBeNull();
  });

  it('still extracts a metadata list immediately after the H1', () => {
    const md = '# T\n\n- Status: accepted\n\nIntro after metadata.\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('keeps custom keys when a recognized key is present (whole block promoted)', () => {
    const md = [
      '# T',
      '',
      '- **DP-ID**: DP-1',
      '- **Status**: accepted',
      '- **Recorded by**: bot',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      'dp-id': 'DP-1',
      status: 'accepted',
      'recorded-by': 'bot',
    });
  });

  it('skips an empty-value item but keeps sibling metadata', () => {
    const md = '# T\n\n* Date: 2026-06-22\n* Status:\n';
    expect(extractListMetadata(ast(md))).toEqual({ date: '2026-06-22' });
  });

  it('extracts when the body starts with the list (no H1)', () => {
    const md = '* Status: accepted\n* Date: 2026-06-22\n';
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026-06-22',
    });
  });

  it('extracts a metadata list preceded only by a leading HTML comment', () => {
    const md = '# T\n\n<!-- editor marker -->\n\n* Status: accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });
});

describe('parser/parseFile metadata combination', () => {
  it('frontmatter only → metadata equals frontmatter', () => {
    const parsed = parseFile('---\nstatus: accepted\n---\n\n# T\n');
    expect(parsed.frontmatter).toEqual({ status: 'accepted' });
    expect(parsed.listMetadata).toBeNull();
    expect(parsed.metadata).toEqual({ status: 'accepted' });
  });

  it('bold-list only → metadata equals bold-list', () => {
    const parsed = parseFile('# T\n\n- **Status**: Proposed\n');
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.listMetadata).toEqual({ status: 'Proposed' });
    expect(parsed.metadata).toEqual({ status: 'Proposed' });
  });

  it('both: frontmatter wins on conflict', () => {
    const parsed = parseFile(
      '---\nstatus: accepted\n---\n\n# T\n\n- **Status**: Proposed\n- **Date**: 2026-05-01\n',
    );
    expect(parsed.frontmatter).toEqual({ status: 'accepted' });
    expect(parsed.listMetadata).toEqual({
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
    expect(parsed.listMetadata).toBeNull();
    expect(parsed.metadata).toBeNull();
  });
});

describe('parseFile — metadataLoc (list item positions for suppression)', () => {
  it('list-sourced keys carry the item position in body coordinates', () => {
    const parsed = parseFile('# T\n\n- Status: Proposed\n- Date: 2026-05-01\n');
    expect(parsed.metadataLoc).toEqual({
      status: { line: 3, column: 1 },
      date: { line: 4, column: 1 },
    });
  });

  it('positions are body-relative when frontmatter precedes the list', () => {
    const parsed = parseFile(
      '---\ndeciders: someone\n---\n# T\n\n- Status: Proposed\n',
    );
    // Body: "# T"(1), ""(2), "- Status: Proposed"(3).
    expect(parsed.metadataLoc).toEqual({ status: { line: 3, column: 1 } });
  });

  it('a key overridden by defined frontmatter has NO position (effective value is not in the body)', () => {
    const parsed = parseFile(
      '---\nstatus: accepted\n---\n# T\n\n- Status: Proposed\n- Date: 2026-05-01\n',
    );
    // status is won by frontmatter → line-less; date stays list-sourced.
    expect(parsed.metadataLoc).toEqual({ date: { line: 4, column: 1 } });
  });

  it('frontmatter-only files have null metadataLoc', () => {
    const parsed = parseFile('---\nstatus: accepted\n---\n# T\n');
    expect(parsed.metadataLoc).toBeNull();
  });

  it('files without metadata have null metadataLoc', () => {
    const parsed = parseFile('# T\n\nJust prose.\n');
    expect(parsed.metadataLoc).toBeNull();
  });
});
