---
name: release-cut
description: Drive the changesets-based release flow for madr-lint. Verifies the working tree is clean, runs all CI gates locally, prompts for the changeset bump kind (patch/minor/major), runs `pnpm changeset version`, commits, opens a release PR, and surfaces the post-merge npm OIDC publish handshake. Use this when shipping a new version. Releases are tagged via the changesets/action workflow on merge to main.
allowed-tools: Bash(pnpm:*), Bash(git:*), Bash(gh:*), Read, Write, Edit
---

# release-cut — drive a versioned release through changesets

Releases are managed by [changesets](https://github.com/changesets/changesets) + GitHub Actions + npm OIDC trusted publishing. This skill walks the maintainer through the local-side preflight and PR creation, then explains what happens automatically post-merge.

## When to use

The user says any of:
- "ship a new version" / "cut a release" / "release v0.1.0"
- "publish the alpha" / "promote to beta"
- "what do I run to release?"

Do NOT invoke this skill silently — it modifies version numbers and opens a public PR. Confirm the bump kind and target release line first.

## Preconditions

The skill stops with a clear message if any of these fail:

1. cwd is the madr-lint repo root (`package.json` has `"name": "madr-lint"`)
2. Working tree is clean (`git status --porcelain` empty)
3. Current branch is `main` and up-to-date with `origin/main`
4. CI is green on the current commit (skill checks via `gh run list --branch main --limit 1`)
5. At least one changeset exists under `.changeset/` (else the skill prompts the user to run `pnpm changeset` first)

## Procedure

### Step 1: Local preflight (must all pass)

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm redos
pnpm perf:check  # warn on regression, fail at >=10%
```

If any step fails, stop. Surface the failing command and its output so the maintainer can fix locally before any version change happens.

### Step 2: Tarball smoke test

```bash
pnpm pack --dry-run  # show what will ship
pnpm pack             # creates madr-lint-<ver>.tgz
```

Verify the tarball:
- contains `dist/cli.js` with the `#!/usr/bin/env node` shebang
- contains `dist/index.js`, `dist/index.d.ts`, `README.md`, `LICENSE`, `CHANGELOG.md`
- does NOT contain `node_modules/`, `tests/`, `.github/`, `benchmarks/`

Then in a scratch directory:

```bash
mkdir /tmp/madr-lint-smoke && cd /tmp/madr-lint-smoke
mkdir docs/adr -p
echo '# Smoke test' > docs/adr/0001-smoke.md
npx /path/to/madr-lint-<ver>.tgz docs/adr
```

Expected: rule output (probably errors due to missing sections — that's
fine, we're testing the binary, not the test ADR).

### Step 3: Choose bump kind

`pnpm changeset` is the user's responsibility — they should have committed `.changeset/<name>.md` BEFORE invoking this skill. Verify by listing pending changesets:

```bash
ls .changeset/*.md | grep -v '^README\.md$'
```

Show the maintainer each pending changeset's content (the markdown body explains what changed). Confirm the bump kinds are correct.

### Step 4: Apply version bump

```bash
pnpm changeset version
```

This:
- consumes pending changeset files under `.changeset/`
- updates `package.json` version
- writes `CHANGELOG.md` entries

Review the diff. The skill diffs the new `CHANGELOG.md` and `package.json` and shows the maintainer what's about to be committed.

### Step 5: Commit + push + PR

```bash
git checkout -b release/v<new-version>
git add -A
git commit -m "release: v<new-version>"
git push -u origin release/v<new-version>
gh pr create --title "release: v<new-version>" --body "..."
```

PR body should:
- Quote the new CHANGELOG section verbatim
- Tag the changesets bot for auto-generated entries
- Link any related issues

### Step 6: Wait for CI green on the release PR

`gh pr checks --watch` until all required checks pass.

### Step 7: Merge

Merge to main. The `release.yml` workflow will:
1. Detect the version-bumped `package.json`
2. Run `pnpm publish-ci` with `--provenance` and OIDC token from GitHub
3. Create a GitHub Release tied to the new tag
4. Update the `latest` (or `next` for prerelease) dist-tag on npm

If `release.yml` fails on the publish step, the most common cause is **npm Trusted Publisher not configured**. Surface the URL: <https://www.npmjs.com/settings/<user>/trusted-publishers> — the maintainer must add `knktkc/madr-lint` + workflow `release.yml` once.

### Step 8: Verify

```bash
npm view madr-lint versions --json | tail -1
gh release list --limit 3
```

The new version should appear on npm. Provenance badge: <https://www.npmjs.com/package/madr-lint> shows a "Built and signed on GitHub Actions" attestation.

## Pre-1.0 release lines

While in `0.x`:
- Patch (`0.1.0` → `0.1.1`): bug fixes, internal refactors, doc-only changes
- Minor (`0.1.0` → `0.2.0`): treated as **potentially breaking** until 1.0 — new rules in `recommended`, schema changes, CLI flag additions/renames, public API changes
- Major (`0.x.y` → `1.0.0`): manual cut, requires a roadmap-driven decision (see CLAUDE.md M7)

Prerelease tags (`alpha`, `beta`, `rc`):

```bash
pnpm changeset pre enter alpha    # enable prerelease mode
pnpm changeset                     # add changesets as usual
pnpm changeset version             # produces 0.2.0-alpha.0
# ... iterate ...
pnpm changeset pre exit            # leave prerelease mode for the stable cut
pnpm changeset version             # produces 0.2.0
```

The skill detects prerelease mode by the presence of `.changeset/pre.json` and adjusts step 5's PR title accordingly.

## What this skill does NOT do

- Configure npm Trusted Publishers (one-time, done via npmjs.com UI)
- Flip `package.json` `"private": true` → public (one-time, before first publish)
- Set GitHub branch protection (one-time, settings UI)
- Deal with retracted versions (`npm deprecate`) or yanked releases — manual intervention

These are documented in the README's "Publish prerequisites" checklist.

## Related

- `bootstrap-ci` — scaffolds the workflows that make this flow possible
- `add-rule` — the typical source of changesets (a new rule is a `minor` bump pre-1.0)
- `perf-regression-check` — invoked from step 1 preflight
