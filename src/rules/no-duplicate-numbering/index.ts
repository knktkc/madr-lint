import { basename } from 'node:path';
import type { ProjectRule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface NoDuplicateNumberingOptions extends Record<string, unknown> {
  // No options at v0.1.
}

const NUMBER_REGEX = /^(\d{4})-/;

const rule: ProjectRule<NoDuplicateNumberingOptions> = {
  meta: {
    name: 'madr/no-duplicate-numbering',
    type: 'project',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'No two ADRs share the same NNNN- number prefix',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/no-duplicate-numbering.md',
      recommended: true,
    },
    messages: {
      duplicateNumber: 'ADR number {{number}} is used by multiple files: {{paths}}',
    },
    defaultOptions: {},
    schema,
  },
  check(context) {
    const byNumber = new Map<string, string[]>();
    for (const file of context.files) {
      const match = NUMBER_REGEX.exec(basename(file.path));
      if (!match) continue;
      const number = match[1];
      if (number === undefined) continue;
      const group = byNumber.get(number) ?? [];
      group.push(file.path);
      byNumber.set(number, group);
    }

    for (const [number, paths] of byNumber) {
      if (paths.length > 1) {
        const pathList = paths.join(', ');
        for (const path of paths) {
          context.report({
            messageId: 'duplicateNumber',
            path,
            data: { number, paths: pathList },
          });
        }
      }
    }
  },
};

export default rule;
