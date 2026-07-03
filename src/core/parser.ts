import type { List, ListItem, Paragraph, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';
import grayMatter from 'gray-matter';

/** Source position of a metadata list item, in body coordinates. */
export interface MetadataPosition {
  line: number;
  column: number;
}

export interface ParsedFile {
  /** Parsed YAML frontmatter (v3/v4), or null if absent. */
  frontmatter: Record<string, unknown> | null;
  /**
   * v2 body-list metadata extracted from the leading list, or null if absent.
   * Covers both the bold-key (`- **Status**:`) and the canonical MADR v2.1.2
   * plain-key (`* Status:`) shapes. See ADR-0006.
   */
  listMetadata: Record<string, unknown> | null;
  /**
   * Combined metadata: frontmatter merged with bold-list. Frontmatter wins
   * on key conflict. null only when both are absent. See ADR-0006.
   */
  metadata: Record<string, unknown> | null;
  /**
   * Body-coordinate positions (list item start) for metadata keys whose
   * EFFECTIVE value came from the v2 leading list. Keys won by defined
   * frontmatter values are absent: frontmatter is stripped before mdast
   * parsing, so it has no body line — and inline suppression directives
   * (which live in the body) could not target it anyway. null when no
   * effective value is list-sourced.
   */
  metadataLoc: Record<string, MetadataPosition> | null;
  /** mdast root of the body (frontmatter stripped). */
  ast: Root;
  /** Body content with frontmatter stripped. */
  body: string;
}

/**
 * Parse a Markdown file: extract YAML frontmatter via gray-matter, then
 * feed the body into mdast-util-from-markdown directly (per ADR-0002,
 * we skip the unified+remark pipeline overhead). Additionally, extract
 * v2-style list metadata from the body's first list — both bold-key and
 * canonical plain-key shapes (see ADR-0006).
 */
export function parseFile(content: string): ParsedFile {
  const matter = grayMatter(content);
  const data = matter.data as Record<string, unknown>;
  const frontmatter = Object.keys(data).length > 0 ? data : null;
  const ast = fromMarkdown(matter.content);
  const listResult = extractListMetadataWithLoc(ast);
  const listMetadata = listResult?.values ?? null;

  let metadata: Record<string, unknown> | null = null;
  let metadataLoc: Record<string, MetadataPosition> | null =
    listResult && Object.keys(listResult.loc).length > 0
      ? { ...listResult.loc }
      : null;
  if (frontmatter && listMetadata) {
    // Frontmatter wins on conflict, BUT explicit null/undefined are
    // skipped so that `status: ~` in YAML doesn't blank a present
    // list value (counterintuitive UX otherwise).
    const frontmatterDefined: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(frontmatter)) {
      if (v !== null && v !== undefined) frontmatterDefined[k] = v;
    }
    metadata = { ...listMetadata, ...frontmatterDefined };
    // A frontmatter-won key's effective value is not in the body, so it
    // must not advertise the (shadowed) list item's position.
    if (metadataLoc) {
      for (const k of Object.keys(frontmatterDefined)) delete metadataLoc[k];
      if (Object.keys(metadataLoc).length === 0) metadataLoc = null;
    }
  } else if (frontmatter) {
    metadata = frontmatter;
  } else if (listMetadata) {
    metadata = listMetadata;
  }

  return {
    frontmatter,
    listMetadata,
    metadata,
    metadataLoc,
    ast,
    body: matter.content,
  };
}

// Canonical MADR metadata field names across v2/v3/v4 (after key
// normalization). Used to distinguish a genuine metadata block from an
// ordinary leading list: the plain-key shape (`Foo: bar`) is syntactically
// identical to prose bullets, so we only promote a list to metadata when it
// carries at least one of these keys. The set is deliberately the canonical
// fields — a list keyed only by non-standard fields (e.g. `Tags`, `Author`)
// is treated as prose, not metadata. See the dogfooding notes in ADR-0006.
const RECOGNIZED_METADATA_KEYS = new Set([
  'status',
  'date',
  'deciders',
  'decision-makers',
  'consulted',
  'informed',
]);

/**
 * Extract v2-style list metadata from an mdast Root. The metadata block is
 * the leading list — the first block after the H1 title (only headings may
 * precede it; an intervening paragraph means the list is body content, not
 * metadata). Each `listItem` is read as one `Key: value` pair in either of
 * two shapes:
 *
 *   - Bold key:  `- **Status**: accepted`  (some MADR v2 authors)
 *   - Plain key: `* Status: accepted`      (official MADR v2.1.2 template)
 *
 * Key normalization: trim → lowercase → spaces become hyphens
 * (matches v4 frontmatter convention, e.g. "Decision Makers" →
 * "decision-makers"). On duplicate keys, first occurrence wins.
 *
 * Returns null unless the list carries a recognized MADR key, so ordinary
 * leading prose lists are not mistaken for metadata. (A leading list keyed by
 * a recognized field is still treated as metadata even if its value reads
 * prose-like, e.g. `Status: under discussion` — that position + key is
 * overwhelmingly metadata; this is an intentional, bounded tradeoff.)
 *
 * Because the result is gated on MADR field names, callers using this as a
 * generic list reader will get null for purely non-MADR lists.
 */
export function extractListMetadata(
  ast: Root,
): Record<string, unknown> | null {
  return extractListMetadataWithLoc(ast)?.values ?? null;
}

/**
 * Position-carrying variant used by parseFile: alongside the values, records
 * each key's list-item start position (body coordinates) so diagnostics on
 * list-sourced metadata can carry a line — which is what makes inline
 * suppression directives able to target them.
 */
function extractListMetadataWithLoc(ast: Root): {
  values: Record<string, unknown>;
  loc: Record<string, MetadataPosition>;
} | null {
  let firstList: List | null = null;
  for (const child of ast.children) {
    if (child.type === 'heading') {
      if (child.depth >= 2) break; // reached the first H2 — no metadata block
      continue; // skip the H1 title (and any further headings)
    }
    // Leading HTML comments / markers don't displace the metadata block.
    if (child.type === 'html') continue;
    if (child.type === 'list') {
      firstList = child;
      break;
    }
    // Any other leading block (paragraph, code, thematic break, …) means the
    // metadata block — which must lead — is absent; the list, if any, is prose.
    break;
  }

  if (!firstList) return null;

  const values: Record<string, unknown> = {};
  const loc: Record<string, MetadataPosition> = {};
  for (const item of firstList.children) {
    const pair = extractListItemKV(item);
    if (pair && !(pair.key in values)) {
      values[pair.key] = pair.value;
      const start = item.position?.start;
      if (start) loc[pair.key] = { line: start.line, column: start.column };
    }
  }

  const hasRecognizedKey = Object.keys(values).some((k) =>
    RECOGNIZED_METADATA_KEYS.has(k),
  );
  return hasRecognizedKey ? { values, loc } : null;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9 \-_]*$/;
const SEPARATOR_PATTERN = /^\s*:\s*/;

function normalizeKey(rawKey: string): string {
  return rawKey.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Read a single `Key: value` pair from one list item. Returns null for any
 * item not shaped as metadata. Two shapes are supported:
 *
 *   - Bold key:  paragraph starts with `strong` (the Key), followed by a
 *     `: value` text node and optional inline tail.
 *   - Plain key: paragraph starts with a `text` node holding `Key: value`,
 *     followed by optional inline tail.
 *
 * In both shapes the value's inline tail (links, code, emphasis) is
 * flattened via mdast-util-to-string so values keep their text.
 */
function extractListItemKV(
  item: ListItem,
): { key: string; value: string } | null {
  const para = item.children[0];
  if (para?.type !== 'paragraph') return null;

  const paragraph = para as Paragraph;
  const first = paragraph.children[0];
  if (!first) return null;

  // Bold key: `**Key**` then a separator text node carrying `: value`.
  if (first.type === 'strong') {
    const keyNode = first.children[0];
    if (keyNode?.type !== 'text' || !KEY_PATTERN.test(keyNode.value)) {
      return null;
    }

    const sep = paragraph.children[1];
    if (sep?.type !== 'text' || !SEPARATOR_PATTERN.test(sep.value)) return null;

    const valueHead = sep.value.replace(SEPARATOR_PATTERN, '');
    const valueTail = paragraph.children
      .slice(2)
      .map((n) => toString(n))
      .join('');
    const value = (valueHead + valueTail).trim();
    if (value === '') return null;

    return { key: normalizeKey(keyNode.value), value };
  }

  // Plain key (canonical MADR v2.1.2): first text node holds `Key: value`.
  if (first.type === 'text') {
    const colonIdx = first.value.indexOf(':');
    if (colonIdx === -1) return null;

    const rawKey = first.value.slice(0, colonIdx);
    if (!KEY_PATTERN.test(rawKey)) return null;

    const valueHead = first.value.slice(colonIdx + 1).replace(/^\s+/, '');
    const valueTail = paragraph.children
      .slice(1)
      .map((n) => toString(n))
      .join('');
    const value = (valueHead + valueTail).trim();
    if (value === '') return null;

    return { key: normalizeKey(rawKey), value };
  }

  return null;
}
