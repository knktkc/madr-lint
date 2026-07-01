---
title: Programmatic API
description: Use madr-lint as a library — parse ADRs, run rules per-file or across a project, and reuse the recommended preset.
---

`madr-lint` ships an ESM library entry (`madr-lint`) alongside the CLI. It is
useful for building editor integrations, custom runners, or one-off scripts.

```typescript
import {
  parseFile,
  runRule,
  runRulesOnFile,
  runRulesOnProject,
  buildProjectFile,
  recommended,
  rules,
  defineConfig,
} from 'madr-lint';
```

## Parse a file

`parseFile` returns the YAML frontmatter, the v2 body-list metadata, the merged
`metadata` view, the mdast tree, and the body.

```typescript
import { parseFile } from 'madr-lint';

const parsed = parseFile('---\nstatus: accepted\n---\n\n# ADR-0001\n');
parsed.frontmatter; // { status: 'accepted' }
parsed.metadata;    // { status: 'accepted' }  (frontmatter + v2 list)
parsed.ast;         // mdast Root
```

## Run a single rule

```typescript
import { runRule, rules } from 'madr-lint';

const diagnostics = runRule(
  rules.statusEnum,
  { path: '0001-x.md', content: '---\nstatus: draft\n---\n\n# x\n' },
  { options: { caseSensitive: false } },
);
// → [{ ruleName: 'madr/status-enum', messageId: 'invalidStatus', ... }]
```

## Run per-file rules together

Multiple per-file rules share a single AST traversal.

```typescript
import { runRulesOnFile, rules } from 'madr-lint';

const diagnostics = runRulesOnFile(
  [rules.requiredSections, rules.statusEnum],
  { path: '0001-x.md', content: fileContents },
  { severity: 'error' },
);
```

## Run project (cross-file) rules

Cross-file rules — unique numbering, the supersedes graph, link rot — take an
array of pre-parsed `ProjectFile`s built with `buildProjectFile`.

```typescript
import { runRulesOnProject, buildProjectFile, rules } from 'madr-lint';

const files = [
  buildProjectFile({ path: 'docs/adr/0001-a.md', content: a }),
  buildProjectFile({ path: 'docs/adr/0001-b.md', content: b }),
];

const diagnostics = runRulesOnProject(
  [rules.noDuplicateNumbering],
  files,
  { severity: 'error' },
);
```

## Per-rule options in a batch

Pass `optionsByRule` (name → options) when running several rules that each need
their own options:

```typescript
runRulesOnFile([rules.filenameFormat], file, {
  optionsByRule: {
    'madr/filename-format': { pattern: '^ADR-[0-9]+\\.md$' },
  },
});
```

## Reuse the recommended preset

```typescript
import { recommended, defineConfig } from 'madr-lint';

recommended['madr/required-sections']; // 'error'

const config = defineConfig({
  extends: ['madr-lint:recommended'],
  rules: { 'madr/no-numbering-gap': 'warn' },
});
```

## Exports

| Export | Description |
|---|---|
| `parseFile` | Parse content → frontmatter, metadata, mdast, body |
| `extractListMetadata` | Extract v2 body-list metadata from an mdast tree |
| `runRule` | Run one per-file rule |
| `runRulesOnFile` | Run per-file rules with one AST traversal |
| `runRulesOnProject` | Run cross-file (project) rules |
| `buildProjectFile` | Pre-parse a file for project rules |
| `rules` | Namespace of built-in rules |
| `recommended` | The recommended preset's severities |
| `defineConfig` | Type-safe config helper |
| `RuleOptionsError` | Thrown when rule options fail validation |
| `isProjectRule` | Type guard for project vs per-file rules |

Types (`Rule`, `ProjectRule`, `RuleContext`, `Diagnostic`, `RuleSeverity`, …)
are exported for authoring custom rules.
