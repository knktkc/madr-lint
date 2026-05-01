import Ajv, { type AnySchemaObject, type ValidateFunction } from 'ajv';
import type {
  Diagnostic,
  FileContext,
  Rule,
  RuleContext,
  Severity,
} from '../../src/core/types.js';

interface RunRuleOptions {
  /** Per-rule options to merge over rule.meta.defaultOptions. */
  options?: Record<string, unknown>;
  /** Severity to attach to emitted diagnostics. Defaults to 'error'. */
  severity?: Severity;
  /** Skip AJV options validation. Default false. */
  skipValidation?: boolean;
}

// strict: true catches typo'd schema keywords (e.g. `requireed` instead of
// `required`) at compile time rather than letting them silently no-op.
// allErrors: true so `errorsText` shows every validation issue at once.
const ajv = new Ajv({ strict: true, allErrors: true });

// Cache compiled validators per schema object reference. Schemas live on
// rule.meta.schema and are stable across runRule calls for the same rule.
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
 * Minimal in-memory rule runner for tests.
 *
 * Validates merged options against `rule.meta.schema` (AJV) before invoking
 * `create()`. Throws if options are invalid — callers can pass
 * `skipValidation: true` to bypass (e.g. for negative tests).
 *
 * For v0.1.0 only the simple shape (rules that report directly from create()
 * and return void) is exercised. When the first AST-using rule lands the
 * helper grows: parse with gray-matter + mdast-util-from-markdown, walk the
 * tree once, dispatch to listeners returned by create().
 */
export function runRule<TOptions extends Record<string, unknown>>(
  rule: Rule<TOptions>,
  file: FileContext,
  runtime: RunRuleOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const severity = runtime.severity ?? 'error';
  const mergedOptions = {
    ...rule.meta.defaultOptions,
    ...runtime.options,
  } as TOptions;

  if (rule.meta.schema && !runtime.skipValidation) {
    const validator = getValidator(rule.meta.schema);
    if (!validator(mergedOptions)) {
      throw new Error(
        `Invalid options for rule ${rule.meta.name}: ${ajv.errorsText(validator.errors)}`,
      );
    }
  }

  const context: RuleContext<TOptions> = {
    file,
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
  // listeners returned by AST-based rules will be dispatched once a parser
  // pipeline lands (ADR-0002). Filename/metadata rules return void here.
  void listeners;

  return diagnostics;
}
