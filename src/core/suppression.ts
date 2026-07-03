// Inline suppression directives (see issue #23).
//
// Rules stay completely unaware of suppression: they emit diagnostics as
// usual, and the runner / lint layer filters them centrally *after* reporting,
// using directives collected from the file's mdast `html` comment nodes.
//
// COORDINATE SYSTEM: directives are read from mdast `html` node positions.
// Because `parseFile` strips YAML frontmatter with gray-matter BEFORE feeding
// the body to `mdast-util-from-markdown`, every mdast position — and therefore
// every directive line AND every AST-derived diagnostic `loc.line` — lives in
// the same body coordinate space (frontmatter height removed). We deliberately
// do NOT scan the raw file text, which would put directive lines in raw-file
// coordinates and silently mis-align them with diagnostic lines.

import type { Root } from 'mdast';
import type { Diagnostic, MdastNode } from './types.js';
import { INTERNAL_ERROR_RULE_NAME } from './runner.js';

type DirectiveKind = 'disable-file' | 'disable' | 'enable' | 'disable-next-line';

// Only these exact keywords are directives. An unknown suffix (e.g.
// `madr-lint-disable-line`) is a full non-matching token and is ignored.
const DIRECTIVE_KINDS = new Set<DirectiveKind>([
  'disable-file',
  'disable',
  'enable',
  'disable-next-line',
]);

const PREFIX = 'madr-lint-';

interface Directive {
  kind: DirectiveKind;
  /** null = applies to all rules; otherwise the explicit rule-id list. */
  rules: readonly string[] | null;
  /** 1-based directive line in body (frontmatter-stripped) coordinates. */
  line: number;
}

interface NextLineEntry {
  all: boolean;
  rules: Set<string>;
}

export interface DirectiveIndex {
  /** An unscoped `disable-file` disables every rule for the whole file. */
  fileDisableAll: boolean;
  /** Rules disabled file-wide via `disable-file <rules>`. */
  fileDisableRules: Set<string>;
  /** `disable` / `enable` directives, sorted by line ascending. */
  ranged: Directive[];
  /** disable-next-line: target line (directive line + 1) → affected rules. */
  nextLine: Map<number, NextLineEntry>;
}

/** Parse one `<!-- ... -->` html node value into a directive, or null. */
function parseDirective(value: string, line: number): Directive | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('<!--') || !trimmed.endsWith('-->')) return null;

  const inner = trimmed.slice(4, -3).trim();
  if (!inner.startsWith(PREFIX)) return null;

  const afterPrefix = inner.slice(PREFIX.length);
  // The keyword token ends at the first whitespace; the remainder is the
  // optional rule list. Matching the FULL token against the exact keyword set
  // is what makes `madr-lint-disable-line` (token `disable-line`) a non-match.
  const wsIndex = afterPrefix.search(/\s/);
  const keyword = wsIndex === -1 ? afterPrefix : afterPrefix.slice(0, wsIndex);
  if (!DIRECTIVE_KINDS.has(keyword as DirectiveKind)) return null;

  const rest = wsIndex === -1 ? '' : afterPrefix.slice(wsIndex);
  return { kind: keyword as DirectiveKind, rules: parseRuleList(rest), line };
}

function parseRuleList(rest: string): readonly string[] | null {
  const trimmed = rest.trim();
  if (trimmed === '') return null; // no list ⇒ all rules
  const rules = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return rules.length > 0 ? rules : null;
}

function walkHtml(node: MdastNode, out: Directive[]): void {
  if (node.type === 'html') {
    const line = node.position?.start.line;
    if (typeof line === 'number') {
      const directive = parseDirective(node.value, line);
      if (directive) out.push(directive);
    }
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) walkHtml(child as MdastNode, out);
  }
}

/**
 * Collect suppression directives from a file's mdast tree in one cheap walk.
 * Returns null when the file carries no directives, so callers can skip
 * filtering entirely (fast path). Both block and inline `html` comment nodes
 * are inspected.
 */
export function collectDirectives(ast: Root): DirectiveIndex | null {
  const all: Directive[] = [];
  walkHtml(ast as MdastNode, all);
  if (all.length === 0) return null;

  const index: DirectiveIndex = {
    fileDisableAll: false,
    fileDisableRules: new Set(),
    ranged: [],
    nextLine: new Map(),
  };

  for (const directive of all) {
    switch (directive.kind) {
      case 'disable-file': {
        if (directive.rules === null) index.fileDisableAll = true;
        else for (const rule of directive.rules) index.fileDisableRules.add(rule);
        break;
      }
      case 'disable':
      case 'enable': {
        index.ranged.push(directive);
        break;
      }
      case 'disable-next-line': {
        const target = directive.line + 1;
        let entry = index.nextLine.get(target);
        if (!entry) {
          entry = { all: false, rules: new Set() };
          index.nextLine.set(target, entry);
        }
        if (directive.rules === null) entry.all = true;
        else for (const rule of directive.rules) entry.rules.add(rule);
        break;
      }
    }
  }

  index.ranged.sort((a, b) => a.line - b.line);
  return index;
}

function directiveApplies(directive: Directive, ruleName: string): boolean {
  return directive.rules === null || directive.rules.includes(ruleName);
}

/**
 * Is a single diagnostic suppressed by the file's directives?
 *
 * `core/internal-error` is handled by the caller and never reaches here.
 *
 * Line-less diagnostics (no `loc`) are treated as spanning the whole file:
 * only `disable-file` OR an OPEN-ENDED `disable` (a `disable` with no later
 * matching `enable`) suppresses them. This is exactly the "file-scoped"
 * contract the issue specifies for project-rule diagnostics.
 */
export function isSuppressed(
  index: DirectiveIndex,
  ruleName: string,
  line: number | undefined,
): boolean {
  if (index.fileDisableAll || index.fileDisableRules.has(ruleName)) return true;

  if (line !== undefined) {
    const next = index.nextLine.get(line);
    if (next && (next.all || next.rules.has(ruleName))) return true;
  }

  // Replay disable/enable in line order; the last one at or before the
  // diagnostic line wins. A line-less diagnostic uses +Infinity as its line,
  // so every directive is replayed and only an unclosed final `disable`
  // (open to EOF) leaves it suppressed. This same replay yields ESLint-style
  // carve-outs, e.g. an unscoped `disable` followed by a scoped `enable`.
  const ceiling = line ?? Number.POSITIVE_INFINITY;
  let disabled = false;
  for (const directive of index.ranged) {
    if (directive.line > ceiling) break; // ranged is sorted ascending
    if (directiveApplies(directive, ruleName)) {
      disabled = directive.kind === 'disable';
    }
  }
  return disabled;
}

/**
 * Filter suppressed diagnostics. `core/internal-error` diagnostics are NEVER
 * suppressible: they signal a rule bug (always severity 'error'), and letting
 * a `disable`/`disable-file` hide them would mask defects. This is the
 * simplest behavior consistent with the runner already forcing internal-error
 * severity regardless of user config.
 */
export function filterSuppressed(
  diagnostics: readonly Diagnostic[],
  index: DirectiveIndex,
): Diagnostic[] {
  return diagnostics.filter((d) => {
    if (d.ruleName === INTERNAL_ERROR_RULE_NAME) return true;
    return !isSuppressed(index, d.ruleName, d.loc?.line);
  });
}
