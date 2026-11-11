import { toString } from 'mdast-util-to-string';
import type { Rule, RuleListeners } from '../../core/types.js';
import schema from './schema.json' with { type: 'json' };

interface RequiredSectionsOptions extends Record<string, unknown> {
  sections: string[];
  matchMode: 'exact' | 'startsWith';
}

const rule: Rule<RequiredSectionsOptions> = {
  meta: {
    name: 'madr/required-sections',
    type: 'perFile',
    versionCompat: ['v2', 'v3', 'v4'],
    docs: {
      description: 'Enforce that ADRs contain required heading sections',
      url: 'https://knktkc.github.io/madr-lint/rules/required-sections/',
      recommended: true,
    },
    messages: {
      missingSection: 'Missing required section: "{{section}}"',
    },
    suggestions: {
      missingSection:
        'add a "## {{section}}" heading to the document body',
    },
    defaultOptions: {
      // The headings the MADR 2.1.2, 3.0.0 and 4.0.0 templates do not mark as
      // optional. `Consequences` is optional in v3/v4 and absent from v2 (#214).
      sections: [
        'Context and Problem Statement',
        'Considered Options',
        'Decision Outcome',
      ],
      matchMode: 'exact',
    },
    schema,
  },
  create(context): RuleListeners {
    const seen: string[] = [];
    return {
      enter: {
        heading(node) {
          if (node.type !== 'heading') return;
          seen.push(toString(node).trim());
        },
      },
      exit: {
        root() {
          const { sections, matchMode } = context.options;
          for (const section of sections) {
            const matched = seen.some((heading) =>
              matchMode === 'startsWith'
                ? heading.startsWith(section)
                : heading === section,
            );
            if (!matched) {
              context.report({
                messageId: 'missingSection',
                data: { section, found: [...seen] },
              });
            }
          }
        },
      },
    };
  },
};

export default rule;
