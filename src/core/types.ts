// MADR linter core types.
// Per ADR-0002, the runner uses a single-pass visitor registry over mdast.
// The Rule type below supports BOTH:
//   - Filename / metadata-only rules: create() returns void
//   - AST-based rules: create() returns RuleListeners with enter/exit handlers
// keyed by mdast node type. The runner walks each file's tree once and
// dispatches to all subscribed rules.

import type { AnySchemaObject } from 'ajv';
import type { Nodes, Root } from 'mdast';
// Note: imports of project-internal modules use the `.js` extension per
// Node ESM convention. tsc resolves these to the .ts source files.

// All mdast node types rules can subscribe to. `'root'` is the top-level
// document node — useful for "after all children visited" reporting in
// exit handlers.
export type MdastNodeType = Root['type'] | Nodes['type'];

// The argument type for visitor handlers — covers root + all descendants.
export type MdastNode = Root | Nodes;

/** Severity levels supported by every rule. */
export type Severity = 'error' | 'warn';

/**
 * The reserved rule name used for internal-error diagnostics. A real rule
 * cannot register with this name (the registry should reject collisions).
 * Lives here (not in runner.ts) so leaf modules like the suppression layer
 * can reference it without importing the runner.
 */
export const INTERNAL_ERROR_RULE_NAME = 'core/internal-error';

/**
 * User-facing severity declaration in config files.
 * - bare string: enable/disable with default options
 * - tuple: enable with explicit options
 */
export type RuleSeverity =
  | Severity
  | 'off'
  | readonly [Severity, Record<string, unknown>];

export type MadrVersion = 'v2' | 'v3' | 'v4';

export interface RuleMeta<TOptions = Record<string, unknown>> {
  /** Rule identifier, e.g. 'madr/filename-format'. */
  name: string;
  /** Whether the rule operates per-file or across the project. */
  type: 'perFile' | 'project';
  /** Which MADR versions this rule applies to. */
  versionCompat: readonly MadrVersion[];
  docs: {
    description: string;
    url?: string;
    recommended: boolean;
  };
  /** messageId -> template string with {{placeholders}}. */
  messages: Record<string, string>;
  /** Default options merged with user config. */
  defaultOptions: TOptions;
  /** AJV JSON Schema for options. Validated at runRule time. */
  schema?: AnySchemaObject;
}

export interface FileContext {
  /** File path (typically basename or repo-relative). */
  path: string;
  /** Raw file content. */
  content: string;
}

export interface Diagnostic {
  /** Rule that emitted this diagnostic. */
  ruleName: string;
  /** messageId from rule.meta.messages. */
  messageId: string;
  /** Severity resolved against the user config. */
  severity: Severity;
  /** Path of the offending file. */
  path: string;
  /** Optional source range. Filename rules omit this. */
  loc?: {
    line: number;
    column: number;
  };
  /** Data for placeholder interpolation in messages[messageId]. */
  data?: Record<string, unknown>;
}

export interface RuleContext<TOptions = Record<string, unknown>> {
  /** The file being linted. */
  file: FileContext;
  /**
   * Parsed YAML frontmatter (v3/v4 only), or null if absent.
   * Use this when the rule must validate strict YAML frontmatter shape.
   */
  frontmatter: Record<string, unknown> | null;
  /**
   * Combined metadata: YAML frontmatter merged with v2 bold-list extracted
   * from the body. Frontmatter wins on key conflict. null only when both
   * are absent. See ADR-0006. Use this for format-agnostic field reads.
   */
  metadata: Record<string, unknown> | null;
  /**
   * Body-coordinate positions for `metadata` keys whose effective value came
   * from the v2 leading list (the list item's start). Frontmatter-sourced
   * keys are absent — frontmatter is stripped before mdast parsing, so it
   * has no body line. Rules attach this as `loc` on metadata-value
   * diagnostics so inline suppression directives can target them by line.
   */
  metadataLoc: Record<string, { line: number; column: number }> | null;
  /** User-merged options for this rule (validated against rule.meta.schema). */
  options: TOptions;
  /** Emit a diagnostic. */
  report(diagnostic: Omit<Diagnostic, 'ruleName' | 'severity' | 'path'>): void;
}

/**
 * Visitor map dispatched during single-pass mdast traversal.
 * Rules subscribe to specific node types; the runner walks the tree once
 * and calls the matching enter/exit handler for each node.
 */
export interface RuleListeners {
  enter?: Partial<Record<MdastNodeType, (node: MdastNode) => void>>;
  exit?: Partial<Record<MdastNodeType, (node: MdastNode) => void>>;
}

/**
 * A lint rule.
 *
 * - Filename / metadata-only rules: `create` reports diagnostics directly,
 *   then returns void.
 * - AST-based rules: `create` returns RuleListeners; the runner invokes
 *   them during single-pass traversal of the file's mdast tree.
 */
export interface Rule<TOptions = Record<string, unknown>> {
  meta: RuleMeta<TOptions>;
  create(context: RuleContext<TOptions>): RuleListeners | void;
}

// ──────────────────────────────────────────────────────────────────
// Project rules (cross-file). See ADR-0005.
// ──────────────────────────────────────────────────────────────────

/**
 * A pre-parsed file passed to project rules. Built once per
 * `runRulesOnProject` invocation.
 */
export interface ProjectFile {
  /** File path relative to the project root. */
  path: string;
  /** Raw file content (unparsed). */
  content: string;
  /**
   * Body content with frontmatter stripped — the same coordinate space as
   * `ast` positions. Used by the suppression layer for line-level directive
   * targeting.
   */
  body: string;
  /** Parsed YAML frontmatter (v3/v4 only), or null if absent. */
  frontmatter: Record<string, unknown> | null;
  /**
   * Combined metadata: frontmatter merged with v2 bold-list extracted
   * from the body. Frontmatter wins on key conflict. See ADR-0006.
   */
  metadata: Record<string, unknown> | null;
  /** mdast root of the body (frontmatter stripped). */
  ast: Root;
}

export interface ProjectRuleContext<TOptions = Record<string, unknown>> {
  /** All files in the project (eager-parsed). */
  files: readonly ProjectFile[];
  /** User-merged options for this rule. */
  options: TOptions;
  /**
   * Predicate: does a project-root-relative POSIX path exist as a regular
   * file WITHIN the project root? Injected by the orchestrator so rules (e.g.
   * no-broken-links) can verify link targets that are NOT in the linted `.md`
   * set — non-Markdown assets or files outside the scanned paths. Returns
   * false for directories and for any target that resolves at or above the
   * project root (i.e. escapes it). Undefined when no filesystem is available
   * (e.g. in-memory unit tests), in which case rules fall back to the `files`
   * set alone.
   */
  fileExists?: (resolvedPath: string) => boolean;
  /**
   * Emit a diagnostic. Unlike per-file rules, project rules MUST set
   * `path` explicitly — the runner cannot infer which file the
   * diagnostic relates to.
   */
  report(diagnostic: Omit<Diagnostic, 'ruleName' | 'severity'>): void;
}

/**
 * A cross-file rule. Receives all parsed files at once and reports
 * diagnostics with explicit `path` per file.
 *
 * Project rules use a different runner function (`runRulesOnProject`)
 * and a distinct context shape from per-file rules. See ADR-0005 for
 * the rationale behind keeping the two APIs separate.
 */
export interface ProjectRule<TOptions = Record<string, unknown>> {
  meta: RuleMeta<TOptions>;
  check(context: ProjectRuleContext<TOptions>): void;
}

/** Either a per-file or a project rule. */
export type AnyRule<TOptions = Record<string, unknown>> =
  | Rule<TOptions>
  | ProjectRule<TOptions>;

/** Type guard distinguishing project rules from per-file rules. */
export function isProjectRule(rule: AnyRule): rule is ProjectRule {
  return 'check' in rule;
}
