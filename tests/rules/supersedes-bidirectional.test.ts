import { describe, it, expect } from 'vitest';
import { applyEdits, makeFixer } from '../../src/core/fix.js';
import { jsonReporter } from '../../src/core/reporter.js';
import { buildProjectFile, runRulesOnProject } from '../../src/core/runner.js';
import type { AnyRule, Diagnostic } from '../../src/core/types.js';
import rule from '../../src/rules/supersedes-bidirectional/index.js';

/**
 * Apply a project-rule fix to the target file's content. Project fixes work in
 * WHOLE-FILE coordinates (they touch frontmatter, which body coordinates strip),
 * so the fixer's base offset is 0.
 */
function applyProjectFix(
  targetContent: string,
  d: { fix?: (f: ReturnType<typeof makeFixer>) => unknown },
): string {
  const edit = d.fix?.(makeFixer(0));
  const edits = Array.isArray(edit) ? edit : edit ? [edit] : [];
  return applyEdits(targetContent, edits as never);
}

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

  // Autofix (#29): the FIRST cross-file fix. A `missingBackReference` diagnostic
  // carries a fix that inserts the reciprocal key/value into the target file's
  // EXISTING YAML frontmatter, immediately before the closing `---`. Guard rails:
  // frontmatter must exist, the key must not already be present, and the byte
  // slice at the insertion point must be the closing fence. `unknownReference`
  // is contextual and never fixable.
  describe('autofix (cross-file back-reference insertion)', () => {
    it('missingBackReference is fixable and inserts the key before the closing fence', () => {
      const target = buildProjectFile({
        path: '0001-old.md',
        content: '---\nstatus: accepted\n---\n\n# B\n',
      });
      const source = buildProjectFile({
        path: '0042-new.md',
        content: '---\nsupersedes: ADR-0001\n---\n\n# A\n',
      });
      const d = runRulesOnProject([rule], [target, source])[0];
      expect(d?.messageId).toBe('missingBackReference');
      expect(d?.path).toBe('0001-old.md');
      expect(d?.fixable).toBe(true);
      expect(applyProjectFix(target.content, d!)).toBe(
        '---\nstatus: accepted\nsuperseded-by: ADR-0042\n---\n\n# B\n',
      );
    });

    it('backward-direction missingBackReference inserts `supersedes` into the source target', () => {
      const target = buildProjectFile({
        path: '0042-new.md',
        content: '---\nstatus: accepted\n---\n\n# A\n',
      });
      const source = buildProjectFile({
        path: '0001-old.md',
        content: '---\nsuperseded-by: ADR-0042\n---\n\n# B\n',
      });
      const d = runRulesOnProject([rule], [target, source])[0];
      expect(d?.messageId).toBe('missingBackReference');
      expect(d?.path).toBe('0042-new.md');
      expect(d?.fixable).toBe(true);
      expect(applyProjectFix(target.content, d!)).toBe(
        '---\nstatus: accepted\nsupersedes: ADR-0001\n---\n\n# A\n',
      );
    });

    it('preserves CRLF frontmatter (inserts with the file’s newline style)', () => {
      const target = buildProjectFile({
        path: '0001-old.md',
        content: '---\r\nstatus: accepted\r\n---\r\n\r\n# B\r\n',
      });
      const source = buildProjectFile({
        path: '0042-new.md',
        content: '---\r\nsupersedes: ADR-0001\r\n---\r\n\r\n# A\r\n',
      });
      const d = runRulesOnProject([rule], [target, source])[0];
      expect(d?.fixable).toBe(true);
      expect(applyProjectFix(target.content, d!)).toBe(
        '---\r\nstatus: accepted\r\nsuperseded-by: ADR-0042\r\n---\r\n\r\n# B\r\n',
      );
    });

    it('declines when the target has NO frontmatter (bare body — YAML block creation is out of scope)', () => {
      const target = buildProjectFile({ path: '0001-old.md', content: '# B\n' });
      const source = buildProjectFile({
        path: '0042-new.md',
        content: '---\nsupersedes: ADR-0001\n---\n\n# A\n',
      });
      const d = runRulesOnProject([rule], [target, source])[0];
      expect(d?.messageId).toBe('missingBackReference');
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });

    it('declines when the key already exists with a WRONG value (value rewrite out of scope)', () => {
      // B already has `superseded-by: ADR-0007` (a correct back-ref to C), so no
      // unknownReference fires; but source A (ADR-0042) still needs a back-ref B
      // does not carry. The key is present → the value-rewrite is out of scope,
      // so the missingBackReference from A is not fixable.
      const target = buildProjectFile({
        path: '0001-old.md',
        content: '---\nsuperseded-by: ADR-0007\n---\n\n# B\n',
      });
      const sourceA = buildProjectFile({
        path: '0042-new.md',
        content: '---\nsupersedes: ADR-0001\n---\n\n# A\n',
      });
      const sourceC = buildProjectFile({
        path: '0007-c.md',
        content: '---\nsupersedes: ADR-0001\n---\n\n# C\n',
      });
      const diags = runRulesOnProject([rule], [target, sourceA, sourceC]);
      const d = diags.find(
        (x) => x.messageId === 'missingBackReference' && x.data?.expected === 'ADR-0042',
      );
      expect(d).toBeDefined();
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });

    it('declines when a CASE VARIANT of the key already exists (no contradictory duplicate)', () => {
      // `Superseded-By:` is a case variant of the field the fix would insert.
      // A second, lowercase `superseded-by:` line would be valid YAML but read
      // as contradictory duplicates to a human — the existing-key guard must
      // match case-insensitively.
      const target = buildProjectFile({
        path: '0001-old.md',
        content: '---\nSuperseded-By: ADR-0099\n---\n\n# B\n',
      });
      const source = buildProjectFile({
        path: '0042-new.md',
        content: '---\nsupersedes: ADR-0001\n---\n\n# A\n',
      });
      const d = runRulesOnProject([rule], [target, source]).find(
        (x) => x.messageId === 'missingBackReference',
      );
      expect(d).toBeDefined();
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });

    it('unknownReference is never fixable', () => {
      const source = buildProjectFile({
        path: '0042-x.md',
        content: '---\nsupersedes: ADR-9999\n---\n\n# A\n',
      });
      const d = runRulesOnProject([rule], [source])[0];
      expect(d?.messageId).toBe('unknownReference');
      expect(d?.fixable).toBe(false);
      expect(d?.fix).toBeUndefined();
    });
  });
});
