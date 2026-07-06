import { basename } from 'node:path';
import { assertSafeRegex } from '../../core/regex-safety.js';
import type { Rule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface FilenameFormatOptions extends Record<string, unknown> {
  pattern: string;
}

const rule: Rule<FilenameFormatOptions> = {
  meta: {
    name: 'madr/filename-format',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Enforce ADR filename convention NNNN-kebab-case.md',
      url: 'https://knktkc.github.io/madr-lint/rules/filename-format/',
      recommended: true,
    },
    messages: {
      invalidFilename:
        'Filename "{{filename}}" does not match expected pattern "{{expected}}"',
    },
    suggestions: {
      // The message already states the expected pattern; the suggestion adds a
      // concrete, conforming example of the NNNN-kebab-case.md convention.
      invalidFilename:
        'rename the file to the NNNN-kebab-case.md convention, e.g. 0001-record-architecture-decisions.md',
    },
    defaultOptions: {
      pattern: '^[0-9]{4}-[a-z0-9-]+\\.md$',
    },
    schema,
  },
  create(context) {
    const { pattern } = context.options;
    const regex = assertSafeRegex(pattern, 'madr/filename-format', 'pattern');
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
