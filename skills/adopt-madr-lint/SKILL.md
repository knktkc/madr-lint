---
name: adopt-madr-lint
description: Roll out madr-lint on an existing repository that already has (or is about to have) Architecture Decision Records. Detects the ADR directory, installs madr-lint, writes a config, runs a first lint pass, snapshots legacy debt into a baseline so only new violations fail the build, wires up the GitHub Action, and optionally triages the worst offenders with inline suppression. Use for phrases like "adopt madr-lint", "add ADR linting to this repo", "roll out madr-lint", "set up madr-lint in CI", "onboard madr-lint gradually", "baseline our ADR violations", or "wire up madr-lint on GitHub Actions".
allowed-tools: Bash(npm:*), Bash(pnpm:*), Bash(yarn:*), Bash(npx:*), Bash(node:*), Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(ls:*), Bash(find:*), Bash(grep:*), Bash(mkdir:*), Bash(cat:*), Read, Write, Edit
---

# adopt-madr-lint — roll out madr-lint on an existing repo

Grounded against **madr-lint@0.3.0** (the latest published npm release as of
this writing). `madr-lint init` (tracked as
[#30](https://github.com/knktkc/madr-lint/issues/30)) has not shipped yet, so
this skill writes the config file by hand — step 3 becomes a single command
once `init` ships. See "What changes once #30 ships" at the end.

This procedure is mechanical: follow it top to bottom. The only judgment
calls are explicitly marked **DECISION POINT**.

## When to invoke

- "adopt madr-lint on this repo"
- "add ADR linting to \<project\>"
- "roll out madr-lint here"
- "wire up madr-lint in CI"
- "we have a pile of legacy ADRs, help us adopt madr-lint without fixing everything"

## When NOT to invoke

- Authoring a single new ADR in a repo that already lints clean → use the
  `new-adr` skill instead.
- The repo has no ADRs and isn't starting any → nothing to lint yet.

## Procedure

### Step 0: Check the Node version

madr-lint requires **Node.js 22+**.

```bash
node --version
```

If it's below 22, stop and tell the user to upgrade (or use whatever
Node-version manager the repo already uses) before continuing.

### Step 1: Detect the ADR directory

Scan for files matching the `NNNN-*.md` convention in common locations first,
then fall back to a repo-wide scan. Use `find`, not a raw shell glob, for the
per-directory check — under zsh (the macOS default shell, `NOMATCH` is on by
default) a glob like `ls "$d"/[0-9][0-9][0-9][0-9]-*.md` throws `no matches
found` and aborts instead of silently failing, even with `2>/dev/null` on the
command, because the shell errors while *expanding* the glob, before `ls`
ever runs. `find` does its own pattern matching and stays silent either way:

```bash
for d in docs/adr docs/decisions adr; do
  if [ -d "$d" ] && find "$d" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-*.md' 2>/dev/null | grep -q .; then
    echo "found: $d"
  fi
done

# Fallback: scan the whole tree (skip dependency/VCS dirs) if none of the
# common locations hit.
find . -not -path '*/node_modules/*' -not -path '*/.git/*' -type f \
  | grep -E '/[0-9]{4}-.*\.md$' \
  | sed 's#/[^/]*$##' \
  | sort -u
```

**DECISION POINT**:
- Exactly one directory found → that's `adrDir`.
- Multiple directories found (monorepo) → note all of them; you'll either
  pick the primary one for `adrDir` and pass the rest as explicit CLI paths,
  or lint them as separate config roots. Ask the user if it's not obvious
  from the repo layout.
- None found → this is a **greenfield** adoption, not a legacy one. Default
  `adrDir` to `docs/adr` (madr-lint's own default) and skip straight to
  Step 3; there's no "legacy debt" step to run.

### Step 2: Detect the package manager and install

```bash
if [ -f pnpm-lock.yaml ]; then PM=pnpm
elif [ -f yarn.lock ]; then PM=yarn
elif [ -f package-lock.json ]; then PM=npm
else PM=npm   # no lockfile yet — npm is a safe default
fi
echo "package manager: $PM"
```

Install as a dev dependency with the detected tool:

```bash
# npm
npm install --save-dev madr-lint

# pnpm
pnpm add -D madr-lint

# yarn
yarn add -D madr-lint
```

Verify it landed and check the version actually installed:

```bash
npx madr-lint --version
```

### Step 3: Write a minimal config

Until `madr-lint init` ships (#30), write `.madrlintrc.json` by hand at the
repo root, using the `adrDir` from Step 1:

```json
{
  "extends": ["madr-lint:recommended"],
  "madrVersion": "auto",
  "adrDir": "docs/adr"
}
```

Replace `"docs/adr"` with the directory actually detected. `madrVersion:
"auto"` is safe by default — it detects v2 (body-list) vs v3/v4 (frontmatter)
per file, so a repo with mixed-vintage ADRs doesn't need a single global
setting.

### Step 4: Run the first lint pass

Run both a human-readable pass and a JSON pass — JSON is what you parse
programmatically, text is what you show the user:

```bash
npx madr-lint
npx madr-lint --format json
```

> **0.3.0 JSON shape** — each entry in `results[]` has `path`, `ruleName`,
> `messageId`, `severity`, `message`, `data`, and now `suggestion` (a
> machine-actionable fix, or `null` when the rule has none) and `docsUrl`
> (the rule's documentation page). Prefer surfacing `suggestion` to the user
> over hand-rolling a fix message from `data`; fall back to looking the rule
> up at `docsUrl` (or
> `https://knktkc.github.io/madr-lint/rules/<rule-name-without-madr/>/`) when
> `suggestion` is `null`.

Read `summary.total` (or the text reporter's final `N errors` / `N warnings`
line).

### Step 5: DECISION POINT — fix now or baseline

- **`summary.total` is small enough to fix in this session (rule of thumb:
  under ~50 violations, or the team explicitly wants everything green
  immediately)** → fix the violations directly (edit the offending
  frontmatter/headings/filenames), re-run `npx madr-lint` until it exits 0,
  and skip to Step 7 (there's no legacy debt to baseline).
- **Otherwise, or if some violations are individually expensive to fix right
  now** (e.g. renaming a file that's linked from elsewhere, or correcting a
  historical `date` you don't want to rewrite) → baseline them (Step 6) and
  fix the cheap ones directly first. A mixed approach — fix what's trivial,
  baseline what's a real refactor — is normal and matches how this project's
  own [Adopting on an existing repo](https://knktkc.github.io/madr-lint/guides/adopting-existing-repo/)
  guide frames it.

### Step 6: Baseline the remaining legacy debt

```bash
npx madr-lint --update-baseline
```

This rewrites `.madr-lint/baseline.json` from a full lint and exits `0`.
Confirm the subtraction works:

```bash
npx madr-lint
# should now report "N problems hidden by baseline (.madr-lint/baseline.json)"
# and exit 0 (unless there are violations *outside* the baseline)
```

**Verify new violations still get caught** (don't skip this — it's the whole
point of the baseline): temporarily introduce one, confirm `npx madr-lint`
exits `1` and reports it, then remove it again.

#### Stage the baseline — do NOT `git add -A` here

`.madr-lint/baseline.json` and `.madr-lint/cache/manifest.json` are
siblings under `.madr-lint/`. The baseline is meant to be committed; the
cache is a local speed-up and must **not** be. A blind `git add -A` (or even
`git add .madr-lint/`) will sweep the cache manifest into the commit.
Gitignore the cache first, then stage explicit paths:

```bash
# add once, if not already present
printf '.madr-lint/cache/\n' >> .gitignore

git add .gitignore .madrlintrc.json .madr-lint/baseline.json package.json
# plus whichever lockfile your package manager uses, e.g.:
git add package-lock.json   # or pnpm-lock.yaml / yarn.lock
```

**Stop at staging.** The default end state of this step is the paths above
staged plus a proposed commit message printed for the user, e.g.:

```text
chore: adopt madr-lint (baseline legacy ADR debt)
```

Only run `git commit` yourself if your operator has explicitly authorized
commits for this task (in the task instructions or the repo's agent
conventions). Committing on someone's behalf is the exception, not the
default.

### Step 7: Wire up CI

Add a workflow using the composite action, pointed at the `adrDir` from
Step 1:

```yaml
# .github/workflows/adr-lint.yml
name: ADR lint

on:
  pull_request:
    paths:
      - 'docs/adr/**'   # match this to the detected adrDir
  push:
    branches: [main]

jobs:
  madr-lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22   # madr-lint requires Node >=22
      - uses: knktkc/madr-lint@v0
        with:
          path: docs/adr   # match this to the detected adrDir
```

Notes:
- `actions/setup-node` must come **before** `knktkc/madr-lint@v0` — the
  action does not install Node itself.
- The floating `v0` tag tracks the latest v0.x release; pin an exact tag
  (`@v0.3.0`) for stricter reproducibility.
- For production CI, prefer pinning `version: '0.3.0'` under `with:` over the
  default `latest` dist-tag, to protect against a hijacked `latest` publish.
- To fail CI on any warning too, add `args: '--max-warnings 0'`.
- For a monorepo with multiple ADR directories, set `path` to a
  space-separated list: `path: 'services/api/docs/adr services/web/docs/adr'`.

### Step 8 (optional): Triage the worst offenders with inline suppression

For the rare *legitimate, permanent* exception — not bulk legacy debt,
that's what the baseline is for — use an inline directive instead of turning
a rule off project-wide. See the
[Suppressing rules](https://knktkc.github.io/madr-lint/guides/suppressing-rules/)
guide for the full directive syntax.

```markdown
<!-- madr-lint-disable-next-line madr/status-enum -->
status: some-legacy-value-we-intentionally-keep
```

**Gotcha verified during dogfooding — do NOT place a suppression comment
inside a MADR v2 body-list metadata block.** A v2 ADR's metadata is a
Markdown list:

```markdown
* Status: accepted
* Deciders: bob
* Date: 2024-1-5
```

Inserting an HTML comment *between* these list items (e.g. right above
`* Date: ...` to target it with `disable-next-line`) splits the Markdown
list in two. madr-lint's v2 metadata bridge only reads the list up to that
split, so the field after the comment silently disappears from
`context.metadata` entirely — an `invalidDate` diagnostic (line-suppressible)
turns into a `missingDate` diagnostic (a **file-level** diagnostic, which
`disable-next-line`/bounded `disable` **cannot** suppress at all — see the
guide's "Diagnostics without a line" limitation). You end up with a *worse*,
unsuppressed error instead of a silenced one.

For a v2 file, suppress the whole rule for that file instead:

```markdown
<!-- madr-lint-disable-file madr/status-enum -->
```

placed anywhere outside the metadata list (top of file is simplest), or just
let the baseline absorb it — that's usually the better call for v2 legacy
data anyway.

If you're suppressing the same rule across many files, that's a signal to
change the rule's severity/options in `.madrlintrc.json` instead — inline
directives are for one-off exceptions, not policy.

## What changes once #30 (`madr-lint init`) ships

Step 3 (writing `.madrlintrc.json` by hand) becomes `npx madr-lint init`,
which is expected to auto-detect the ADR dir and dominant MADR version and
write the config for you — Steps 1 and 3 collapse into one command. Steps
2 and 4–8 are unaffected.

## Reference: commands used in this skill

| Command | Effect |
|---|---|
| `npx madr-lint --version` | confirm the installed version |
| `npx madr-lint` | text lint of the configured `adrDir` |
| `npx madr-lint --format json` | machine-readable lint (includes `suggestion`/`docsUrl` per result) |
| `npx madr-lint --update-baseline` | snapshot current violations, exit 0 |
| `npx madr-lint --no-baseline` | audit everything, ignoring the baseline |
