import { basename } from 'node:path';
import type { ProjectFile, ProjectRule } from '../../core/types.js';
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

const rule: ProjectRule<SupersedesBidirectionalOptions> = {
  meta: {
    name: 'madr/supersedes-bidirectional',
    type: 'project',
    versionCompat: ['v3', 'v4'],
    docs: {
      description:
        'Frontmatter `supersedes` and `superseded-by` must reference each other bidirectionally',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/supersedes-bidirectional.md',
      recommended: true,
    },
    messages: {
      unknownReference:
        'Frontmatter `{{direction}}: {{ref}}` references an ADR that does not exist',
      missingBackReference:
        '`{{source}}` declares `{{direction}}: {{ref}}`, but `{{ref}}` (this file) does not back-reference it via `{{expected}}`',
    },
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
          context.report({
            messageId: 'missingBackReference',
            path: target.path,
            data: {
              ref,
              source: file.path,
              direction: BACKWARD_FIELD,
              expected: fileRef,
            },
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
          context.report({
            messageId: 'missingBackReference',
            path: target.path,
            data: {
              ref,
              source: file.path,
              direction: FORWARD_FIELD,
              expected: fileRef,
            },
          });
        }
      }
    }
  },
};

export default rule;
