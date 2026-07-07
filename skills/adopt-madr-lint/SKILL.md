---
name: adopt-madr-lint
description: Roll out madr-lint on an existing repository that already has (or is about to have) Architecture Decision Records. Installs madr-lint, scaffolds a config with `madr-lint init`, runs a first lint pass, autofixes what's mechanically safe, snapshots remaining legacy debt into a baseline so only new violations fail the build, wires up the GitHub Action, and optionally triages the worst offenders with inline suppression. Use for phrases like "adopt madr-lint", "add ADR linting to this repo", "roll out madr-lint", "set up madr-lint in CI", "onboard madr-lint gradually", "baseline our ADR violations", or "wire up madr-lint on GitHub Actions".
allowed-tools: Bash(npm:*), Bash(pnpm:*), Bash(yarn:*), Bash(npx:*), Bash(node:*), Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(ls:*), Bash(find:*), Bash(grep:*), Bash(mkdir:*), Bash(cat:*), Read, Write, Edit
---

# adopt-madr-lint — roll out madr-lint on an existing repo

Grounded against **madr-lint@0.4.0** (the latest published npm release as of
this writing). `madr-lint init`
([#30](https://github.com/knktkc/madr-lint/issues/30)) has shipped — it
auto-detects the ADR directory and dominant MADR version, writes the config,
and runs an initial lint pass in one command, so this skill invokes it
directly instead of hand-writing a config file.

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

### Step 1: Detect the package manager and install

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

### Step 2: Scaffold the config with `madr-lint init`

```bash
npx madr-lint init
```

This detects the ADR directory (checking `docs/adr`, `docs/decisions`, and
`adr` first, then falling back to a repo-wide scan), infers the dominant
MADR version from whatever ADRs it finds, writes `.madrlintrc.json` (or a TS
config if the repo looks TS-first), and runs an initial lint pass:

```text
Wrote .madrlintrc.json

  ADR directory: docs/adr (detected)

Next steps:
  - Lint your ADRs: npx madr-lint
  - The initial lint found 342 error(s) and 17 warning(s) across 53 file(s).
    Adopting on a legacy repo? Snapshot the debt so only new violations fail the build:
      npx madr-lint --update-baseline
  - Docs: https://knktkc.github.io/madr-lint/guides/getting-started/
```

Machine-readable variant (`--json`) — useful for deciding programmatically
whether this is a legacy-debt adoption:

```bash
npx madr-lint init --json
```

```json
{
  "written": true,
  "configPath": ".madrlintrc.json",
  "configFormat": "json",
  "adrDir": "docs/adr",
  "adrDirSource": "detected",
  "madrVersion": "v3",
  "filesChecked": 53,
  "errors": 342,
  "warnings": 17,
  "suggestUpdateBaseline": true,
  "docsUrl": "https://knktkc.github.io/madr-lint/guides/getting-started/"
}
```

`adrDirSource` is `"detected"` when it found ADRs at a known location,
`"fallback"` when it defaulted to `docs/adr` without finding any (greenfield,
or a directory layout it doesn't recognize — see the monorepo case below).
`madrVersion` is the concrete version it inferred from existing files
(`v2`/`v3`/`v4`), or `auto` when there was nothing to infer from yet.

**DECISION POINT — single directory vs. monorepo:** `init`'s detection only
checks the common top-level locations; it does **not** search nested
per-service directories, and it silently falls back to the `docs/adr`
default rather than erroring when it can't find a single canonical one.
Before running it, do a quick repo-wide scan so a monorepo that actually
keeps ADRs elsewhere doesn't get a config pointing at a directory that
doesn't exist:

```bash
find . -not -path '*/node_modules/*' -not -path '*/.git/*' -type f \
  | grep -E '/[0-9]{4}-.*\.md$' \
  | sed 's#/[^/]*$##' \
  | sort -u
```

- **Exactly one directory, or none at all** (a greenfield adoption with no
  ADRs yet) → bare `npx madr-lint init` is correct; it detects the same
  answer (or the `docs/adr` default when there's nothing to find yet).
- **Multiple directories found (monorepo)** → pick the primary one and pass
  it explicitly so `init` doesn't fall back to the default:
  ```bash
  npx madr-lint init --dir services/api/docs/adr
  ```
  Note the other directories; you'll lint them as explicit CLI paths (or
  separate config roots — see Step 7's monorepo note) later. Ask the user
  if the primary isn't obvious from the repo layout.
- **A config already exists** (re-running this skill, or the repo already
  has one) → `init` refuses to overwrite it and exits non-zero; pass
  `--force` if you deliberately want to regenerate it.

### Step 3: Run the full first lint pass

`init`'s own summary is a count, not the diagnostic detail. Run both a
human-readable pass and a JSON pass — JSON is what you parse
programmatically, text is what you show the user:

```bash
npx madr-lint
npx madr-lint --format json
```

> **0.4.0 JSON shape** — each entry in `results[]` has `path`, `ruleName`,
> `messageId`, `severity`, `message`, `data`, `suggestion` (a
> machine-actionable fix, or `null` when the rule has none), `docsUrl` (the
> rule's documentation page), and `fixable` (whether `--fix` can
> mechanically repair this diagnostic). Prefer surfacing `suggestion` to the
> user over hand-rolling a fix message from `data`; fall back to looking the
> rule up at `docsUrl` (or
> `https://knktkc.github.io/madr-lint/rules/<rule-name-without-madr/>/`) when
> `suggestion` is `null`.

Read `summary.total` (or the text reporter's final `N errors` / `N warnings`
line).

### Step 4: Run `--fix` before deciding what to do with the rest

`madr-lint` can mechanically repair violations from 3 of the 8 rules today
(`madr/status-enum`, `madr/date-iso8601`, `madr/supersedes-bidirectional`).
Do this now, before the fix-or-baseline decision in Step 5 — it shrinks the
legacy debt to only what genuinely needs a human judgment call, so there's
nothing to baseline that autofix could've repaired for free:

```bash
# Preview first — writes nothing, just shows the diff
npx madr-lint --fix-dry-run

# Apply
npx madr-lint --fix
```

`--fix` mutates files in place; its exit code reflects what's *left* unfixed,
not what it repaired, so exit `1` here is normal and expected on a repo with
real remaining debt. Re-run `npx madr-lint --format json` afterward —
`summary.fixed` reports how many diagnostics this pass repaired, and
`results[]` now holds only what autofix couldn't touch (`fixable: false`, or
occasionally a rule that declined an ambiguous correction — see each rule's
docs page for when that happens).

### Step 5: DECISION POINT — fix now or baseline

- **`summary.total` (post-autofix) is small enough to fix in this session
  (rule of thumb: under ~50 violations, or the team explicitly wants
  everything green immediately)** → fix the remaining violations directly
  (edit the offending frontmatter/headings/filenames), re-run
  `npx madr-lint` until it exits 0, and skip to Step 7 (there's no legacy
  debt to baseline).
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
Step 2:

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
  (`@v0.4.0`) for stricter reproducibility.
- For production CI, prefer pinning `version: '0.4.0'` under `with:` over the
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

## Reference: commands used in this skill

| Command | Effect |
|---|---|
| `npx madr-lint --version` | confirm the installed version |
| `npx madr-lint init` | detect adrDir/MADR version, write a config, run an initial lint |
| `npx madr-lint init --dir <dir>` | scaffold with an explicit ADR directory (monorepo) |
| `npx madr-lint` | text lint of the configured `adrDir` |
| `npx madr-lint --format json` | machine-readable lint (`suggestion`/`docsUrl`/`fixable` per result) |
| `npx madr-lint --fix-dry-run` | preview autofixes as a diff; writes nothing |
| `npx madr-lint --fix` | apply autofixes in place (`summary.fixed` in `--format json`) |
| `npx madr-lint --update-baseline` | snapshot current violations, exit 0 |
| `npx madr-lint --no-baseline` | audit everything, ignoring the baseline |
