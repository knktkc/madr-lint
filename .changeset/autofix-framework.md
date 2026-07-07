---
"madr-lint": minor
---

Autofix framework — `--fix`, `meta.fixable`, and the fixer API ([#28](https://github.com/knktkc/madr-lint/issues/28), [ADR-0008](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0008-autofix-text-edits.md)). Fixes are raw-text offset edits, never AST serialization, so a fix changes only the span it targets and leaves every other byte untouched.

- **Rule API**: a rule declares `meta.fixable: 'code'` and attaches a lazy `fix: (fixer) => TextEdit | TextEdit[] | null` to `context.report(...)`. The `Fixer` (`replaceRange` / `insertAt` / `remove`) takes body (mdast) offsets and translates them to whole-file offsets past stripped frontmatter, so fixes are correct on files with YAML frontmatter. A fix from a rule that did not declare `meta.fixable` is a rule bug — the runner routes it through `core/internal-error`. Fix thunks are lazy: a normal lint constructs no fixer and invokes no thunk.
- **CLI**: `--fix` applies fixes in place (only files that change are written) and the exit code reflects the problems that **remain**; `--fix-dry-run` prints a per-file unified diff and writes nothing (exit code as if fixes were applied). Fixes compose with existing flags — `--quiet` / `--max-warnings` operate on the remaining diagnostics, and **suppressed** (`madr-lint-disable`) and **baselined** problems are never rewritten. `--update-baseline` combined with `--fix` / `--fix-dry-run` is a usage error (exit 2).
- **Applier**: collects fixes from reported diagnostics only (after suppression and baseline), sorts by offset, drops overlaps (first-by-position wins), applies in one pass, then re-lints to a fixpoint (max 10 passes). Per-file scope — cross-file fixes are tracked separately.
- **First real fix**: `madr/status-enum` now mechanically normalizes a v2 list-sourced status value that differs from an allowed value purely by case (e.g. `Accepted` → `accepted`). Frontmatter-sourced values and genuine typos get no fix.
- **Reporters**: `text` marks fixable diagnostics with a dim `🔧 fixable` tag; `json` gains a `fixable` boolean per result and a `summary.fixed` count when a fix pass ran; `github` / `sarif` are unchanged.
- **Programmatic API**: exports `applyEdits`, `makeFixer`, `collectFixes`, `fixFileContent`, `unifiedDiff`, `MAX_FIX_PASSES`, `frontmatterOffset`, and the `TextEdit` / `Fixer` / `FixFn` types.

**Breaking (type + cache):** `Diagnostic` gains a required `fixable: boolean` field (disclosed like the earlier `suggestion` / `docsUrl` additions), and the content-hash cache schema version is bumped to `3` so any stale-shape manifest is treated as cold. Consumers constructing `Diagnostic` objects by hand must set `fixable`.
