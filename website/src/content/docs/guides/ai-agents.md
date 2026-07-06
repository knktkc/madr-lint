---
title: AI agents
description: Feed madr-lint's docs to an LLM via llms.txt, and use the adopt-madr-lint / new-adr agent skills to roll out linting or author a clean ADR without re-deriving the workflow every time.
---

`madr-lint` is built to be operated by an agent as readily as by a human —
structured JSON output, machine-parseable exit codes, and two ready-made
[agent skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
that encode the adoption and authoring workflows so an agent doesn't have to
re-derive them from the docs on every run.

## `llms.txt`

The docs site publishes an [`llms.txt`](https://knktkc.github.io/madr-lint/llms.txt)
index for LLMs that support the convention, plus two full-text variants for
a single-fetch context dump:

| File | Contents |
|---|---|
| [`llms.txt`](https://knktkc.github.io/madr-lint/llms.txt) | index — links to the other two |
| [`llms-small.txt`](https://knktkc.github.io/madr-lint/llms-small.txt) | abridged docs, non-essential content stripped |
| [`llms-full.txt`](https://knktkc.github.io/madr-lint/llms-full.txt) | the complete English docs, concatenated |

All three are generated from the same Astro Starlight content as the docs
site itself (English only — the `/ja/` tree is a translation of the same
material, so duplicating it wouldn't add information for an LLM). Point an
agent at `llms-full.txt` to give it the whole reference in one fetch instead
of crawling the site page by page.

## Agent skills

Two [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills)
ship in this repository at
[`skills/adopt-madr-lint/`](https://github.com/knktkc/madr-lint/tree/main/skills/adopt-madr-lint)
and
[`skills/new-adr/`](https://github.com/knktkc/madr-lint/tree/main/skills/new-adr).
They are plain `SKILL.md` files — no special runtime, no madr-lint-specific
tooling beyond the CLI itself — so they work with any agent harness that
reads the SKILL.md convention, not only Claude Code.

### `adopt-madr-lint`

Walks an agent through rolling out madr-lint on a repository that may already
have dozens of legacy ADRs: detect the ADR directory → install → write a
config → run a first lint pass → **baseline** existing debt so only new
violations fail the build → wire the GitHub Action → optionally triage a
handful of exceptions with inline suppression. It's the
[Adopting on an existing repo](/guides/adopting-existing-repo/) guide,
[CLI](/guides/cli/) reference, and [GitHub Action](/guides/github-action/)
guide compiled into one mechanical, step-by-step procedure with the
decision points (fix now vs. baseline, which package manager, which
directory) called out explicitly.

### `new-adr`

Walks an agent through authoring a brand-new ADR that passes madr-lint on
the first commit: determine the next number, pick a template for the
configured MADR version (v4 frontmatter by default, with a v2 body-list
variant), write the file, then validate with `npx madr-lint --format json`
in a loop until it reports zero diagnostics.

### Installing them in a consumer repo

Both skills are repository content, not part of the npm package — there is
no `madr-lint` CLI flag that installs them (yet; see the note below). Bring
them into a project by copying the files:

```bash
curl -fsSL -o .claude/skills/adopt-madr-lint/SKILL.md --create-dirs \
  https://raw.githubusercontent.com/knktkc/madr-lint/main/skills/adopt-madr-lint/SKILL.md
curl -fsSL -o .claude/skills/new-adr/SKILL.md --create-dirs \
  https://raw.githubusercontent.com/knktkc/madr-lint/main/skills/new-adr/SKILL.md
```

or clone/reference this repository's `skills/` directory directly if your
agent harness supports loading skills from an arbitrary path instead of only
`.claude/skills/`.

### Distribution: why manual copying, for now

The natural long-term answer is `npx madr-lint init --skills`, copying both
`SKILL.md` files into the consumer's `.claude/skills/` as part of scaffolding
the config — tracked under
[#30](https://github.com/knktkc/madr-lint/issues/30) (`madr-lint init`, not
yet shipped). Until `init` exists at all, there is nothing for a `--skills`
flag to hang off, so this repo ships the skills as plain, copyable files
under `skills/` in the meantime rather than blocking on that dependency. This
is a small enough decision to record here rather than in a dedicated ADR:
revisit it when `init` lands.

## `--format json` for programmatic consumption

```bash
npx madr-lint --format json
```

```json
{
  "version": 1,
  "summary": { "total": 1, "errors": 1, "warnings": 0, "baselineHidden": 0 },
  "results": [
    {
      "path": "docs/adr/0003-use-postgres.md",
      "ruleName": "madr/required-sections",
      "messageId": "missingSection",
      "severity": "error",
      "message": "Missing required section: \"Consequences\"",
      "suggestion": "add a \"## Consequences\" heading to the document body",
      "docsUrl": "https://knktkc.github.io/madr-lint/rules/required-sections/",
      "data": { "section": "Consequences", "found": ["Context and Problem Statement", "Decision Outcome"] }
    }
  ]
}
```

The shape above is what **v0.3.0** (the latest published release at the time
of writing) actually emits — `path`, `ruleName`, `messageId`, `severity`,
`message`, a rule-specific `data` object, and two more fields on every
result: `suggestion` (a machine-actionable fix, or `null` when the rule has
none) and `docsUrl` (the rule's documentation page). Prefer reading
`suggestion` over hand-rolling a fix message from `data`. Both skills above
are written against this current, published shape.

See the [CLI](/guides/cli/#json) guide for the full reporter reference and
the [Programmatic API](/guides/api/) guide for using `madr-lint` as a
library instead of shelling out.

## Exit codes

| Exit code | Meaning |
|---|---|
| `0` | No errors; warning count within `--max-warnings` limit (if set) |
| `1` | One or more `error`-severity diagnostics, or warning count exceeds `--max-warnings` |
| `2` | Usage or configuration error (invalid `--max-warnings` value, missing `--config` file, invalid rule options, unknown `--format`) |

An agent driving `madr-lint` from a script should branch on these three
codes rather than parsing stderr text — `1` means "there is linting work to
do," `2` means "the invocation itself is wrong" (bad flag, bad config, bad
options), which usually means fixing the command rather than the ADRs.
