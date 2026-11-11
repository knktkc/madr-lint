import { describe, it, expect } from 'vitest';
import {
  runRule,
  runRulesOnFile,
  runRulesOnProject,
  buildProjectFile,
  RuleOptionsError,
  INTERNAL_ERROR_RULE_NAME,
} from '../../src/core/runner.js';
import type {
  MdastNode,
  ProjectFile,
  ProjectRule,
  Rule,
  RuleListeners,
} from '../../src/core/types.js';

function dummyRule(overrides: Partial<Rule> = {}): Rule {
  const baseMeta: Rule['meta'] = {
    name: 'test/dummy',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: { description: 'test', recommended: false },
    messages: {},
    defaultOptions: {},
  };
  return {
    meta: { ...baseMeta, ...overrides.meta },
    create: overrides.create ?? (() => undefined),
  };
}

function dummyProjectRule(overrides: Partial<ProjectRule> = {}): ProjectRule {
  const baseMeta: ProjectRule['meta'] = {
    name: 'test/project-dummy',
    type: 'project',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: { description: 'test', recommended: false },
    messages: {},
    defaultOptions: {},
  };
  return {
    meta: { ...baseMeta, ...overrides.meta },
    check: overrides.check ?? (() => undefined),
  };
}

function fakeProjectFile(path: string): ProjectFile {
  return {
    path,
    content: '',
    body: '',
    frontmatter: null,
    metadata: null,
    ast: { type: 'root', children: [] },
  };
}

describe('core/runner', () => {
  describe('filename-style rule (returns void)', () => {
    it('invokes create() and collects diagnostics', () => {
      const rule = dummyRule({
        create(context) {
          context.report({ messageId: 'foo', data: { x: 1 } });
        },
      });
      const diagnostics = runRule(rule, { content: '', path: 'test.md' });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'test/dummy',
        messageId: 'foo',
        severity: 'error',
        path: 'test.md',
        data: { x: 1 },
      });
    });

    it('returns empty array if create() reports nothing', () => {
      const rule = dummyRule();
      expect(runRule(rule, { content: '', path: 'test.md' })).toEqual([]);
    });
  });

  describe('AST traversal — single-pass visitor', () => {
    it('walks mdast and dispatches enter handlers per node type', () => {
      const visited: string[] = [];
      const rule = dummyRule({
        create(): RuleListeners {
          return {
            enter: {
              heading: () => visited.push('heading'),
              paragraph: () => visited.push('paragraph'),
            },
          };
        },
      });
      runRule(rule, {
        content: '# Title\n\nSome text.',
        path: 'test.md',
      });
      expect(visited).toEqual(['heading', 'paragraph']);
    });

    it('dispatches exit handlers in post-order', () => {
      const sequence: string[] = [];
      const rule = dummyRule({
        create(): RuleListeners {
          return {
            enter: { heading: () => sequence.push('enter:heading') },
            exit: { heading: () => sequence.push('exit:heading') },
          };
        },
      });
      runRule(rule, { content: '# Title', path: 'test.md' });
      expect(sequence).toEqual(['enter:heading', 'exit:heading']);
    });

    it('does NOT parse the AST when rule returns void (filename-style)', () => {
      // Pass invalid markdown that would crash the parser if parsed.
      // Filename-style rules should never trigger parsing.
      const rule = dummyRule({
        create(context) {
          context.report({ messageId: 'noop', data: {} });
        },
      });
      // This should not throw even with weird content because parse is skipped
      const diagnostics = runRule(rule, {
        content: '\x00\uFFFE\uFFFF',
        path: 'test.md',
      });
      expect(diagnostics).toHaveLength(1);
    });
  });

  describe('runRulesOnFile — multiple rules, one tree walk', () => {
    it('dispatches the same node to handlers from all rules', () => {
      const a: string[] = [];
      const b: string[] = [];
      const ruleA = dummyRule({
        meta: {
          name: 'test/a',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: 'a', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create: (): RuleListeners => ({ enter: { heading: () => a.push('A') } }),
      });
      const ruleB = dummyRule({
        meta: {
          name: 'test/b',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: 'b', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create: (): RuleListeners => ({ enter: { heading: () => b.push('B') } }),
      });
      runRulesOnFile([ruleA, ruleB], { content: '# T', path: 'test.md' });
      expect(a).toEqual(['A']);
      expect(b).toEqual(['B']);
    });
  });

  describe('frontmatter extraction', () => {
    it('exposes parsed YAML frontmatter via context.frontmatter', () => {
      let captured: Record<string, unknown> | null = null;
      const rule = dummyRule({
        create(context) {
          captured = context.frontmatter;
        },
      });
      runRule(rule, {
        content: '---\nstatus: accepted\nfoo: bar\n---\n\n# Body',
        path: 'test.md',
      });
      expect(captured).toMatchObject({ status: 'accepted', foo: 'bar' });
    });

    it('returns null when no frontmatter is present', () => {
      let captured: Record<string, unknown> | null = { sentinel: true };
      const rule = dummyRule({
        create(context) {
          captured = context.frontmatter;
        },
      });
      runRule(rule, { content: '# Just body', path: 'test.md' });
      expect(captured).toBeNull();
    });

    it('strips frontmatter from the body before mdast parsing', () => {
      const headings: string[] = [];
      const rule = dummyRule({
        create(): RuleListeners {
          return {
            enter: {
              heading: (node) => {
                if ('children' in node && node.children?.[0]?.type === 'text') {
                  headings.push(node.children[0].value);
                }
              },
            },
          };
        },
      });
      runRule(rule, {
        content: '---\nstatus: accepted\n---\n\n# Real Heading',
        path: 'test.md',
      });
      // Should contain 'Real Heading', not anything from frontmatter
      expect(headings).toEqual(['Real Heading']);
    });
  });

  describe('AJV options validation', () => {
    it('throws when options violate rule.meta.schema', () => {
      const rule = dummyRule({
        meta: {
          name: 'test/with-schema',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: { x: 'default' },
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { x: { type: 'string' } },
          },
        },
        create() {},
      });
      expect(() =>
        runRule(rule, { content: '', path: 't.md' }, { options: { x: 123 } }),
      ).toThrow(/Invalid options for rule test\/with-schema/);
    });

    it('skipValidation: true bypasses AJV', () => {
      const rule = dummyRule({
        meta: {
          name: 'test/with-schema',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: { x: 'default' },
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { x: { type: 'string' } },
          },
        },
        create() {},
      });
      expect(() =>
        runRule(
          rule,
          { content: '', path: 't.md' },
          { options: { x: 123 }, skipValidation: true },
        ),
      ).not.toThrow();
    });
  });

  describe('runtime severity', () => {
    it('uses runtime.severity when provided', () => {
      const rule = dummyRule({
        create(context) {
          context.report({ messageId: 'foo', data: {} });
        },
      });
      const diagnostics = runRule(
        rule,
        { content: '', path: 't.md' },
        { severity: 'warn' },
      );
      expect(diagnostics[0]?.severity).toBe('warn');
    });
  });

  describe('AJV throws RuleOptionsError (typed)', () => {
    it('callers can instanceof to discriminate', () => {
      const rule = dummyRule({
        meta: {
          name: 'test/with-schema',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: { x: 'default' },
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { x: { type: 'string' } },
          },
        },
        create() {},
      });
      try {
        runRule(rule, { content: '', path: 't.md' }, { options: { x: 123 } });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RuleOptionsError);
        expect((err as RuleOptionsError).ruleName).toBe('test/with-schema');
      }
    });
  });

  describe('nested AST traversal', () => {
    it('walks heading > strong > text and visits all node types in order', () => {
      const order: string[] = [];
      const rule = dummyRule({
        create(): RuleListeners {
          return {
            enter: {
              heading: () => order.push('enter:heading'),
              strong: () => order.push('enter:strong'),
              text: () => order.push('enter:text'),
            },
            exit: {
              heading: () => order.push('exit:heading'),
              strong: () => order.push('exit:strong'),
              text: () => order.push('exit:text'),
            },
          };
        },
      });
      runRule(rule, { content: '# **bold**', path: 't.md' });
      expect(order).toEqual([
        'enter:heading',
        'enter:strong',
        'enter:text',
        'exit:text',
        'exit:strong',
        'exit:heading',
      ]);
    });
  });

  describe('listener insertion order is deterministic', () => {
    it('dispatches handlers in rule registration order', () => {
      const calls: string[] = [];
      const ruleA = dummyRule({
        meta: {
          name: 'test/a',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create: (): RuleListeners => ({
          enter: { heading: () => calls.push('A') },
        }),
      });
      const ruleB = dummyRule({
        meta: {
          name: 'test/b',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create: (): RuleListeners => ({
          enter: { heading: () => calls.push('B') },
        }),
      });
      runRulesOnFile([ruleA, ruleB], { content: '# T', path: 't.md' });
      expect(calls).toEqual(['A', 'B']);
    });
  });

  describe('error isolation — buggy rule does not abort the run', () => {
    it('catches throws from create() as core/internal-error', () => {
      const goodRule = dummyRule({
        meta: {
          name: 'test/good',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create(context) {
          context.report({ messageId: 'fine', data: {} });
        },
      });
      const buggyRule = dummyRule({
        meta: {
          name: 'test/buggy',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create() {
          throw new Error('kaboom');
        },
      });
      const diagnostics = runRulesOnFile([goodRule, buggyRule], {
        content: '',
        path: 't.md',
      });
      // Good rule still ran
      expect(diagnostics.find((d) => d.ruleName === 'test/good')).toBeDefined();
      // Internal error captured
      const internalErr = diagnostics.find((d) => d.ruleName === 'core/internal-error');
      expect(internalErr).toBeDefined();
      expect(internalErr?.data).toMatchObject({
        rule: 'test/buggy',
        operation: 'create',
        error: 'kaboom',
      });
    });

    it('catches throws from listener handlers as core/internal-error', () => {
      const buggyRule = dummyRule({
        meta: {
          name: 'test/buggy-handler',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        create: (): RuleListeners => ({
          enter: {
            heading() {
              throw new Error('handler kaboom');
            },
          },
        }),
      });
      const diagnostics = runRule(buggyRule, {
        content: '# Heading',
        path: 't.md',
      });
      const internalErr = diagnostics.find((d) => d.ruleName === 'core/internal-error');
      expect(internalErr).toBeDefined();
      expect(internalErr?.data).toMatchObject({
        rule: 'test/buggy-handler',
        operation: 'enter',
      });
    });
  });

  describe('root subscription', () => {
    it('rules can subscribe to enter/exit on root node', () => {
      const order: string[] = [];
      const rule = dummyRule({
        create(): RuleListeners {
          return {
            enter: {
              root: () => order.push('enter:root'),
              heading: () => order.push('enter:heading'),
            },
            exit: {
              root: () => order.push('exit:root'),
            },
          };
        },
      });
      runRule(rule, { content: '# Title', path: 't.md' });
      expect(order).toEqual(['enter:root', 'enter:heading', 'exit:root']);
    });
  });

  describe('node argument types', () => {
    it('passes MdastNode to handlers', () => {
      let captured: MdastNode | null = null;
      const rule = dummyRule({
        create(): RuleListeners {
          return {
            enter: {
              heading(node) {
                captured = node;
              },
            },
          };
        },
      });
      runRule(rule, { content: '# Title', path: 't.md' });
      expect(captured).not.toBeNull();
      expect(captured!.type).toBe('heading');
    });
  });

  describe('multi-file isolation', () => {
    it('does not leak state across runRulesOnFile calls', () => {
      const seen: Array<{ path: string; count: number }> = [];
      const rule = dummyRule({
        create(): RuleListeners {
          let local = 0;
          return {
            enter: {
              heading() {
                local++;
              },
            },
            exit: {
              root() {
                // Recording per-call counter (closure scoped to each create() call)
                // demonstrates that state is per invocation, not global.
              },
            },
          };
        },
      });
      // Spy: rebind create to track calls
      let calls = 0;
      const spyRule = dummyRule({
        meta: rule.meta,
        create(): RuleListeners {
          const myCall = ++calls;
          return {
            enter: {
              heading() {
                seen.push({ path: `call-${myCall}`, count: myCall });
              },
            },
          };
        },
      });
      runRulesOnFile([spyRule], { content: '# A\n# B', path: 'first.md' });
      runRulesOnFile([spyRule], { content: '# C', path: 'second.md' });
      // First call had 2 headings, second had 1
      expect(seen.filter((s) => s.path === 'call-1')).toHaveLength(2);
      expect(seen.filter((s) => s.path === 'call-2')).toHaveLength(1);
    });

    it('does not propagate diagnostics from one call into the next', () => {
      const rule = dummyRule({
        create(context) {
          context.report({ messageId: 'mark', data: {} });
        },
      });
      const first = runRule(rule, { content: '', path: 'a.md' });
      const second = runRule(rule, { content: '', path: 'b.md' });
      expect(first).toHaveLength(1);
      expect(first[0]?.path).toBe('a.md');
      expect(second).toHaveLength(1);
      expect(second[0]?.path).toBe('b.md');
    });
  });

  describe('INTERNAL_ERROR_RULE_NAME constant', () => {
    it('matches the internal-error diagnostic ruleName', () => {
      const buggyRule = dummyRule({
        create() {
          throw new Error('boom');
        },
      });
      const diagnostics = runRule(buggyRule, { content: '', path: 't.md' });
      expect(diagnostics[0]?.ruleName).toBe(INTERNAL_ERROR_RULE_NAME);
    });

    it('internal-error severity is always error, never inherits runtime severity', () => {
      const buggyRule = dummyRule({
        create() {
          throw new Error('boom');
        },
      });
      // Pass severity: 'warn' — internal error should still be 'error'
      const diagnostics = runRule(buggyRule, { content: '', path: 't.md' }, { severity: 'warn' });
      expect(diagnostics[0]?.severity).toBe('error');
    });
  });

  describe('runRulesOnProject — cross-file rules', () => {
    it('calls check() once with all files', () => {
      let receivedCount = 0;
      const rule = dummyProjectRule({
        check(context) {
          receivedCount = context.files.length;
        },
      });
      runRulesOnProject([rule], [fakeProjectFile('a.md'), fakeProjectFile('b.md')]);
      expect(receivedCount).toBe(2);
    });

    it('collects diagnostics with explicit path from report()', () => {
      const rule = dummyProjectRule({
        check(context) {
          for (const file of context.files) {
            context.report({
              messageId: 'tagged',
              path: file.path,
              data: { which: file.path },
            });
          }
        },
      });
      const diagnostics = runRulesOnProject(
        [rule],
        [fakeProjectFile('a.md'), fakeProjectFile('b.md')],
      );
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.map((d) => d.path).toSorted()).toEqual(['a.md', 'b.md']);
    });

    it('captures throw from check() as core/internal-error', () => {
      const rule = dummyProjectRule({
        meta: {
          name: 'test/buggy-project',
          type: 'project',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: {},
        },
        check() {
          throw new Error('project-boom');
        },
      });
      const diagnostics = runRulesOnProject([rule], [fakeProjectFile('a.md')]);
      const internalErr = diagnostics.find(
        (d) => d.ruleName === INTERNAL_ERROR_RULE_NAME,
      );
      expect(internalErr).toBeDefined();
      expect(internalErr?.data).toMatchObject({
        rule: 'test/buggy-project',
        operation: 'check',
        error: 'project-boom',
      });
    });

    it('throws RuleOptionsError on invalid options', () => {
      const rule = dummyProjectRule({
        meta: {
          name: 'test/with-schema',
          type: 'project',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: {},
          defaultOptions: { x: 'default' },
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { x: { type: 'string' } },
          },
        },
      });
      expect(() =>
        runRulesOnProject([rule], [], { options: { x: 123 } }),
      ).toThrow(RuleOptionsError);
    });

    it('honors runtime.severity', () => {
      const rule = dummyProjectRule({
        check(context) {
          context.report({ messageId: 'tag', path: 'a.md', data: {} });
        },
      });
      const diagnostics = runRulesOnProject([rule], [fakeProjectFile('a.md')], {
        severity: 'warn',
      });
      expect(diagnostics[0]?.severity).toBe('warn');
    });
  });

  describe('buildProjectFile', () => {
    it('parses frontmatter and AST', () => {
      const projectFile = buildProjectFile({
        content: '---\nstatus: accepted\n---\n\n# Title\n',
        path: 't.md',
      });
      expect(projectFile.frontmatter).toMatchObject({ status: 'accepted' });
      expect(projectFile.ast.type).toBe('root');
    });

    it('preserves the original content', () => {
      const content = '# Just a body\n';
      const projectFile = buildProjectFile({ content, path: 't.md' });
      expect(projectFile.content).toBe(content);
      expect(projectFile.frontmatter).toBeNull();
    });
  });

  describe('per-rule options (optionsByRule)', () => {
    function optionEchoRule(name: string): Rule {
      return dummyRule({
        meta: {
          name,
          type: 'perFile',
          versionCompat: ['v2', 'v3', 'v4'],
          docs: { description: 'echo', recommended: false },
          messages: { echo: '{{tag}}' },
          defaultOptions: { tag: 'default' },
        },
        create(ctx) {
          ctx.report({ messageId: 'echo', data: { tag: ctx.options.tag } });
        },
      });
    }

    function projectOptionEchoRule(name: string): ProjectRule {
      return dummyProjectRule({
        meta: {
          name,
          type: 'project',
          versionCompat: ['v2', 'v3', 'v4'],
          docs: { description: 'echo', recommended: false },
          messages: { echo: '{{tag}}' },
          defaultOptions: { tag: 'default' },
        },
        check(ctx) {
          ctx.report({
            messageId: 'echo',
            path: '<project>',
            data: { tag: ctx.options.tag },
          });
        },
      });
    }

    it('runRulesOnFile gives each rule its own options; others fall back to defaults', () => {
      const a = optionEchoRule('test/a');
      const b = optionEchoRule('test/b');
      const diags = runRulesOnFile([a, b], { path: 'f.md', content: '# x' }, {
        optionsByRule: { 'test/a': { tag: 'AAA' } },
      });
      const byRule = Object.fromEntries(diags.map((d) => [d.ruleName, d.data?.tag]));
      expect(byRule['test/a']).toBe('AAA');
      expect(byRule['test/b']).toBe('default');
    });

    it('runRulesOnProject gives each rule its own options', () => {
      const a = projectOptionEchoRule('test/pa');
      const b = projectOptionEchoRule('test/pb');
      const diags = runRulesOnProject([a, b], [fakeProjectFile('x.md')], {
        optionsByRule: { 'test/pa': { tag: 'PA' } },
      });
      const byRule = Object.fromEntries(diags.map((d) => [d.ruleName, d.data?.tag]));
      expect(byRule['test/pa']).toBe('PA');
      expect(byRule['test/pb']).toBe('default');
    });

    it('single-rule runtime.options still works (back-compat)', () => {
      const a = optionEchoRule('test/a');
      const diags = runRule(a, { path: 'f.md', content: '# x' }, {
        options: { tag: 'VIA_OPTIONS' },
      });
      expect(diags[0]?.data?.tag).toBe('VIA_OPTIONS');
    });
  });

  // Self-contained diagnostics (#67): the runner resolves a per-message
  // `suggestion` (interpolated like the message) and a `docsUrl` at report time.
  describe('suggestion + docsUrl resolution', () => {
    function suggestingRule(): Rule {
      return dummyRule({
        meta: {
          name: 'test/suggest',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: {
            description: 'x',
            url: 'https://docs.example/suggest/',
            recommended: false,
          },
          messages: { m: 'message {{v}}' },
          suggestions: { m: 'fix {{v}} now' },
          defaultOptions: {},
        },
        create(ctx) {
          ctx.report({ messageId: 'm', data: { v: 42 } });
        },
      });
    }

    it('interpolates suggestion from meta.suggestions and resolves docsUrl', () => {
      const d = runRule(suggestingRule(), { content: '', path: 't.md' })[0];
      expect(d?.suggestion).toBe('fix 42 now');
      expect(d?.docsUrl).toBe('https://docs.example/suggest/');
    });

    it('sets suggestion null when the rule declares none for the messageId', () => {
      const rule = dummyRule({
        create(ctx) {
          ctx.report({ messageId: 'noSuggestion', data: {} });
        },
      });
      const d = runRule(rule, { content: '', path: 't.md' })[0];
      expect(d?.suggestion).toBeNull();
      // dummyRule has no docs.url → empty string, never undefined
      expect(d?.docsUrl).toBe('');
    });

    it('internal-error diagnostics point docsUrl at the repo, suggestion null', () => {
      const buggy = dummyRule({
        create() {
          throw new Error('boom');
        },
      });
      const d = runRule(buggy, { content: '', path: 't.md' })[0];
      expect(d?.ruleName).toBe(INTERNAL_ERROR_RULE_NAME);
      expect(d?.suggestion).toBeNull();
      expect(d?.docsUrl).toContain('github.com/knktkc/madr-lint');
    });

    it('project rules resolve suggestion + docsUrl too', () => {
      const rule = dummyProjectRule({
        meta: {
          name: 'test/project-suggest',
          type: 'project',
          versionCompat: ['v2'],
          docs: {
            description: 'x',
            url: 'https://docs.example/project/',
            recommended: false,
          },
          messages: { m: 'msg' },
          suggestions: { m: 'do {{x}}' },
          defaultOptions: {},
        },
        check(ctx) {
          ctx.report({ messageId: 'm', path: 'a.md', data: { x: 'it' } });
        },
      });
      const d = runRulesOnProject([rule], [fakeProjectFile('a.md')])[0];
      expect(d?.suggestion).toBe('do it');
      expect(d?.docsUrl).toBe('https://docs.example/project/');
    });
  });

  // Autofix framework (#28): meta.fixable gates whether a rule may attach a
  // `fix` thunk. The runner resolves a durable `fixable` boolean per diagnostic
  // and carries the (transient) thunk for the applier.
  describe('fixable resolution', () => {
    function fixableRule(fix: boolean): Rule {
      return dummyRule({
        meta: {
          name: 'test/fixable',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: { m: 'msg' },
          defaultOptions: {},
          fixable: 'code',
        },
        create(ctx) {
          ctx.report({
            messageId: 'm',
            data: {},
            ...(fix ? { fix: (f) => f.insertAt(0, 'x') } : {}),
          });
        },
      });
    }

    it('sets fixable:true and carries the fix thunk when a fixable rule attaches one', () => {
      const d = runRule(fixableRule(true), { content: '# x', path: 't.md' })[0];
      expect(d?.fixable).toBe(true);
      expect(typeof d?.fix).toBe('function');
    });

    it('sets fixable:false for a fixable rule that reports without a fix', () => {
      const d = runRule(fixableRule(false), { content: '# x', path: 't.md' })[0];
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });

    it('sets fixable:false for a non-fixable rule (default)', () => {
      const rule = dummyRule({
        create(ctx) {
          ctx.report({ messageId: 'm', data: {} });
        },
      });
      const d = runRule(rule, { content: '# x', path: 't.md' })[0];
      expect(d?.fixable).toBe(false);
    });

    it('routes a fix from a rule WITHOUT meta.fixable through core/internal-error', () => {
      // A rule that attaches a fix but never declared meta.fixable is a bug —
      // the runner throws, which the create() isolation converts to
      // core/internal-error. The misused diagnostic itself never surfaces.
      const rule = dummyRule({
        meta: {
          name: 'test/misuse',
          type: 'perFile',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: { m: 'msg' },
          defaultOptions: {},
          // no `fixable`
        },
        create(ctx) {
          ctx.report({ messageId: 'm', data: {}, fix: (f) => f.insertAt(0, 'x') });
        },
      });
      const diags = runRule(rule, { content: '# x', path: 't.md' });
      const err = diags.find((d) => d.ruleName === INTERNAL_ERROR_RULE_NAME);
      expect(err).toBeDefined();
      expect(err?.data).toMatchObject({ rule: 'test/misuse', operation: 'create' });
      expect(diags.find((d) => d.messageId === 'm')).toBeUndefined();
    });
  });

  // Cross-file autofix (#29): the same fixable gate applies to project rules —
  // a `meta.fixable: 'code'` project rule may attach a fix thunk that the runner
  // carries onto the diagnostic; a fix from a non-fixable project rule is a bug.
  describe('project-rule fixable resolution', () => {
    function fixableProjectRule(fix: boolean): ProjectRule {
      return dummyProjectRule({
        meta: {
          name: 'test/project-fixable',
          type: 'project',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: { m: 'msg' },
          defaultOptions: {},
          fixable: 'code',
        },
        check(ctx) {
          ctx.report({
            messageId: 'm',
            path: 'a.md',
            data: {},
            ...(fix ? { fix: (f) => f.insertAt(0, 'x') } : {}),
          });
        },
      });
    }

    it('sets fixable:true and carries the fix thunk when a fixable project rule attaches one', () => {
      const d = runRulesOnProject(
        [fixableProjectRule(true)],
        [fakeProjectFile('a.md')],
      )[0];
      expect(d?.fixable).toBe(true);
      expect(typeof d?.fix).toBe('function');
    });

    it('sets fixable:false when a fixable project rule reports without a fix', () => {
      const d = runRulesOnProject(
        [fixableProjectRule(false)],
        [fakeProjectFile('a.md')],
      )[0];
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });

    it('routes a fix from a project rule WITHOUT meta.fixable through core/internal-error', () => {
      const rule = dummyProjectRule({
        meta: {
          name: 'test/project-misuse',
          type: 'project',
          versionCompat: ['v2'],
          docs: { description: '', recommended: false },
          messages: { m: 'msg' },
          defaultOptions: {},
          // no `fixable`
        },
        check(ctx) {
          ctx.report({
            messageId: 'm',
            path: 'a.md',
            data: {},
            fix: (f) => f.insertAt(0, 'x'),
          });
        },
      });
      const diags = runRulesOnProject([rule], [fakeProjectFile('a.md')]);
      const err = diags.find((d) => d.ruleName === INTERNAL_ERROR_RULE_NAME);
      expect(err).toBeDefined();
      expect(err?.data).toMatchObject({
        rule: 'test/project-misuse',
        operation: 'check',
      });
      expect(diags.find((d) => d.messageId === 'm')).toBeUndefined();
    });
  });
});

describe('core/runner — madrVersion (#207)', () => {
  const V2 = '# T\n\n* Status: accepted\n';
  const V4 = '---\nstatus: accepted\ndecision-makers: alice\n---\n\n# T\n';
  const NONE = '# T\n\nprose\n';

  function captureVersion(): {
    rule: Rule;
    seen: Array<{ version: unknown; metadata: unknown; list: unknown }>;
  } {
    const seen: Array<{ version: unknown; metadata: unknown; list: unknown }> = [];
    const rule = dummyRule({
      create(context) {
        seen.push({
          version: context.madrVersion,
          metadata: context.metadata,
          list: context.listMetadata,
        });
      },
    });
    return { rule, seen };
  }

  describe('context.madrVersion', () => {
    it.for([
      ['auto', V2, 'v2'],
      ['auto', V4, 'v4'],
      ['auto', NONE, null],
      ['v3', V2, 'v3'],
      ['v2', V4, 'v2'],
    ] as const)('%s on %j → %s', ([configured, content, expected]) => {
      const { rule, seen } = captureVersion();
      runRulesOnFile([rule], { path: 'a.md', content }, { madrVersion: configured });
      expect(seen[0]?.version).toBe(expected);
    });

    it('defaults to auto', () => {
      const { rule, seen } = captureVersion();
      runRulesOnFile([rule], { path: 'a.md', content: V2 });
      expect(seen[0]?.version).toBe('v2');
    });
  });

  describe('context.metadata follows the version, context.listMetadata stays raw', () => {
    it("'v4' reads no metadata from a body list", () => {
      const { rule, seen } = captureVersion();
      runRulesOnFile([rule], { path: 'a.md', content: V2 }, { madrVersion: 'v4' });
      expect(seen[0]?.metadata).toBeNull();
      expect(seen[0]?.list).toEqual({ status: 'accepted' });
    });

    it("'v2' reads no metadata from frontmatter", () => {
      const { rule, seen } = captureVersion();
      runRulesOnFile([rule], { path: 'a.md', content: V4 }, { madrVersion: 'v2' });
      expect(seen[0]?.metadata).toBeNull();
    });
  });

  describe('meta.versionCompat is honored for per-file rules', () => {
    function v3v4Rule(): { rule: Rule; runs: () => number } {
      let count = 0;
      const rule = dummyRule({
        meta: { versionCompat: ['v3', 'v4'] } as Partial<Rule['meta']> as Rule['meta'],
        create() {
          count++;
        },
      });
      return { rule, runs: () => count };
    }

    it.for([
      ['v2', NONE, 0],
      ['auto', V2, 0],
      ['v4', V2, 1],
      ['auto', V4, 1],
      ['auto', NONE, 1],
    ] as const)('%s on %j runs %d time(s)', ([configured, content, expected]) => {
      const { rule, runs } = v3v4Rule();
      runRulesOnFile([rule], { path: 'a.md', content }, { madrVersion: configured });
      expect(runs()).toBe(expected);
    });

    it('does not parse a file to decide a rule that supports every version', () => {
      // A filename-only rule must keep its zero-parse fast path: unparseable
      // frontmatter would surface as a parse error if anything parsed it.
      const rule = dummyRule({ create: () => undefined });
      const diagnostics = runRulesOnFile(
        [rule],
        { path: 'a.md', content: '---\n: : :\n---\n' },
        { madrVersion: 'auto' },
      );
      expect(diagnostics).toEqual([]);
    });
  });

  describe('meta.versionCompat is honored for project rules', () => {
    function v3v4ProjectRule(): { rule: ProjectRule; runs: () => number } {
      let count = 0;
      const rule = dummyProjectRule({
        meta: { versionCompat: ['v3', 'v4'] } as Partial<ProjectRule['meta']> as ProjectRule['meta'],
        check() {
          count++;
        },
      });
      return { rule, runs: () => count };
    }

    it('skips the rule when the configured version is outside versionCompat', () => {
      const { rule, runs } = v3v4ProjectRule();
      runRulesOnProject([rule], [fakeProjectFile('a.md')], { madrVersion: 'v2' });
      expect(runs()).toBe(0);
    });

    it.for(['auto', 'v3', 'v4'] as const)(
      'runs the rule over every file under %s',
      (configured) => {
        const { rule, runs } = v3v4ProjectRule();
        runRulesOnProject([rule], [fakeProjectFile('a.md')], {
          madrVersion: configured,
        });
        expect(runs()).toBe(1);
      },
    );
  });

  describe('buildProjectFile', () => {
    it('reads metadata for the configured version', () => {
      expect(buildProjectFile({ path: 'a.md', content: V2 }, 'v4').metadata).toBeNull();
      expect(buildProjectFile({ path: 'a.md', content: V2 }).metadata).toEqual({
        status: 'accepted',
      });
    });
  });
});
