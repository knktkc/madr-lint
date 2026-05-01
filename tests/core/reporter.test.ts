import { beforeAll, describe, expect, it } from 'vitest';
import { textReporter } from '../../src/core/reporter.js';
import type { AnyRule, Diagnostic, Rule } from '../../src/core/types.js';

beforeAll(() => {
  process.env.NO_COLOR = '1';
});

function makeRule(name: string, messages: Record<string, string>): Rule {
  return {
    meta: {
      name,
      type: 'perFile',
      versionCompat: ['v2'],
      docs: { description: '', recommended: false },
      messages,
      defaultOptions: {},
    },
    create() {},
  };
}

describe('core/reporter — text', () => {
  it('returns "All clear" when there are no diagnostics', () => {
    expect(textReporter.format([], new Map())).toContain('All clear');
  });

  it('groups diagnostics by file path', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { foo: 'msg {{x}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      { ruleName: 'test/r', messageId: 'foo', severity: 'error', path: 'a.md', data: { x: 1 } },
      { ruleName: 'test/r', messageId: 'foo', severity: 'error', path: 'a.md', data: { x: 2 } },
      { ruleName: 'test/r', messageId: 'foo', severity: 'warn', path: 'b.md', data: { x: 3 } },
    ];
    const out = textReporter.format(diagnostics, rules);
    expect(out).toContain('a.md');
    expect(out).toContain('b.md');
    // a.md appears once as a header even though it has 2 diagnostics
    expect(out.match(/a\.md/g) ?? []).toHaveLength(1);
  });

  it('renders {{placeholder}} from data', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { hello: 'Hello {{name}}!' })],
    ]);
    const diagnostics: Diagnostic[] = [
      {
        ruleName: 'test/r',
        messageId: 'hello',
        severity: 'error',
        path: 'a.md',
        data: { name: 'world' },
      },
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('Hello world!');
  });

  it('shows summary with error and warning counts', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      { ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' },
      { ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' },
      { ruleName: 'test/r', messageId: 'x', severity: 'warn', path: 'b.md' },
    ];
    const out = textReporter.format(diagnostics, rules);
    expect(out).toContain('2 errors');
    expect(out).toContain('1 warning');
  });

  it('falls back to messageId when rule or template is missing', () => {
    const diagnostics: Diagnostic[] = [
      { ruleName: 'unknown/rule', messageId: 'mystery', severity: 'error', path: 'a.md' },
    ];
    const out = textReporter.format(diagnostics, new Map());
    expect(out).toContain('mystery');
  });

  it('includes rule name in each diagnostic line', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'msg' })],
    ]);
    const diagnostics: Diagnostic[] = [
      { ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md' },
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('test/r');
  });

  it('keeps unmatched placeholders intact (visible bug surface)', () => {
    const rules = new Map<string, AnyRule>([
      ['test/r', makeRule('test/r', { x: 'value: {{notProvided}}' })],
    ]);
    const diagnostics: Diagnostic[] = [
      { ruleName: 'test/r', messageId: 'x', severity: 'error', path: 'a.md', data: {} },
    ];
    expect(textReporter.format(diagnostics, rules)).toContain('{{notProvided}}');
  });
});
