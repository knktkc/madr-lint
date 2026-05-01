import Ajv, { type AnySchemaObject, type ValidateFunction } from 'ajv';
import type { Nodes, Root } from 'mdast';
import type {
  Diagnostic,
  FileContext,
  Rule,
  RuleContext,
  RuleListeners,
  Severity,
} from './types.js';
import { parseFile, type ParsedFile } from './parser.js';

// strict: true catches typo'd schema keywords at compile time.
// allErrors: true so errorsText shows every issue.
const ajv = new Ajv({ strict: true, allErrors: true });

// Cache compiled validators per schema object reference.
// Schemas live on rule.meta.schema and are stable per rule instance.
const validatorCache = new WeakMap<AnySchemaObject, ValidateFunction>();

function getValidator(schema: AnySchemaObject): ValidateFunction {
  let validator = validatorCache.get(schema);
  if (!validator) {
    validator = ajv.compile(schema);
    validatorCache.set(schema, validator);
  }
  return validator;
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
 * The runner:
 *   1. Validates each rule's merged options against its schema (AJV).
 *   2. Calls each rule's create(). Rules may either report directly
 *      (filename/metadata-style) and return void, or return RuleListeners
 *      (AST-style) that subscribe to mdast node types.
 *   3. If ANY rule returns listeners, parse the file once (gray-matter
 *      for frontmatter + mdast-util-from-markdown for the body) and walk
 *      the tree once, dispatching enter/exit handlers from all rules per
 *      node type.
 *
 * Frontmatter is parsed lazily — only on first access via context.frontmatter.
 * This keeps filename-style rules zero-cost on the parse path.
 */
export function runRulesOnFile(
  rules: readonly Rule[],
  file: FileContext,
  runtime: RunRuleOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const severity = runtime.severity ?? 'error';

  // Lazy parse: only triggered when a rule accesses frontmatter or returns
  // listeners (AST traversal needed).
  let parsed: ParsedFile | null = null;
  const ensureParsed = (): ParsedFile => {
    parsed ??= parseFile(file.content);
    return parsed;
  };

  const enterMap: Record<string, Array<(node: Nodes) => void>> = {};
  const exitMap: Record<string, Array<(node: Nodes) => void>> = {};
  let hasASTRule = false;

  for (const rule of rules) {
    const mergedOptions = {
      ...rule.meta.defaultOptions,
      ...runtime.options,
    };

    if (rule.meta.schema && !runtime.skipValidation) {
      const validator = getValidator(rule.meta.schema);
      if (!validator(mergedOptions)) {
        throw new Error(
          `Invalid options for rule ${rule.meta.name}: ${ajv.errorsText(validator.errors)}`,
        );
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

    const listeners = rule.create(context);
    if (listeners) {
      hasASTRule = true;
      collectListeners(listeners, enterMap, exitMap);
    }
  }

  if (hasASTRule) {
    walk(ensureParsed().ast, enterMap, exitMap);
  }

  return diagnostics;
}

function collectListeners(
  listeners: RuleListeners,
  enterMap: Record<string, Array<(node: Nodes) => void>>,
  exitMap: Record<string, Array<(node: Nodes) => void>>,
): void {
  if (listeners.enter) {
    for (const [type, handler] of Object.entries(listeners.enter)) {
      if (handler) (enterMap[type] ??= []).push(handler);
    }
  }
  if (listeners.exit) {
    for (const [type, handler] of Object.entries(listeners.exit)) {
      if (handler) (exitMap[type] ??= []).push(handler);
    }
  }
}

function walk(
  node: Nodes | Root,
  enterMap: Record<string, Array<(node: Nodes) => void>>,
  exitMap: Record<string, Array<(node: Nodes) => void>>,
): void {
  const enterHandlers = enterMap[node.type];
  if (enterHandlers) {
    for (const handler of enterHandlers) handler(node as Nodes);
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child as Nodes, enterMap, exitMap);
    }
  }
  const exitHandlers = exitMap[node.type];
  if (exitHandlers) {
    for (const handler of exitHandlers) handler(node as Nodes);
  }
}
