import safeRegex from 'safe-regex2';
import { RuleOptionsError } from './runner.js';

const SAFE_REGEX_LIMIT = 25;

// Pattern → compiled RegExp cache. Only safe patterns are cached; unsafe
// or syntactically invalid ones throw on every call (callers should fix
// their config rather than burn cycles re-validating the same bad input).
//
// Cache scope: module-global. Keys are pattern strings, which are static
// per rule.defaultOptions or per user config. Bounded in practice — a
// long-running daemon would still see at most O(rules × user-overrides)
// distinct patterns. If memory becomes a concern in pathological cases
// (e.g. dynamically-generated patterns), the cache can be swapped for an
// LRU. As of v0.1, a plain Map is sufficient.
const cache = new Map<string, RegExp>();

export function assertSafeRegex(
  pattern: string,
  ruleName: string,
  optionPath: string,
): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    throw new RuleOptionsError(
      ruleName,
      `option "${optionPath}" is not a valid regular expression: ${(err as Error).message}`,
    );
  }
  if (!safeRegex(regex, { limit: SAFE_REGEX_LIMIT })) {
    throw new RuleOptionsError(
      ruleName,
      `option "${optionPath}" (${pattern}) appears unsafe (catastrophic backtracking). Reject before runtime.`,
    );
  }
  cache.set(pattern, regex);
  return regex;
}

/**
 * Test-only helper to drop the cache between unit tests so that
 * "unsafe pattern" assertions don't accidentally short-circuit on a
 * previously-cached safe entry. Not exported from src/index.ts.
 */
export function clearRegexCacheForTesting(): void {
  cache.clear();
}
