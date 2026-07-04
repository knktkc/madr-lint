import { basename } from 'node:path';
import type { ProjectRule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface NoNumberingGapOptions extends Record<string, unknown> {
  // No options at v0.1.
}

const NUMBER_REGEX = /^(\d{4})-/;

function format4(n: number): string {
  return n.toString().padStart(4, '0');
}

const rule: ProjectRule<NoNumberingGapOptions> = {
  meta: {
    name: 'madr/no-numbering-gap',
    type: 'project',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description:
        'Detect gaps in ADR numbering (e.g. 0001 and 0003 exist but 0002 is missing). Convention-only; default off.',
      url: 'https://knktkc.github.io/madr-lint/rules/no-numbering-gap/',
      recommended: false,
    },
    messages: {
      numberingGap:
        'Numbering gap: missing {{missing}} between ADR-{{from}} and ADR-{{to}}',
    },
    defaultOptions: {},
    schema,
  },
  check(context) {
    // Map ADR number → file path. Files without a NNNN- prefix are ignored.
    const numberToPath = new Map<number, string>();
    for (const file of context.files) {
      const match = NUMBER_REGEX.exec(basename(file.path));
      if (!match?.[1]) continue;
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n)) numberToPath.set(n, file.path);
    }
    if (numberToPath.size < 2) return;

    const sortedNumbers = Array.from(numberToPath.keys()).toSorted(
      (a, b) => a - b,
    );

    for (let i = 1; i < sortedNumbers.length; i++) {
      const prev = sortedNumbers[i - 1];
      const curr = sortedNumbers[i];
      if (prev === undefined || curr === undefined) continue;
      if (curr === prev + 1) continue;

      const missingNumbers: string[] = [];
      for (let n = prev + 1; n < curr; n++) {
        missingNumbers.push(format4(n));
      }

      const currPath = numberToPath.get(curr);
      if (!currPath) continue;

      context.report({
        messageId: 'numberingGap',
        path: currPath,
        data: {
          from: format4(prev),
          to: format4(curr),
          missing: missingNumbers.join(', '),
        },
      });
    }
  },
};

export default rule;
