// MADR linter core types.
// Per ADR-0002, the runner uses a single-pass visitor registry over mdast.
// At v0.1.0 we ship the simple rule shape (no AST visitor); the visitor map
// is added when the first AST-using rule lands.

export type MadrVersion = 'v2' | 'v3' | 'v4';

export type Severity = 'error' | 'warn';

export interface RuleMeta {
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
  defaultOptions: Record<string, unknown>;
  /** Lazy-loaded JSON Schema for options. */
  schema?: () => Promise<unknown>;
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

export interface RuleContext {
  /** The file being linted. */
  file: FileContext;
  /** User-merged options for this rule. */
  options: Record<string, unknown>;
  /** Emit a diagnostic. */
  report(diagnostic: Omit<Diagnostic, 'ruleName' | 'severity' | 'path'>): void;
}

export interface Rule {
  meta: RuleMeta;
  create(context: RuleContext): void;
}
