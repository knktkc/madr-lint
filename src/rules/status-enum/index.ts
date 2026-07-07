import type { Fixer, Rule, TextEdit } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface StatusEnumOptions extends Record<string, unknown> {
  values: string[];
  prefixValues: string[];
  caseSensitive: boolean;
}

/**
 * The unique allowed value whose lowercase equals the status's — i.e. the
 * status differs from an allowed value ONLY by case. Returns undefined when
 * there is no match or the match is ambiguous (two allowed values collide on
 * lowercase), so autofix never guesses.
 */
function caseFoldMatch(status: string, values: string[]): string | undefined {
  const lower = status.toLowerCase();
  const matches = values.filter((v) => v.toLowerCase() === lower);
  return matches.length === 1 ? matches[0] : undefined;
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
    // Autofix (#28): the ONLY mechanical fix is a pure case normalization of a
    // v2 list-sourced value (see create()). Everything else is left to #29.
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
      // Autofix (#28): offer a fix ONLY for a pure case difference from an
      // allowed value that is v2 list-sourced (we then have its exact body
      // offset range). Frontmatter-sourced values have no body offset and need
      // YAML-aware rewriting — out of scope, so no fix is attached there.
      const canonical = caseFoldMatch(status, values);
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
