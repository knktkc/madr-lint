import type { List, ListItem, Paragraph, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';
import grayMatter from 'gray-matter';

export interface ParsedFile {
  /** Parsed YAML frontmatter (v3/v4), or null if absent. */
  frontmatter: Record<string, unknown> | null;
  /** v2 bold-list metadata extracted from the body, or null if absent. */
  boldListMetadata: Record<string, unknown> | null;
  /**
   * Combined metadata: frontmatter merged with bold-list. Frontmatter wins
   * on key conflict. null only when both are absent. See ADR-0006.
   */
  metadata: Record<string, unknown> | null;
  /** mdast root of the body (frontmatter stripped). */
  ast: Root;
  /** Body content with frontmatter stripped. */
  body: string;
}

/**
 * Parse a Markdown file: extract YAML frontmatter via gray-matter, then
 * feed the body into mdast-util-from-markdown directly (per ADR-0002,
 * we skip the unified+remark pipeline overhead). Additionally, extract
 * v2-style bold-list metadata from the body's first list (see ADR-0006).
 */
export function parseFile(content: string): ParsedFile {
  const matter = grayMatter(content);
  const data = matter.data as Record<string, unknown>;
  const frontmatter = Object.keys(data).length > 0 ? data : null;
  const ast = fromMarkdown(matter.content);
  const boldListMetadata = extractBoldListMetadata(ast);

  let metadata: Record<string, unknown> | null = null;
  if (frontmatter && boldListMetadata) {
    // Frontmatter wins on conflict, BUT explicit null/undefined are
    // skipped so that `status: ~` in YAML doesn't blank a present
    // bold-list value (counterintuitive UX otherwise).
    const frontmatterDefined: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(frontmatter)) {
      if (v !== null && v !== undefined) frontmatterDefined[k] = v;
    }
    metadata = { ...boldListMetadata, ...frontmatterDefined };
  } else if (frontmatter) {
    metadata = frontmatter;
  } else if (boldListMetadata) {
    metadata = boldListMetadata;
  }

  return { frontmatter, boldListMetadata, metadata, ast, body: matter.content };
}

/**
 * Extract v2-style bold-list metadata from an mdast Root. Walks root
 * children looking for the FIRST `list` node before any heading deeper
 * than H1 (i.e. before `## ...`). Each `listItem` shaped as
 * `paragraph > strong (Key) > text(": ") > value` contributes one
 * Key/Value pair.
 *
 * Key normalization: trim → lowercase → spaces become hyphens
 * (matches v4 frontmatter convention, e.g. "Decision Makers" →
 * "decision-makers").
 *
 * On duplicate keys: first occurrence wins.
 */
export function extractBoldListMetadata(
  ast: Root,
): Record<string, unknown> | null {
  let firstList: List | null = null;
  for (const child of ast.children) {
    if (child.type === 'heading' && child.depth >= 2) break;
    if (child.type === 'list') {
      firstList = child;
      break;
    }
  }

  if (!firstList) return null;

  const result: Record<string, unknown> = {};
  for (const item of firstList.children) {
    const pair = extractListItemKV(item);
    if (pair && !(pair.key in result)) {
      result[pair.key] = pair.value;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9 \-_]*$/;
const SEPARATOR_PATTERN = /^\s*:\s*/;

function extractListItemKV(
  item: ListItem,
): { key: string; value: string } | null {
  const para = item.children[0];
  if (para?.type !== 'paragraph') return null;

  const paragraph = para as Paragraph;
  if (paragraph.children.length < 2) return null;

  const strong = paragraph.children[0];
  if (strong.type !== 'strong') return null;

  const keyText = strong.children[0];
  if (keyText?.type !== 'text') return null;
  const rawKey = keyText.value;
  if (!KEY_PATTERN.test(rawKey)) return null;

  const sep = paragraph.children[1];
  if (sep.type !== 'text') return null;
  const sepText = sep.value;
  if (!SEPARATOR_PATTERN.test(sepText)) return null;

  // Strip the leading `\s*:\s*` from the separator's text and join
  // any remaining inline content as the value.
  const valueAfterColon = sepText.replace(SEPARATOR_PATTERN, '');
  const restNodes = paragraph.children.slice(2);
  const restText = restNodes.map((n) => toString(n)).join('');
  const value = (valueAfterColon + restText).trim();
  if (value === '') return null;

  const key = rawKey.trim().toLowerCase().replace(/\s+/g, '-');
  return { key, value };
}
