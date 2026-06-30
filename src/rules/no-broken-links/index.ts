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

function stripAnchorAndQuery(url: string): string {
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  let cut = hash;
  if (query !== -1 && (cut === -1 || query < cut)) cut = query;
  return cut === -1 ? url : url.slice(0, cut);
}

// Markdown link destinations may be percent-encoded (e.g. `my%20file.md`).
// Decode to the real on-disk path for resolution; leave malformed encoding
// (e.g. a bare `%`) untouched rather than throwing. Fast-path the common case
// of no percent-encoding to keep per-link cost minimal (decodeURIComponent is
// comparatively expensive).
function safeDecode(path: string): string {
  if (!path.includes('%')) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
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

        const pathOnly = safeDecode(stripAnchorAndQuery(url));
        if (pathOnly === '') continue;

        const fileDir = dirname(file.path);
        const resolvedPath = resolveRelative(fileDir, pathOnly);

        // A target counts as present if it is one of the linted .md files
        // OR exists on disk (covers non-Markdown assets and files outside
        // the scanned paths). fileExists is undefined in pure in-memory
        // runs, where knownPaths is the only source of truth. NOTE: the
        // on-disk check inherits the host filesystem's case-sensitivity —
        // a wrong-case link may pass on macOS/Windows yet fail on Linux/CI.
        const exists =
          knownPaths.has(resolvedPath) ||
          (context.fileExists?.(resolvedPath) ?? false);

        if (!exists) {
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
