import { basename } from 'node:path';
import type { Rule } from '../../core/types.ts';

const rule: Rule = {
  meta: {
    name: 'madr/filename-format',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Enforce ADR filename convention NNNN-kebab-case.md',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/filename-format.md',
      recommended: true,
    },
    messages: {
      invalidFilename:
        'Filename "{{filename}}" does not match expected pattern "{{expected}}"',
    },
    defaultOptions: {
      pattern: '^[0-9]{4}-[a-z0-9-]+\\.md$',
    },
    schema: () => import('./schema.json', { with: { type: 'json' } }),
  },
  create(context) {
    const pattern = context.options.pattern as string;
    const regex = new RegExp(pattern);
    const filename = basename(context.file.path);
    if (!regex.test(filename)) {
      context.report({
        messageId: 'invalidFilename',
        data: { filename, expected: pattern },
      });
    }
  },
};

export default rule;
