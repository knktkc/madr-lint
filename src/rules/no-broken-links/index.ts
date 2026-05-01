import { dirname, posix } from 'node:path';
import type { MdastNode, ProjectRule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface NoBrokenLinksOptions extends Record<string, unknown> {
  // No options at v0.1.
}

const PROTOCOL_REGEX = /^[a-z][a-z0-9+.-]*:/i;

interface LinkLikeNode {
  url: string;
}

function isLinkNode(node: MdastNode): node is MdastNode & LinkLikeNode {
  return (
    node.type === 'link' &&
    'url' in node &&
    typeof (node as { url: unknown }).url === 'string'
  );
}

function isExternalOrAnchor(url: string): boolean {
  if (url === '' || url.startsWith('#')) return true;
  return PROTOCOL_REGEX.test(url);
}

function stripAnchor(url: string): string {
  const hashIdx = url.indexOf('#');
  return hashIdx === -1 ? url : url.slice(0, hashIdx);
}

function resolveRelative(fromDir: string, url: string): string {
  // Treat absolute (`/foo`) as project-rooted by stripping the leading slash,
  // so `[x](/0042-y.md)` resolves to `0042-y.md` rather than the OS root.
  if (url.startsWith('/')) return url.slice(1);
  return posix.normalize(posix.join(fromDir, url));
}

function collectLinks(node: MdastNode, out: LinkLikeNode[]): void {
  if (isLinkNode(node)) out.push(node);
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      collectLinks(child as MdastNode, out);
    }
  }
}

const rule: ProjectRule<NoBrokenLinksOptions> = {
  meta: {
    name: 'madr/no-broken-links',
    type: 'project',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description:
        'Relative-path Markdown links must resolve to an existing file in the project',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/no-broken-links.md',
      recommended: true,
    },
    messages: {
      brokenLink:
        'Link to "{{url}}" resolves to "{{resolvedPath}}", which does not exist in the project',
    },
    defaultOptions: {},
    schema,
  },
  check(context) {
    const knownPaths = new Set<string>();
    for (const file of context.files) {
      knownPaths.add(file.path);
    }

    for (const file of context.files) {
      const links: LinkLikeNode[] = [];
      collectLinks(file.ast, links);

      for (const link of links) {
        const url = link.url;
        if (isExternalOrAnchor(url)) continue;

        const pathOnly = stripAnchor(url);
        if (pathOnly === '') continue;

        const fileDir = dirname(file.path);
        const resolvedPath = resolveRelative(fileDir, pathOnly);

        if (!knownPaths.has(resolvedPath)) {
          context.report({
            messageId: 'brokenLink',
            path: file.path,
            data: { url, resolvedPath },
          });
        }
      }
    }
  },
};

export default rule;
