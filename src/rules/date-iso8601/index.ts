import type { Fixer, Rule, TextEdit } from '../../core/types.js';
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

// English month names → month number. An explicit table (no `Date.parse`, which
// is locale/timezone-dependent) so autofix only touches names it recognizes
// unambiguously; any other spelling declines. See #29.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Zero-pad a positive integer to `width` digits. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Build a canonical `YYYY-MM-DD` string from numeric parts, or null when the
 * result is not a real calendar date. Never turns an invalid date into a
 * *different* valid one (e.g. `2026/2/30` has no fix).
 */
function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  return isValidIso8601Date(iso) ? iso : null;
}

/**
 * Normalize `raw` to `YYYY-MM-DD` ONLY when the mapping is unambiguous:
 *   - year-first numeric with matching separators: `YYYY/M/D`, `YYYY.M.D`,
 *     `YYYY-M-D` (month ≤ 12, day ≤ 31, real calendar date);
 *   - named-month forms with an English month: `D Mon YYYY`, `Mon D, YYYY`.
 * Day/month-order-ambiguous inputs (`03/07/2026`), short years, and unknown
 * month names return null — the rule then reports without offering a fix.
 */
function normalizeToIso(raw: string): string | null {
  const s = raw.trim();

  // Year-first numeric — the ONE unambiguous numeric shape. The `\2` backref
  // forces a single separator style, so `2026/07-03` never matches.
  const numeric = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(s);
  if (numeric) {
    return buildIso(Number(numeric[1]), Number(numeric[3]), Number(numeric[4]));
  }

  // Day-first named month: `3 Jul 2026`, `03 July 2026` (optional trailing dot).
  const dMonY = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(s);
  if (dMonY) {
    const month = MONTHS[dMonY[2]!.toLowerCase()];
    return month ? buildIso(Number(dMonY[3]), month, Number(dMonY[1])) : null;
  }

  // Month-first named month: `Jul 3, 2026`, `July 03, 2026` (comma optional).
  const monDY = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (monDY) {
    const month = MONTHS[monDY[1]!.toLowerCase()];
    return month ? buildIso(Number(monDY[3]), month, Number(monDY[2])) : null;
  }

  return null;
}

const rule: Rule<DateIso8601Options> = {
  meta: {
    name: 'madr/date-iso8601',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Validate that ADR `date` (frontmatter or v2 bold-list) is a valid ISO 8601 calendar date (YYYY-MM-DD)',
      url: 'https://knktkc.github.io/madr-lint/rules/date-iso8601/',
      recommended: true,
    },
    messages: {
      missingDate: 'Metadata does not contain a "{{field}}" field (checked frontmatter and v2 bold-list)',
      invalidDate: 'Date "{{date}}" is not a valid ISO 8601 calendar date (YYYY-MM-DD)',
    },
    suggestions: {
      missingDate:
        'add a "{{field}}" field in YYYY-MM-DD format to the frontmatter (for MADR v2, a "* Date: ..." list item)',
      invalidDate: 'use the YYYY-MM-DD calendar-date format, e.g. 2025-03-14',
    },
    // Autofix (#29): normalize UNAMBIGUOUS shapes of a v2 list-sourced value —
    // year-first numeric and English named-month forms. Ambiguous day/month
    // order, invalid calendar dates, and frontmatter-sourced values get no fix.
    fixable: 'code',
    defaultOptions: {
      field: 'date',
    },
    schema,
  },
  create(context) {
    const meta = context.metadata;
    const fieldName = context.options.field;

    if (!meta) {
      context.report({
        messageId: 'missingDate',
        data: { field: fieldName },
      });
      return;
    }

    const raw = meta[fieldName];
    const dateStr = normalizeDate(raw);
    if (dateStr === null) {
      context.report({
        messageId: 'missingDate',
        data: { field: fieldName },
      });
      return;
    }

    if (!isValidIso8601Date(dateStr)) {
      // loc only exists for v2 list-sourced values: frontmatter is stripped
      // before mdast parsing, so a frontmatter-sourced date has no body line
      // to point at — inline suppression directives (which live in the body)
      // can only silence it file-wide, never per line.
      const loc = context.metadataLoc?.[fieldName];
      // Autofix (#29): offer a fix ONLY for a v2 list-sourced value (we then have
      // its exact body offset range) whose shape normalizes unambiguously.
      // Frontmatter-sourced values have no body offset and need YAML-aware
      // rewriting — out of scope, so no fix is attached there.
      const valueRange = context.metadataValueLoc?.[fieldName];
      const normalized = valueRange ? normalizeToIso(dateStr) : null;
      const fix =
        normalized !== null && normalized !== dateStr && valueRange
          ? (fixer: Fixer): TextEdit =>
              fixer.replaceRange([valueRange.start, valueRange.end], normalized)
          : undefined;
      context.report({
        messageId: 'invalidDate',
        ...(loc ? { loc } : {}),
        data: { date: dateStr },
        ...(fix ? { fix } : {}),
      });
    }
  },
};

export default rule;
