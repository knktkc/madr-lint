import type { Rule } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

/**
 * `madrVersion` decides where metadata is read from: v2 reads the body list,
 * v3/v4 read YAML frontmatter (#207). Metadata in the other format is not read
 * at all, so without this rule its fields would silently go unchecked. Under
 * `auto` the version is detected from the format, so the two always agree.
 */
const rule: Rule<Record<string, never>> = {
  meta: {
    name: 'madr/metadata-format',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Enforce that ADR metadata uses the format madrVersion reads',
      url: 'https://knktkc.github.io/madr-lint/rules/metadata-format/',
      recommended: true,
    },
    messages: {
      expectedFrontmatter:
        'Metadata is written as a body list, but madrVersion "{{version}}" reads YAML frontmatter',
      expectedList:
        'Metadata is written as YAML frontmatter, but madrVersion "{{version}}" reads a body list',
    },
    suggestions: {
      expectedFrontmatter:
        'move the metadata into YAML frontmatter, or set madrVersion to "v2" or "auto"',
      expectedList:
        'move the metadata into a list under the title ("* Status: ..."), or set madrVersion to "v3", "v4", or "auto"',
    },
    defaultOptions: {},
    schema,
  },
  create(context) {
    const version = context.madrVersion;
    if (version === null) return;
    if (version === 'v2') {
      if (context.frontmatter !== null) {
        context.report({ messageId: 'expectedList', data: { version } });
      }
      return;
    }
    // v3/v4 read frontmatter. Report a body list only when it is the sole
    // metadata; next to frontmatter, v3/v4 treat it as ordinary body content.
    if (context.frontmatter === null && context.listMetadata !== null) {
      context.report({ messageId: 'expectedFrontmatter', data: { version } });
    }
  },
};

export default rule;
