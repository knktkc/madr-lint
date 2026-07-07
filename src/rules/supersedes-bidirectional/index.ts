import { basename } from 'node:path';
import { frontmatterOffset } from '../../core/parser.js';
import type { Fixer, ProjectFile, ProjectRule, TextEdit } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface SupersedesBidirectionalOptions extends Record<string, unknown> {
  // No options at v0.1.
}

const ADR_NUMBER_REGEX = /^(\d{4})-/;
const FORWARD_FIELD = 'supersedes';
const BACKWARD_FIELD = 'superseded-by';

function extractAdrNumber(path: string): string | null {
  const match = ADR_NUMBER_REGEX.exec(basename(path));
  return match?.[1] ?? null;
}

function normalizeRefs(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compute a whole-file insertion of `key: value` immediately before the closing
 * `---` of the target's EXISTING YAML frontmatter, or null when the fix is not
 * mechanically safe. Frontmatter is treated as opaque lines — NO YAML parsing or
 * serialization (which would reflow the block). Guard rails:
 *   - no frontmatter block (v2 list-sourced or bare body) → null;
 *   - `key` already present as a top-level frontmatter key → null (rewriting a
 *     wrong value, or appending to an existing key, is out of scope);
 *   - the byte slice at the computed offset must be the closing fence.
 * The file's newline style (LF vs CRLF) is preserved. See #29 / ADR-0008.
 */
function frontmatterInsertEdit(
  content: string,
  key: string,
  value: string,
): { offset: number; text: string } | null {
  const fmEnd = frontmatterOffset(content);
  if (fmEnd === 0) return null; // no frontmatter block

  const fmBlock = content.slice(0, fmEnd);
  // The closing fence is the final `---` line of the block (its own newline is
  // part of fmBlock, so anchor at end). Capture the fence line to derive EOL.
  const closeMatch = /\r?\n(---[ \t]*\r?\n)$/.exec(fmBlock);
  if (!closeMatch) return null;
  const fenceLine = closeMatch[1]!;
  const offset = closeMatch.index + (closeMatch[0].length - fenceLine.length);

  // Slice-verification: the computed offset must sit exactly on the `---` fence.
  if (content.slice(offset, offset + 3) !== '---') return null;

  // The key must not already exist as a top-level frontmatter key. `content`
  // up to the fence is `---<eol>...keys...`; the opening fence cannot match a
  // `key:` line, so scanning the whole prefix is safe.
  const keyPattern = new RegExp(`(^|\\r?\\n)${escapeRegExp(key)}[ \\t]*:`);
  if (keyPattern.test(content.slice(0, offset))) return null;

  const eol = fenceLine.endsWith('\r\n') ? '\r\n' : '\n';
  return { offset, text: `${key}: ${value}${eol}` };
}

/**
 * A fix that inserts `key: value` into `target`'s frontmatter, or undefined when
 * no mechanically-safe insertion exists. The guard rails are evaluated EAGERLY
 * (at report time) so the diagnostic's durable `fixable` flag is accurate — a
 * thunk that merely returns null at apply time would still mark the diagnostic
 * fixable. The cross-file fixer works in WHOLE-FILE coordinates (project fixes
 * touch frontmatter, which body coordinates strip), so the offset is used as-is.
 */
function backReferenceFix(
  target: ProjectFile,
  key: string,
  value: string,
): ((fixer: Fixer) => TextEdit) | undefined {
  const edit = frontmatterInsertEdit(target.content, key, value);
  if (!edit) return undefined;
  return (fixer) => fixer.insertAt(edit.offset, edit.text);
}

const rule: ProjectRule<SupersedesBidirectionalOptions> = {
  meta: {
    name: 'madr/supersedes-bidirectional',
    type: 'project',
    versionCompat: ['v3', 'v4'],
    docs: {
      description:
        'Frontmatter `supersedes` and `superseded-by` must reference each other bidirectionally',
      url: 'https://knktkc.github.io/madr-lint/rules/supersedes-bidirectional/',
      recommended: true,
    },
    messages: {
      unknownReference:
        'Frontmatter `{{direction}}: {{ref}}` references an ADR that does not exist',
      // `declared` is the field the SOURCE file actually declares;
      // `direction` is the field THIS file (the diagnostic's path) must add.
      // They are opposites — rendering `direction` as the declared field
      // would mislabel the source's frontmatter in both directions.
      missingBackReference:
        '`{{source}}` declares `{{declared}}: {{ref}}`, but `{{ref}}` (this file) does not back-reference it via `{{direction}}: {{expected}}`',
    },
    suggestions: {
      unknownReference:
        'correct "{{ref}}" to an existing ADR number, or remove "{{direction}}: {{ref}}" from the frontmatter',
      missingBackReference:
        'add "{{direction}}: {{expected}}" to the frontmatter of this file',
    },
    // Cross-file autofix (#29): `missingBackReference` inserts the reciprocal
    // `<direction>: <expected>` line into the target's EXISTING frontmatter.
    // Targets without frontmatter, or where the key already exists, decline;
    // `unknownReference` is contextual and never fixable.
    fixable: 'code',
    defaultOptions: {},
    schema,
  },
  check(context) {
    // Build ADR-NNNN → file index. Files without a NNNN- prefix are
    // not addressable via `supersedes`/`superseded-by` and thus skipped.
    const adrIndex = new Map<string, ProjectFile>();
    for (const file of context.files) {
      const num = extractAdrNumber(file.path);
      if (num) adrIndex.set(`ADR-${num}`, file);
    }

    // Walk every file with a frontmatter and check both directions.
    for (const file of context.files) {
      const fm = file.frontmatter;
      if (!fm) continue;
      const fileNumber = extractAdrNumber(file.path);
      if (!fileNumber) continue;
      const fileRef = `ADR-${fileNumber}`;

      const forwardRefs = normalizeRefs(fm[FORWARD_FIELD]);
      const backwardRefs = normalizeRefs(fm[BACKWARD_FIELD]);

      // Forward direction: this file `supersedes` something — verify
      // the target back-references this file via `superseded-by`.
      for (const ref of forwardRefs) {
        const target = adrIndex.get(ref);
        if (!target) {
          context.report({
            messageId: 'unknownReference',
            path: file.path,
            data: { ref, direction: FORWARD_FIELD },
          });
          continue;
        }
        const targetBack = normalizeRefs(target.frontmatter?.[BACKWARD_FIELD]);
        if (!targetBack.includes(fileRef)) {
          const fix = backReferenceFix(target, BACKWARD_FIELD, fileRef);
          context.report({
            messageId: 'missingBackReference',
            path: target.path,
            data: {
              ref,
              source: file.path,
              declared: FORWARD_FIELD,
              direction: BACKWARD_FIELD,
              expected: fileRef,
            },
            ...(fix ? { fix } : {}),
          });
        }
      }

      // Backward direction: this file is `superseded-by` something —
      // verify the target forward-references this file via `supersedes`.
      for (const ref of backwardRefs) {
        const target = adrIndex.get(ref);
        if (!target) {
          context.report({
            messageId: 'unknownReference',
            path: file.path,
            data: { ref, direction: BACKWARD_FIELD },
          });
          continue;
        }
        const targetFwd = normalizeRefs(target.frontmatter?.[FORWARD_FIELD]);
        if (!targetFwd.includes(fileRef)) {
          const fix = backReferenceFix(target, FORWARD_FIELD, fileRef);
          context.report({
            messageId: 'missingBackReference',
            path: target.path,
            data: {
              ref,
              source: file.path,
              declared: BACKWARD_FIELD,
              direction: FORWARD_FIELD,
              expected: fileRef,
            },
            ...(fix ? { fix } : {}),
          });
        }
      }
    }
  },
};

export default rule;
