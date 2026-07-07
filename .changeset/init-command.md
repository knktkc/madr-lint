---
"madr-lint": minor
---

`madr-lint init` — scaffold a config file with detection heuristics ([#30](https://github.com/knktkc/madr-lint/issues/30)). Non-interactive by design (works in CI / piped stdin):

- **ADR directory**: first of `docs/adr`, `docs/decisions`, `doc/adr`, `adr`, `docs/architecture/decisions` whose top level contains at least one `NNNN-*.md` file; falls back to `docs/adr` (the linter's default) with a note when nothing qualifies.
- **MADR version**: samples up to 20 existing ADRs and lets the majority win — frontmatter with `decision-makers` counts as v4, other frontmatter as v3, a v2 metadata list as v2; empty/tie/no-metadata yields `auto` (omitted from the config, it is the default).
- **Config format**: `madr-lint.config.ts` when the project looks TypeScript-ish (`tsconfig.json`, or `typescript` among `package.json` dependencies), `.madrlintrc.json` otherwise.
- Refuses to overwrite an existing config file (exit 2); `--force` overwrites, `--dir <path>` overrides directory detection, `--json` emits a machine-readable summary of what was detected and written.
- The next-steps epilogue runs a cheap in-process lint of the detected directory and suggests `--update-baseline` when it finds violations, so legacy debt does not block adoption.

The plain `madr-lint [paths]` command is unchanged — `init` is dispatched only when it is the literal first argument, so paths, flags and exit codes behave exactly as before.
