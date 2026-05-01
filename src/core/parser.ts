import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import grayMatter from 'gray-matter';

export interface ParsedFile {
  /** Parsed YAML frontmatter, or null if absent. */
  frontmatter: Record<string, unknown> | null;
  /** mdast root of the body (frontmatter stripped). */
  ast: Root;
  /** Body content with frontmatter stripped. */
  body: string;
}

/**
 * Parse a Markdown file: extract YAML frontmatter via gray-matter, then
 * feed the body into mdast-util-from-markdown directly (per ADR-0002,
 * we skip the unified+remark pipeline overhead).
 */
export function parseFile(content: string): ParsedFile {
  const matter = grayMatter(content);
  const data = matter.data as Record<string, unknown>;
  const frontmatter = Object.keys(data).length > 0 ? data : null;
  const ast = fromMarkdown(matter.content);
  return { frontmatter, ast, body: matter.content };
}
