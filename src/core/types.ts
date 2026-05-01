// MADR linter core types.
// Per ADR-0002, the runner uses a single-pass visitor registry over mdast.
// The Rule type below supports BOTH:
//   - Filename / metadata-only rules: create() returns void
//   - AST-based rules: create() returns RuleListeners with enter/exit handlers
// keyed by mdast node type. The runner walks each file's tree once and
// dispatches to all subscribed rules.

import type { AnySchemaObject } from 'ajv';
import type { Nodes } from 'mdast';
// Note: imports of project-internal modules use the `.js` extension per
// Node ESM convention. tsc resolves these to the .ts source files.

export type MdastNodeType = Nodes['type'];

/** Severity levels supported by every rule. */
export type Severity = 'error' | 'warn';

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
  /** Parsed YAML frontmatter, or null if absent. */
  frontmatter: Record<string, unknown> | null;
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
  enter?: Partial<Record<MdastNodeType, (node: Nodes) => void>>;
  exit?: Partial<Record<MdastNodeType, (node: Nodes) => void>>;
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
