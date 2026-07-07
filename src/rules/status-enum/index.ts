import type { Fixer, Rule, TextEdit } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface StatusEnumOptions extends Record<string, unknown> {
  values: string[];
  prefixValues: string[];
  caseSensitive: boolean;
}

// A tiny, curated misspelling → canonical-spelling map, applied token-by-token.
// Deliberately minimal and length-agnostic; a correction only lands if the
// repaired string matches exactly ONE configured value/prefix (below), so this
// table can never introduce an out-of-enum value. See #29.
const TYPO_CORRECTIONS: Record<string, string> = {
  superceded: 'superseded',
  supercedes: 'supersedes',
  depricated: 'deprecated',
};

/** Repair known misspelled tokens in a lowercased status string. */
function repairTypos(lower: string): string {
  return lower
    .split(' ')
    .map((tok) => TYPO_CORRECTIONS[tok] ?? tok)
    .join(' ');
}

/** The substring of `s` after skipping its first `n` whitespace-delimited words. */
function tailAfterWords(s: string, n: number): string {
  let i = 0;
  for (let w = 0; w < n; w++) {
    while (i < s.length && /\s/.test(s[i]!)) i++; // skip separators
    while (i < s.length && !/\s/.test(s[i]!)) i++; // skip the word
  }
  return s.slice(i);
}

/**
 * The unambiguous canonical replacement for an invalid `status`, or undefined
 * when no safe one-to-one correction exists. Corrections are validated against
 * the CONFIGURED enum, so autofix never guesses:
 *   1. exact value — case-fold (+ token typo repair) onto exactly one `values`;
 *   2. prefix value — repaired string starts with exactly one `prefixValues`
 *      entry; the canonical prefix is spliced in and the original tail kept.
 * A mapping that lands on two candidates (case collision, two prefixes) declines.
 */
function correctStatus(
  status: string,
  values: string[],
  prefixValues: string[],
): string | undefined {
  const repaired = repairTypos(status.toLowerCase());

  // 1. Exact value.
  const exact = [...new Set(values.filter((v) => v.toLowerCase() === repaired))];
  if (exact.length === 1) {
    return exact[0] !== status ? exact[0] : undefined;
  }
  if (exact.length > 1) return undefined; // ambiguous

  // 2. Prefix value (canonical prefix + verbatim tail).
  const prefixes = [
    ...new Set(
      prefixValues.filter((p) => {
        const pl = p.toLowerCase();
        return repaired === pl || repaired.startsWith(`${pl} `);
      }),
    ),
  ];
  if (prefixes.length !== 1) return undefined;
  const prefix = prefixes[0]!;
  const tail = tailAfterWords(status, prefix.split(' ').length);
  const replacement = `${prefix}${tail}`;
  return replacement !== status ? replacement : undefined;
}

const rule: Rule<StatusEnumOptions> = {
  meta: {
    name: 'madr/status-enum',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Validate that ADR `status` (frontmatter or v2 bold-list) is in the allowed enum',
      url: 'https://knktkc.github.io/madr-lint/rules/status-enum/',
      recommended: true,
    },
    messages: {
      missingStatus: 'Metadata does not contain a "status" field (checked frontmatter and v2 bold-list)',
      invalidStatus: 'Status "{{status}}" is not one of: {{allowed}}',
    },
    // No suggestion for invalidStatus: the message already lists the allowed
    // values (the expected-vs-actual is self-contained), so a suggestion would
    // only restate it. See issue #67.
    suggestions: {
      missingStatus:
        'add a "status" field to the frontmatter (for MADR v2, a "* Status: ..." list item) — allowed values: {{allowed}}',
    },
    // Autofix (#28/#29): normalize a v2 list-sourced value to the unique
    // canonical enum entry — case difference, a curated misspelling, or a prefix
    // case/typo — preserving any tail (see create()). Ambiguous or
    // frontmatter-sourced values get no fix.
    fixable: 'code',
    defaultOptions: {
      values: ['proposed', 'rejected', 'accepted', 'deprecated'],
      prefixValues: ['superseded by'],
      caseSensitive: false,
    },
    schema,
  },
  create(context) {
    const { values, prefixValues, caseSensitive } = context.options;
    // The allowed-value list is shared by both the invalidStatus message and
    // the missingStatus suggestion, so build it once up front.
    const allowed = [...values, ...prefixValues.map((p) => `${p} ...`)];

    const meta = context.metadata;
    if (!meta || typeof meta.status !== 'string') {
      context.report({ messageId: 'missingStatus', data: { allowed } });
      return;
    }

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
      // loc only exists for v2 list-sourced values: frontmatter is stripped
      // before mdast parsing, so a frontmatter-sourced status has no body
      // line to point at — inline suppression directives (which live in the
      // body) can only silence it file-wide, never per line.
      const loc = context.metadataLoc?.status;
      // Autofix (#28/#29): offer a fix ONLY for a v2 list-sourced value (we then
      // have its exact body offset range) that maps unambiguously onto the
      // CONFIGURED enum. Frontmatter-sourced values have no body offset and need
      // YAML-aware rewriting — out of scope, so no fix is attached there.
      const canonical = correctStatus(status, values, prefixValues);
      const valueRange = context.metadataValueLoc?.status;
      const fix =
        canonical !== undefined && canonical !== status && valueRange
          ? (fixer: Fixer): TextEdit =>
              fixer.replaceRange([valueRange.start, valueRange.end], canonical)
          : undefined;
      context.report({
        messageId: 'invalidStatus',
        ...(loc ? { loc } : {}),
        data: { status, allowed },
        ...(fix ? { fix } : {}),
      });
    }
  },
};

export default rule;
