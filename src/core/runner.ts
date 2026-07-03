import Ajv, { type AnySchemaObject, type ValidateFunction } from 'ajv';
import {
  INTERNAL_ERROR_RULE_NAME,
  type Diagnostic,
  type FileContext,
  type MdastNode,
  type ProjectFile,
  type ProjectRule,
  type ProjectRuleContext,
  type Rule,
  type RuleContext,
  type RuleListeners,
  type Severity,
} from './types.js';
import { parseFile, type ParsedFile } from './parser.js';
import {
  collectDirectives,
  filterSuppressed,
  DIRECTIVE_PREFIX,
} from './suppression.js';

// strict: true catches typo'd schema keywords at compile time.
// allErrors: true so RuleOptionsError surfaces every issue at once.
const ajv = new Ajv({ strict: true, allErrors: true });

// Cache compiled validators per schema object reference.
// Schemas are module-level static on rules, so the cache key never goes stale.
// (If a rule mutates `meta.schema` post-load — don't — the cache will desync.)
const validatorCache = new WeakMap<AnySchemaObject, ValidateFunction>();

function getValidator(schema: AnySchemaObject): ValidateFunction {
  let validator = validatorCache.get(schema);
  if (!validator) {
    validator = ajv.compile(schema);
    validatorCache.set(schema, validator);
  }
  return validator;
}

// Defined in types.ts (leaf module) so the suppression layer can reference
// it without a runner import cycle; re-exported here for API stability.
export { INTERNAL_ERROR_RULE_NAME };

/**
 * Thrown when a rule's merged options fail AJV validation against
 * `rule.meta.schema`. Distinct from generic `Error` so callers can
 * `instanceof` to skip rules with bad config and continue.
 */
export class RuleOptionsError extends Error {
  constructor(
    public readonly ruleName: string,
    public readonly ajvErrors: string,
  ) {
    super(`Invalid options for rule ${ruleName}: ${ajvErrors}`);
    this.name = 'RuleOptionsError';
  }
}

export interface RunRuleOptions {
  /** Per-rule options to merge over rule.meta.defaultOptions. */
  options?: Record<string, unknown>;
  /**
   * Options keyed by rule name, for multi-rule calls where each rule needs
   * its own options (e.g. config tuples `['error', {...}]`). For a given rule,
   * an entry here takes precedence over `options`; rules absent from the map
   * fall back to `options` (if any), then `meta.defaultOptions`.
   */
  optionsByRule?: Record<string, Record<string, unknown>>;
  /** Severity to attach to emitted diagnostics. Defaults to 'error'. */
  severity?: Severity;
  /** Skip AJV options validation. Default false. */
  skipValidation?: boolean;
  /**
   * Filesystem-existence predicate exposed to project rules as
   * `context.fileExists`. Per-file runs ignore this. See
   * ProjectRuleContext.fileExists.
   */
  fileExists?: (resolvedPath: string) => boolean;
}

/**
 * Run a single rule against a single file. Sugar over runRulesOnFile
 * for the common one-rule case (used heavily by tests).
 *
 * Note: inline suppression directives (`<!-- madr-lint-disable... -->`)
 * present in `file.content` ARE honored — matching diagnostics are filtered.
 */
export function runRule<TOptions extends Record<string, unknown>>(
  rule: Rule<TOptions>,
  file: FileContext,
  runtime: RunRuleOptions = {},
): Diagnostic[] {
  return runRulesOnFile([rule as Rule], file, runtime);
}

/**
 * Run multiple rules against a single file with a single mdast traversal.
 *
 * Steps:
 *   1. Validate each rule's merged options against its schema (AJV).
 *      Throws RuleOptionsError on failure (caller decides whether to skip).
 *   2. Call each rule's create(). If a rule throws, the error is caught
 *      and reported as a `core/internal-error` diagnostic — other rules
 *      continue. The same isolation wraps every enter/exit handler so a
 *      single buggy rule cannot abort the whole lint run.
 *   3. If at least one rule returned RuleListeners, call parseFile()
 *      ONCE (gray-matter + mdast-util-from-markdown together; there is
 *      no separate cheap "frontmatter only" path) and walk the tree,
 *      dispatching enter/exit handlers per node type.
 *
 * Frontmatter is exposed lazily via context.frontmatter — the getter
 * triggers parseFile() on first access. Filename-style rules that never
 * touch frontmatter and return void from create() pay zero parse cost.
 *
 * Note: inline suppression directives (`<!-- madr-lint-disable... -->`)
 * present in `file.content` ARE honored — matching diagnostics are filtered
 * centrally after all rules have reported (see suppression.ts).
 */
export function runRulesOnFile(
  rules: readonly Rule[],
  file: FileContext,
  runtime: RunRuleOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const severity = runtime.severity ?? 'error';

  let parsed: ParsedFile | null = null;
  const ensureParsed = (): ParsedFile => {
    parsed ??= parseFile(file.content);
    return parsed;
  };

  const enterMap: Record<string, Array<(node: MdastNode) => void>> = {};
  const exitMap: Record<string, Array<(node: MdastNode) => void>> = {};
  let hasASTRule = false;

  for (const rule of rules) {
    const perRuleOptions =
      runtime.optionsByRule?.[rule.meta.name] ?? runtime.options;
    const mergedOptions = {
      ...rule.meta.defaultOptions,
      ...perRuleOptions,
    };

    if (rule.meta.schema && !runtime.skipValidation) {
      const validator = getValidator(rule.meta.schema);
      if (!validator(mergedOptions)) {
        throw new RuleOptionsError(rule.meta.name, ajv.errorsText(validator.errors));
      }
    }

    const context: RuleContext = {
      file,
      get frontmatter() {
        return ensureParsed().frontmatter;
      },
      get metadata() {
        return ensureParsed().metadata;
      },
      get metadataLoc() {
        return ensureParsed().metadataLoc;
      },
      options: mergedOptions,
      report(d) {
        diagnostics.push({
          ruleName: rule.meta.name,
          severity,
          path: file.path,
          ...d,
        });
      },
    };

    let listeners: RuleListeners | void;
    try {
      listeners = rule.create(context);
    } catch (err) {
      // RuleOptionsError signals the user's config is wrong (e.g. unsafe
      // regex). Propagate it so the CLI can render a clear "fix your
      // .madrlintrc" message rather than burying it as a per-file
      // internal-error diagnostic.
      if (err instanceof RuleOptionsError) throw err;
      diagnostics.push(
        internalErrorDiagnostic(rule.meta.name, 'create', err, file.path),
      );
      continue;
    }

    if (listeners) {
      hasASTRule = true;
      collectListeners(rule, listeners, enterMap, exitMap, diagnostics, file);
    }
  }

  if (hasASTRule) {
    walk(ensureParsed().ast, enterMap, exitMap);
  }

  // Central, post-report suppression (issue #23). Rules stay unaware; the
  // runner filters here using directives collected from the file's `html`
  // comment nodes. We only pay the parse + directive walk when there is
  // something to potentially suppress — a clean file short-circuits, so
  // filename-only rules on passing files keep their zero-parse fast path.
  if (diagnostics.length === 0) return diagnostics;
  // Perf guard (PR #53): every directive form contains the literal
  // 'madr-lint-', and the parsed body is a substring of the raw content, so
  // its absence PROVES no directives exist — filtering can be skipped
  // without parsing. Without this, a Shape-A filename diagnostic on an
  // otherwise-unparsed file forced a full gray-matter+mdast parse here
  // (measured -99% on the filename-format invalid-path bench). The substring
  // scan is ~µs; files that do contain the literal proceed exactly as before.
  if (!file.content.includes(DIRECTIVE_PREFIX)) return diagnostics;
  const { ast, body } = ensureParsed();
  const directives = collectDirectives(ast, body);
  return directives ? filterSuppressed(diagnostics, directives) : diagnostics;
}

// Internal-error diagnostics are ALWAYS severity 'error' regardless of the
// runtime-passed severity for the rule that threw — a rule misbehaving is
// never something the user wants to silence as a warning.
function internalErrorDiagnostic(
  ruleName: string,
  operation: 'create' | 'enter' | 'exit' | 'check',
  err: unknown,
  path: string,
): Diagnostic {
  return {
    ruleName: INTERNAL_ERROR_RULE_NAME,
    messageId: 'ruleThrew',
    severity: 'error',
    path,
    data: {
      rule: ruleName,
      operation,
      error: err instanceof Error ? err.message : String(err),
    },
  };
}

function collectListeners(
  rule: Rule,
  listeners: RuleListeners,
  enterMap: Record<string, Array<(node: MdastNode) => void>>,
  exitMap: Record<string, Array<(node: MdastNode) => void>>,
  diagnostics: Diagnostic[],
  file: FileContext,
): void {
  const wrap =
    (op: 'enter' | 'exit') => (handler: (node: MdastNode) => void) => (node: MdastNode) => {
      try {
        handler(node);
      } catch (err) {
        diagnostics.push(
          internalErrorDiagnostic(rule.meta.name, op, err, file.path),
        );
      }
    };

  if (listeners.enter) {
    const wrapEnter = wrap('enter');
    for (const [type, handler] of Object.entries(listeners.enter)) {
      if (handler) (enterMap[type] ??= []).push(wrapEnter(handler));
    }
  }
  if (listeners.exit) {
    const wrapExit = wrap('exit');
    for (const [type, handler] of Object.entries(listeners.exit)) {
      if (handler) (exitMap[type] ??= []).push(wrapExit(handler));
    }
  }
}

function walk(
  node: MdastNode,
  enterMap: Record<string, Array<(node: MdastNode) => void>>,
  exitMap: Record<string, Array<(node: MdastNode) => void>>,
): void {
  const enterHandlers = enterMap[node.type];
  if (enterHandlers) {
    for (const handler of enterHandlers) handler(node);
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child as MdastNode, enterMap, exitMap);
    }
  }
  const exitHandlers = exitMap[node.type];
  if (exitHandlers) {
    for (const handler of exitHandlers) handler(node);
  }
}

/**
 * Build a `ProjectFile` (path + content + parsed frontmatter + AST) from
 * a raw file. Used by `runRulesOnProject` and by the lint orchestrator
 * to share parsing between per-file and project passes when needed.
 */
export function buildProjectFile(file: FileContext): ProjectFile {
  const parsed: ParsedFile = parseFile(file.content);
  return {
    path: file.path,
    content: file.content,
    body: parsed.body,
    frontmatter: parsed.frontmatter,
    metadata: parsed.metadata,
    ast: parsed.ast,
  };
}

/**
 * Run multiple project rules across all parsed files. Each rule's
 * `check()` is called once with the full file array. Throws are
 * captured as `core/internal-error` diagnostics (attached to the
 * first file's path, since project rules have no file context).
 *
 * See ADR-0005 for the API rationale.
 */
export function runRulesOnProject(
  rules: readonly ProjectRule[],
  files: readonly ProjectFile[],
  runtime: RunRuleOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const severity = runtime.severity ?? 'error';

  for (const rule of rules) {
    const perRuleOptions =
      runtime.optionsByRule?.[rule.meta.name] ?? runtime.options;
    const mergedOptions = {
      ...rule.meta.defaultOptions,
      ...perRuleOptions,
    };

    if (rule.meta.schema && !runtime.skipValidation) {
      const validator = getValidator(rule.meta.schema);
      if (!validator(mergedOptions)) {
        throw new RuleOptionsError(
          rule.meta.name,
          ajv.errorsText(validator.errors),
        );
      }
    }

    const context: ProjectRuleContext = {
      files,
      options: mergedOptions,
      fileExists: runtime.fileExists,
      report(d) {
        diagnostics.push({
          ruleName: rule.meta.name,
          severity,
          ...d,
        });
      },
    };

    try {
      rule.check(context);
    } catch (err) {
      // Project rules have no current-file context — attribute the
      // internal-error to a sentinel path rather than mis-attributing
      // to whatever file happens to be first in the array.
      diagnostics.push(
        internalErrorDiagnostic(rule.meta.name, 'check', err, '<project>'),
      );
    }
  }

  return diagnostics;
}
