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

## Diagnostic shape

Every diagnostic the runner emits is self-contained — it carries a
machine-actionable fix and a docs link, so a consumer never has to reconstruct
them from the rule name:

```typescript
interface Diagnostic {
  ruleName: string;           // e.g. 'madr/required-sections'
  messageId: string;          // key into the rule's `messages` map
  severity: 'error' | 'warn';
  path: string;               // POSIX-relative file path
  loc?: { line: number; column: number };
  data?: Record<string, unknown>;
  suggestion: string | null;  // concrete remediation, or null when the rule defines none
  docsUrl: string;            // rule.meta.docs.url (the repo for core/internal-error)
  fixable: boolean;           // whether an autofix is available for THIS diagnostic
  fix?: (fixer: Fixer) => TextEdit | TextEdit[] | null; // transient; see Autofix
}
```

`suggestion` and `docsUrl` are resolved by the runner at report time from the
rule's declarative `meta.suggestions[messageId]` and `meta.docs.url`.
`suggestion` is interpolated with the diagnostic's `data`, exactly like the
message; rules never build these strings imperatively.

`fixable` is a durable boolean — it is serialized to the cache and to `json`
output, and the text reporter renders a `🔧 fixable` marker for it. The `fix`
thunk is **transient**: a closure dropped by JSON serialization (so it is absent
on cache-hydrated diagnostics) and consumed by the autofix applier. See
[Autofix](#autofix).

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

## Baseline

Build and apply a [baseline](/guides/adopting-existing-repo/) programmatically
— the same subtraction the CLI's `--baseline` / `--update-baseline` flags use:

```typescript
import { buildBaseline, applyBaseline, writeBaseline, baselinePath } from 'madr-lint';

const baseline = buildBaseline(diagnostics);
writeBaseline(baselinePath(process.cwd()), baseline);

// Later, on a fresh lint run:
const { kept, hidden } = applyBaseline(newDiagnostics, baseline);
```

## Autofix

A rule opts into autofix by declaring `meta.fixable: 'code'` and attaching a lazy
`fix` thunk to `context.report(...)`. The thunk works in **body** (mdast)
coordinates — the same space as `node.position.*.offset` — and the `Fixer`
translates to whole-file offsets, so a fix is correct even when frontmatter was
stripped.

The offset range a fix targets usually comes from `context.metadataValueLoc`:
`context.metadataValueLoc[field]` yields a body-coordinate `{ start, end }` for
a `metadata` key whose effective value came from the v2 leading list **and**
was a single contiguous text token (no inline markup) — verified by slicing
the body back to the exact value. A key whose effective value came from
frontmatter instead is **absent** (frontmatter is stripped before parsing, so
it has no body offset and needs YAML-aware rewriting instead) — so a fix
should only attach when the range exists:

```typescript
const valueRange = context.metadataValueLoc?.status;

context.report({
  messageId: 'invalidStatus',
  data: { status, allowed },
  // Only attach a fix when metadataValueLoc has a range to target;
  // omit `fix` (or return null from the thunk) to decline.
  ...(valueRange && {
    fix: (fixer) =>
      fixer.replaceRange([valueRange.start, valueRange.end], 'accepted'),
  }),
});
```

The applier primitives are exported for tooling and for cross-file fixes:

```typescript
import {
  applyEdits,
  makeFixer,
  fixFileContent,
  frontmatterOffset,
} from 'madr-lint';

// Translate body offsets past stripped frontmatter, then splice.
const fixer = makeFixer(frontmatterOffset(content)); // fileOffset = body + frontmatter
const edit = fixer.replaceRange([start, end], 'accepted'); // TextEdit (whole-file)
const fixed = applyEdits(content, [edit]); // sorted, overlaps dropped, one pass
```

`fixFileContent(content, lint)` runs the fixpoint loop for one file: it collects
edits from the diagnostics your `lint` callback returns (which should already be
suppression- and baseline-filtered), applies them, re-lints, and repeats up to
`MAX_FIX_PASSES` (10). It returns `{ fixedContent, remaining, changed, passes,
applied }`.

For **cross-file** (project-rule) fixes, `collectProjectFixes(diagnostics,
contentByPath)` groups the fix edits by the target file's `path` — project
fixes operate in whole-file coordinates (they may edit YAML frontmatter), and
at most one fix lands per file per pass. `applyEditsCounted(content, edits)`
is the counting variant of `applyEdits`, returning `{ text, applied }` where
`applied` is the number of edits that actually landed after overlap and
bounds filtering.

## Exports

| Export | Description |
|---|---|
| `parseFile` | Parse content → frontmatter, metadata, mdast, body |
| `extractListMetadata` | Extract v2 body-list metadata from an mdast tree |
| `frontmatterOffset` | Length gray-matter strips (`fileOffset = bodyOffset + this`) |
| `applyEdits` | Apply `TextEdit`s to a string (sorted, overlaps dropped, one pass) |
| `applyEditsCounted` | `applyEdits` variant returning `{ text, applied }` (edits that landed) |
| `makeFixer` | Build a `Fixer` that translates body offsets to whole-file `TextEdit`s |
| `collectFixes` | Invoke diagnostics' `fix` thunks → whole-file `TextEdit[]` |
| `collectProjectFixes` | Collect project-rule (cross-file) fixes, grouped by target file path |
| `fixFileContent` | Run the per-file autofix fixpoint against a `lint` callback |
| `unifiedDiff` | Render a unified diff between two strings (used by `--fix-dry-run`) |
| `MAX_FIX_PASSES` | Fixpoint iteration cap (10) |
| `runRule` | Run one per-file rule |
| `runRulesOnFile` | Run per-file rules with one AST traversal |
| `runRulesOnProject` | Run cross-file (project) rules |
| `buildProjectFile` | Pre-parse a file for project rules |
| `rules` | Namespace of built-in rules |
| `recommended` | The recommended preset's severities |
| `defineConfig` | Type-safe config helper |
| `RuleOptionsError` | Thrown when rule options fail validation |
| `isProjectRule` | Type guard for project vs per-file rules |
| `buildBaseline` | Aggregate diagnostics into a `Baseline` (path → rule → messageId → count) |
| `applyBaseline` | Subtract a `Baseline` from a diagnostic list, returning `{ kept, hidden }` |
| `loadBaseline` | Read and parse a baseline file, or `null` if absent/malformed |
| `serializeBaseline` | Deterministically serialize a `Baseline` to JSON text |
| `writeBaseline` | Serialize and write a `Baseline` to disk, creating parent dirs |
| `baselinePath` | Resolve the absolute path to `.madr-lint/baseline.json` for a cwd |
| `BASELINE_VERSION` | Current on-disk baseline schema version |
| `INTERNAL_ERROR_RULE_NAME` | Reserved rule name for runner-thrown errors; never baselined |

Types (`Rule`, `ProjectRule`, `RuleContext`, `Diagnostic`, `RuleSeverity`,
`Baseline`, `BaselineApplyResult`, …) are exported for authoring custom rules
and tooling.
