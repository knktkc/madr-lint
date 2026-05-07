import Ajv, { type AnySchemaObject, type ValidateFunction } from 'ajv';
import type {
  Diagnostic,
  FileContext,
  MdastNode,
  ProjectFile,
  ProjectRule,
  ProjectRuleContext,
  Rule,
  RuleContext,
  RuleListeners,
  Severity,
} from './types.js';
import { parseFile, type ParsedFile } from './parser.js';

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

/**
 * The reserved rule name used for internal-error diagnostics. A real rule
 * cannot register with this name (the registry should reject collisions).
 */
export const INTERNAL_ERROR_RULE_NAME = 'core/internal-error';

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
  /** Severity to attach to emitted diagnostics. Defaults to 'error'. */
  severity?: Severity;
  /** Skip AJV options validation. Default false. */
  skipValidation?: boolean;
}

/**
 * Run a single rule against a single file. Sugar over runRulesOnFile
 * for the common one-rule case (used heavily by tests).
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
    const mergedOptions = {
      ...rule.meta.defaultOptions,
      ...runtime.options,
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

  return diagnostics;
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
    frontmatter: parsed.frontmatter,
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
    const mergedOptions = {
      ...rule.meta.defaultOptions,
      ...runtime.options,
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
