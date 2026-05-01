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
    versionCompat: ['v3', 'v4'],
    docs: {
      description: 'Validate that ADR frontmatter `status` is in the allowed enum',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/status-enum.md',
      recommended: true,
    },
    messages: {
      missingStatus: 'Frontmatter does not contain a "status" field',
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
    const fm = context.frontmatter;
    if (!fm || typeof fm.status !== 'string') {
      context.report({ messageId: 'missingStatus', data: {} });
      return;
    }

    const { values, prefixValues, caseSensitive } = context.options;
    const status = fm.status;
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
