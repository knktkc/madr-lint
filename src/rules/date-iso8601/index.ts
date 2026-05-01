import type { Rule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface DateIso8601Options extends Record<string, unknown> {
  field: string;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function isValidIso8601Date(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

const rule: Rule<DateIso8601Options> = {
  meta: {
    name: 'madr/date-iso8601',
    type: 'perFile',
    versionCompat: ['v3', 'v4'],
    docs: {
      description: 'Validate that ADR frontmatter date is a valid ISO 8601 calendar date (YYYY-MM-DD)',
      url: 'https://github.com/knktkc/madr-lint/blob/main/docs/rules/date-iso8601.md',
      recommended: true,
    },
    messages: {
      missingDate: 'Frontmatter does not contain a "{{field}}" field',
      invalidDate: 'Date "{{date}}" is not a valid ISO 8601 calendar date (YYYY-MM-DD)',
    },
    defaultOptions: {
      field: 'date',
    },
    schema,
  },
  create(context) {
    const fm = context.frontmatter;
    const fieldName = context.options.field;

    if (!fm) {
      context.report({
        messageId: 'missingDate',
        data: { field: fieldName },
      });
      return;
    }

    const raw = fm[fieldName];
    const dateStr = normalizeDate(raw);
    if (dateStr === null) {
      context.report({
        messageId: 'missingDate',
        data: { field: fieldName },
      });
      return;
    }

    if (!isValidIso8601Date(dateStr)) {
      context.report({
        messageId: 'invalidDate',
        data: { date: dateStr },
      });
    }
  },
};

export default rule;
