import { describe, it, expect } from 'vitest';
import { extractListMetadata, parseFile } from '../../src/core/parser.js';
import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

function ast(md: string): Root {
  return fromMarkdown(md);
}

/** The exact document from #73: a directive between two v2 metadata items. */
const issueFile = [
  '# 0001 test',
  '',
  '* Status: accepted',
  '<!-- madr-lint-disable-next-line madr/date-iso8601 -->',
  '* Date: 2026/07/06',
  '',
  '## Context and Problem Statement',
  '',
].join('\n');

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

// An HTML comment placed BETWEEN v2 metadata items ends the Markdown list per
// CommonMark, but renders as nothing — the block a reader sees is still one
// metadata block. The extractor therefore reads the leading RUN of lists joined
// across comment-only html nodes (#73). Only comments bridge; every other block
// type still ends the block. See ADR-0006 refinement 4.
describe('parser/extractListMetadata — comment-split metadata block (#73)', () => {
  it('merges leading list segments split by a directive comment (#73)', () => {
    expect(extractListMetadata(ast(issueFile))).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
  });

  it('merges across an ordinary (non-directive) comment too', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '<!-- reviewers: see PR #12 -->',
      '* Date: 2026/07/06',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
  });

  it('merges when blank lines surround the comment', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '',
      '<!-- c -->',
      '',
      '* Date: 2026/07/06',
      '',
    ].join('\n');
    expect(parseFile(md).metadataLoc).toEqual({
      status: { line: 3, column: 1 },
      date: { line: 7, column: 1 },
    });
  });

  it('chains across two stacked comment nodes', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '<!-- a -->',
      '<!-- b -->',
      '* Date: 2026/07/06',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
  });

  it('merges split segments in the bold-key v2 shape', () => {
    const md = '# T\n\n- **Status**: accepted\n<!-- c -->\n- **Date**: 2026/07/06\n';
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
  });

  it('merges three segments bridged by two comments, each key keeping its own line', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '<!-- a -->',
      '* Date: 2026/07/06',
      '<!-- b -->',
      '* Deciders: alice',
      '',
    ].join('\n');
    expect(parseFile(md).metadataLoc).toEqual({
      status: { line: 3, column: 1 },
      date: { line: 5, column: 1 },
      deciders: { line: 7, column: 1 },
    });
  });

  it('duplicate key across segments keeps the first occurrence', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '<!-- c -->',
      '* Status: rejected',
      '* Date: 2026-05-01',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026-05-01',
    });
  });

  it('a recognized key in a later segment promotes the block from null to metadata', () => {
    const md = [
      '# T',
      '',
      '* apples',
      '* bananas',
      '',
      '<!-- note -->',
      '',
      '* Status: accepted',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('documents the accepted over-merge of a prose list bridged by a comment', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '* Date: 2026-05-01',
      '',
      '<!-- note -->',
      '',
      '* Note: hello',
      '* plain bullet',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026-05-01',
      note: 'hello',
    });
  });

  // Bridging positives. The predicate deliberately admits shapes suppression.ts
  // rejects as directives (coalesced / space-separated comments): the parser
  // asks "does a reader see this?", not "is this a madr-lint directive?".
  const bridgingHtml: Array<[string, string]> = [
    ['a single comment', '<!-- c -->'],
    ['two coalesced comments', '<!-- a --><!-- b -->'],
    ['two space-separated comments', '<!-- a --> <!-- b -->'],
    ['the empty-comment form', '<!-->'],
    ['a multi-line comment', '<!--\nnote\n-->'],
  ];

  for (const [label, html] of bridgingHtml) {
    it(`bridges across ${label}`, () => {
      const md = `# T\n\n* Status: accepted\n${html}\n* Date: 2026/07/06\n`;
      expect(extractListMetadata(ast(md))).toEqual({
        status: 'accepted',
        date: '2026/07/06',
      });
    });
  }

  // Boundary guards. These pass both before and after the fix: they pin what
  // does NOT bridge, which is the whole safety argument for widening the scan.
  const nonBridgingHtml: Array<[string, string]> = [
    ['a visible word after the comment', '<!-- a --> visible'],
    ['visible text between two comments', '<!-- a --> visible <!-- b -->'],
    ['a stray end marker after the comment', '<!-- a -->x-->'],
  ];

  for (const [label, html] of nonBridgingHtml) {
    it(`does not bridge across an html node with ${label}`, () => {
      const md = `# T\n\n* Status: accepted\n${html}\n* Date: 2026/07/06\n`;
      expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
    });
  }

  it('does not bridge across an html node that merely ends with a comment', () => {
    // HTML block type 6 runs to the next blank line, so the visible <div> and
    // the comment under it coalesce into ONE html node ending in `-->`.
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '<div class="x">hi</div>',
      '<!-- c -->',
      '',
      '* Date: 2026/07/06',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('does not bridge across visible HTML between segments', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '',
      '<div class="x">hi</div>',
      '',
      '* Date: 2026/07/06',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('does not pull a collapsed <details> block into metadata', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '',
      '<details><summary>Legacy</summary>',
      '',
      '* Deciders: bob',
      '* Consulted: nobody',
      '',
      '</details>',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  const terminators: Array<[string, string[]]> = [
    ['a paragraph', ['Some prose.']],
    ['a thematic break', ['---']],
    ['a fenced code block', ['```txt', 'x', '```']],
    ['a blockquote', ['> quoted']],
    ['an H1 heading', ['# Other']],
    ['an H2 heading', ['## Context']],
    ['visible HTML', ['<div class="x">hi</div>']],
    ['a collapsed <details> opener', ['<details><summary>Legacy</summary>']],
  ];

  for (const [label, block] of terminators) {
    it(`does not merge past ${label} following a bridging comment`, () => {
      const md = [
        '# T',
        '',
        '* Status: accepted',
        '<!-- c -->',
        '',
        ...block,
        '',
        '* Date: 2026/07/06',
        '',
      ].join('\n');
      expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
    });
  }

  it('does not merge two adjacent lists with no comment between them', () => {
    const md = '# T\n\n* Status: accepted\n- Date: 2026/07/06\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('a consumed bridge does not latch across a later marker change', () => {
    const md =
      '# T\n\n* Status: accepted\n<!-- c -->\n* Date: 2026/07/06\n- Deciders: alice\n';
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
  });

  it('a list with no bridge before it ends the block, even if a comment follows', () => {
    const md =
      '# T\n\n* Status: accepted\n- Date: 2026-05-01\n<!-- c -->\n* Deciders: alice\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('still reads metadata after a visible-HTML prologue (prologue rule unchanged)', () => {
    const md = '# T\n\n<div align="center">badge</div>\n\n* Status: accepted\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('a prologue comment does not arm a bridge for a later adjacent list', () => {
    // The prologue admits any html node; only the interior demands a comment.
    // Sharing one `bridged = true` branch between the two would let a leading
    // marker bridge a marker-change split that has no comment at all.
    const md =
      '# T\n\n<!-- editor marker -->\n\n* Status: accepted\n- Date: 2026/07/06\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('cannot recover an item swallowed by an HTML block on the line above', () => {
    // CommonMark HTML block type 6 runs to the next blank line, so the `* Date:`
    // line is absorbed into the html node and never reaches the AST at all.
    const md =
      '# T\n\n* Status: accepted\n<div class="x">hi</div>\n* Date: 2026/07/06\n';
    expect(extractListMetadata(ast(md))).toEqual({ status: 'accepted' });
  });

  it('keeps the indented-comment workaround working (one list, both keys)', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '  <!-- madr-lint-disable-next-line madr/date-iso8601 -->',
      '* Date: 2026/07/06',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
  });

  it('a trailing comment before the first H2 leaves the block intact', () => {
    const md = [
      '# T',
      '',
      '* Status: accepted',
      '* Date: 2026-05-01',
      '',
      '<!-- a trailing note -->',
      '',
      '## Context',
      '',
    ].join('\n');
    expect(extractListMetadata(ast(md))).toEqual({
      status: 'accepted',
      date: '2026-05-01',
    });
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

  it('a key after the comment keeps its own list-item position (#73)', () => {
    expect(parseFile(issueFile).metadataLoc).toEqual({
      status: { line: 3, column: 1 },
      date: { line: 5, column: 1 },
    });
  });

  it('the post-comment value offset slices back to the exact value (autofix range)', () => {
    const parsed = parseFile(issueFile);
    const at = parsed.body.indexOf('2026/07/06');
    expect(parsed.metadataValueLoc?.date).toEqual({ start: at, end: at + 10 });
    expect(parsed.body.slice(at, at + 10)).toBe('2026/07/06');
  });

  it('CRLF line endings keep loc and value offsets exact across the comment', () => {
    const parsed = parseFile(issueFile.replace(/\n/g, '\r\n'));
    expect(parsed.listMetadata?.date).toBe('2026/07/06');
    expect(parsed.metadataLoc?.date).toEqual({ line: 5, column: 1 });
    const range = parsed.metadataValueLoc?.date;
    expect(range).toBeDefined();
    expect(parsed.body.slice(range!.start, range!.end)).toBe('2026/07/06');
  });

  it('frontmatter still wins over a key found after the comment, and that key gets no body position', () => {
    const parsed = parseFile(
      "---\ndate: '2026-01-01'\n---\n# T\n\n* Status: accepted\n<!-- c -->\n* Date: 2026/07/06\n",
    );
    expect(parsed.listMetadata).toEqual({
      status: 'accepted',
      date: '2026/07/06',
    });
    expect(parsed.metadata).toEqual({ status: 'accepted', date: '2026-01-01' });
    expect(parsed.metadataLoc).toEqual({ status: { line: 3, column: 1 } });
    expect(Object.keys(parsed.metadataValueLoc ?? {})).toEqual(['status']);
  });
});
