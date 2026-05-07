import type { Rule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface StatusEnumOptions extends Record<string, unknown> {
  values: string[];
  prefixValues: string[];
  caseSensitive: boolean;
}

const rule: Rule<StatusEnumOptions> = {
  meta: {
    name: 'madr/status-enum',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Validate that ADR `status` (frontmatter or v2 bold-list) is in the allowed enum',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/status-enum.md',
      recommended: true,
    },
    messages: {
      missingStatus: 'Metadata does not contain a "status" field (checked frontmatter and v2 bold-list)',
      invalidStatus: 'Status "{{status}}" is not one of: {{allowed}}',
    },
    defaultOptions: {
      values: ['proposed', 'rejected', 'accepted', 'deprecated'],
      prefixValues: ['superseded by'],
      caseSensitive: false,
    },
    schema,
  },
  create(context) {
    const meta = context.metadata;
    if (!meta || typeof meta.status !== 'string') {
      context.report({ messageId: 'missingStatus', data: {} });
      return;
    }

    const { values, prefixValues, caseSensitive } = context.options;
    const status = meta.status;
    const compareStatus = caseSensitive ? status : status.toLowerCase();
    const compareValues = caseSensitive
      ? values
      : values.map((v) => v.toLowerCase());
    const comparePrefixes = caseSensitive
      ? prefixValues
      : prefixValues.map((p) => p.toLowerCase());

    const exactMatch = compareValues.includes(compareStatus);
    const prefixMatch = comparePrefixes.some((p) =>
      compareStatus.startsWith(p),
    );

    if (!exactMatch && !prefixMatch) {
      const allowed = [
        ...values,
        ...prefixValues.map((p) => `${p} ...`),
      ];
      context.report({
        messageId: 'invalidStatus',
        data: { status, allowed },
      });
    }
  },
};

export default rule;
