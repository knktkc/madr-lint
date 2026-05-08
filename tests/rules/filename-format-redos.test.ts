import { describe, it, expect } from 'vitest';
import { runRule } from '../helpers/run-rule.js';
import rule from '../../src/rules/filename-format/index.js';
import { RuleOptionsError } from '../../src/core/runner.js';

describe('madr/filename-format — ReDoS guard', () => {
  it('rejects a catastrophic-backtracking pattern from user options', () => {
    expect(() =>
      runRule(
        rule,
        { content: '# x', path: '0001-x.md' },
        { options: { pattern: '(a+)+$' } },
      ),
    ).toThrow(RuleOptionsError);
  });

  it('rejects an invalid regex from user options', () => {
    expect(() =>
      runRule(
        rule,
        { content: '# x', path: '0001-x.md' },
        { options: { pattern: '[unclosed' } },
      ),
    ).toThrow(RuleOptionsError);
  });

  it('accepts a safe custom pattern', () => {
    const diagnostics = runRule(
      rule,
      { content: '# x', path: '0001-x.md' },
      { options: { pattern: '^[0-9]{4}-.+\\.md$' } },
    );
    expect(diagnostics).toEqual([]);
  });
});
