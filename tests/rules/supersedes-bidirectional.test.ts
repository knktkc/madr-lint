import { describe, it, expect } from 'vitest';
import { jsonReporter } from '../../src/core/reporter.js';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import type { AnyRule, Diagnostic } from '../../src/core/types.js';
import rule from '../../src/rules/supersedes-bidirectional/index.js';

// Render diagnostics through the real reporter pipeline so tests pin the
// message text a user actually sees (template + interpolation together).
function renderMessages(diagnostics: readonly Diagnostic[]): string[] {
  const rules = new Map<string, AnyRule>([[rule.meta.name, rule]]);
  const parsed = JSON.parse(jsonReporter.format(diagnostics, rules)) as {
    results: Array<{ message: string }>;
  };
  return parsed.results.map((r) => r.message);
}

function file(path: string, frontmatter: Record<string, unknown>): ReturnType<typeof buildProjectFile> {
  const fmYaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => `  - ${JSON.stringify(item)}`).join('\n')}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join('\n');
  const content = fmYaml ? `---\n${fmYaml}\n---\n\n# x\n` : '# x\n';
  return buildProjectFile({ path, content });
}

describe('madr/supersedes-bidirectional', () => {
  describe('valid pairings', () => {
    it('A.supersedes=[B], B.superseded-by=[A] → no diagnostics', () => {
      const files = [
        file('0001-old.md', { 'superseded-by': 'ADR-0042' }),
        file('0042-new.md', { supersedes: 'ADR-0001' }),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('array form on both sides', () => {
      const files = [
        file('0001-a.md', { 'superseded-by': ['ADR-0042'] }),
        file('0042-b.md', { supersedes: ['ADR-0001'] }),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('many-to-one supersession', () => {
      const files = [
        file('0001-a.md', { 'superseded-by': 'ADR-0042' }),
        file('0002-b.md', { 'superseded-by': 'ADR-0042' }),
        file('0042-merge.md', { supersedes: ['ADR-0001', 'ADR-0002'] }),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('files without supersedes/superseded-by are ignored', () => {
      const files = [
        file('0001-a.md', { status: 'accepted' }),
        file('0002-b.md', { status: 'accepted' }),
      ];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });
  });

  describe('missingBackReference', () => {
    it('forward reference but target silent', () => {
      const files = [
        file('0001-old.md', {}),
        file('0042-new.md', { supersedes: 'ADR-0001' }),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleName: 'madr/supersedes-bidirectional',
        messageId: 'missingBackReference',
        path: '0001-old.md',
        data: {
          // ref is the target's own ADR-NNNN identifier (the file missing the back-ref)
          ref: 'ADR-0001',
          source: '0042-new.md',
          expected: 'ADR-0042',
          direction: 'superseded-by',
        },
      });
      // self-contained diagnostics (#67): the back-reference to add is mechanical
      expect(diagnostics[0]?.suggestion).toBe(
        'add "superseded-by: ADR-0042" to the frontmatter of this file',
      );
      expect(diagnostics[0]?.docsUrl).toBe(
        'https://knktkc.github.io/madr-lint/rules/supersedes-bidirectional/',
      );
    });

    it('back reference but source silent', () => {
      const files = [
        file('0001-old.md', { 'superseded-by': 'ADR-0042' }),
        file('0042-new.md', {}),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        messageId: 'missingBackReference',
        path: '0042-new.md',
        data: {
          ref: 'ADR-0042',
          source: '0001-old.md',
          expected: 'ADR-0001',
          direction: 'supersedes',
        },
      });
    });

    // The rendered message must name the field the source file ACTUALLY
    // declares (`declared`), not the field the target should add — the
    // pre-fix template printed `direction`, claiming a `supersedes:` source
    // declared `superseded-by:` (and vice versa).
    it('message names the declared field correctly (forward: source declares supersedes)', () => {
      const files = [
        file('0001-old.md', {}),
        file('0042-new.md', { supersedes: 'ADR-0001' }),
      ];
      const [message] = renderMessages(runRulesOnProject([rule], files));
      expect(message).toBe(
        '`0042-new.md` declares `supersedes: ADR-0001`, but `ADR-0001` (this file) does not back-reference it via `superseded-by: ADR-0042`',
      );
    });

    it('message names the declared field correctly (backward: source declares superseded-by)', () => {
      const files = [
        file('0001-old.md', { 'superseded-by': 'ADR-0042' }),
        file('0042-new.md', {}),
      ];
      const [message] = renderMessages(runRulesOnProject([rule], files));
      expect(message).toBe(
        '`0001-old.md` declares `superseded-by: ADR-0042`, but `ADR-0042` (this file) does not back-reference it via `supersedes: ADR-0001`',
      );
    });

    it('many-to-one with one missing back reference', () => {
      const files = [
        file('0001-a.md', { 'superseded-by': 'ADR-0042' }),
        file('0002-b.md', {}), // missing back-reference
        file('0042-merge.md', { supersedes: ['ADR-0001', 'ADR-0002'] }),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        path: '0002-b.md',
        data: {
          ref: 'ADR-0002',
          expected: 'ADR-0042',
          source: '0042-merge.md',
          direction: 'superseded-by',
        },
      });
    });
  });

  describe('unknownReference', () => {
    it('supersedes points to non-existent ADR', () => {
      const files = [file('0042-x.md', { supersedes: 'ADR-9999' })];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        messageId: 'unknownReference',
        path: '0042-x.md',
        data: { ref: 'ADR-9999', direction: 'supersedes' },
      });
      // self-contained diagnostics (#67)
      expect(diagnostics[0]?.suggestion).toContain('ADR-9999');
    });

    it('superseded-by points to non-existent ADR', () => {
      const files = [file('0001-x.md', { 'superseded-by': 'ADR-9999' })];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        messageId: 'unknownReference',
        data: { ref: 'ADR-9999', direction: 'superseded-by' },
      });
    });

    it('multiple unknown refs in an array', () => {
      const files = [file('0042-x.md', { supersedes: ['ADR-9998', 'ADR-9999'] })];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.map((d) => d.data?.ref).toSorted()).toEqual([
        'ADR-9998',
        'ADR-9999',
      ]);
    });
  });

  describe('non-string / non-array values are silently ignored', () => {
    it('numeric supersedes value', () => {
      const files = [file('0042-x.md', { supersedes: 42 })];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });

    it('null superseded-by value', () => {
      const files = [file('0001-x.md', { 'superseded-by': null })];
      expect(runRulesOnProject([rule], files)).toEqual([]);
    });
  });

  describe('files without ADR-NNNN basenames are ignored as targets', () => {
    it('ignores README.md when ADR ref points to it accidentally', () => {
      // template.md does not have a NNNN- prefix; it cannot be the target
      // of `supersedes: ADR-XXXX`, so a forward reference to ADR-9999 is
      // unknownReference even if there is a `template.md` in the directory.
      const files = [
        file('template.md', {}),
        file('0042-x.md', { supersedes: 'ADR-9999' }),
      ];
      const diagnostics = runRulesOnProject([rule], files);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.messageId).toBe('unknownReference');
    });
  });
});
