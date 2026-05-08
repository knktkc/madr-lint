import { describe, it, expect } from 'vitest';
import { assertSafeRegex } from '../../src/core/regex-safety.js';
import { RuleOptionsError } from '../../src/core/runner.js';

describe('assertSafeRegex', () => {
  it('returns a compiled RegExp for safe patterns', () => {
    const regex = assertSafeRegex('^[0-9]{4}-[a-z0-9-]+\\.md$', 'rule/x', 'pattern');
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.test('0001-foo.md')).toBe(true);
    expect(regex.test('not-a-match')).toBe(false);
  });

  it('throws RuleOptionsError for catastrophic backtracking patterns', () => {
    expect(() => assertSafeRegex('(a+)+$', 'rule/x', 'pattern')).toThrow(
      RuleOptionsError,
    );
  });

  it('throws RuleOptionsError for nested quantifier ReDoS', () => {
    expect(() => assertSafeRegex('(a*)*b', 'rule/x', 'pattern')).toThrow(
      RuleOptionsError,
    );
  });

  it('throws RuleOptionsError for invalid regex syntax', () => {
    expect(() => assertSafeRegex('[unclosed', 'rule/x', 'pattern')).toThrow(
      RuleOptionsError,
    );
  });

  it('error message includes rule name and option path', () => {
    try {
      assertSafeRegex('(a+)+$', 'madr/filename-format', 'pattern');
      expect.fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RuleOptionsError);
      const e = err as RuleOptionsError;
      expect(e.ruleName).toBe('madr/filename-format');
      expect(e.message).toContain('pattern');
      expect(e.message).toContain('(a+)+$');
    }
  });

  it('accepts simple anchored regex with bounded repetition', () => {
    expect(() => assertSafeRegex('^\\d{4}$', 'rule/x', 'pattern')).not.toThrow();
  });
});
