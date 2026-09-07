# release-cut — drive a versioned release through changesets

Releases are managed by [changesets](https://github.com/changesets/changesets)
(`@changesets/cli` v3) + `changesets/action` v2 in `release.yml` + npm OIDC
trusted publishing. Almost everything is automated on push to `main`; the
maintainer's job is the preflight, one manual CI trigger on the bot's PR, the
merge, and moving the Action tag afterwards.

## When to use

The user says any of:
- "ship a new version" / "cut a release" / "release v0.1.0"
- "publish the alpha" / "promote to beta"
- "what do I run to release?"

Do NOT invoke this skill silently — it merges a version-bump PR and publishes
to npm. Confirm the bump kind and target release line first.

## How the pipeline works

1. Every behavior-changing PR carries a `.changeset/<name>.md` (`pnpm changeset`).
2. On every push to `main`, `release.yml` runs `changesets/action`:
   - **pending changesets → version mode**: the bot opens or force-updates the
     "Version Packages" PR on branch `changeset-release/main` — the output of
     `changeset version` (package.json bump, CHANGELOG entry, changeset files
     consumed). It re-runs on every later push to `main`, so the PR tracks main.
   - **no pending changesets and package.json version not on npm → publish
     mode**: `pnpm publish-ci` (`changeset publish`) publishes with OIDC +
     provenance, then creates the git tag `v<version>` and the GitHub Release.
   - **nothing to do** (no changesets, version already published): the run is a
     no-op and succeeds.
3. The bot pushes with `GITHUB_TOKEN`, and GitHub suppresses workflow triggers
   for such pushes — so the Version Packages PR shows **zero checks** and the
   `protect-main` ruleset blocks the merge. Step 5 below is the workaround
   (issue #64; a GitHub App token would remove the step).

`release.yml` specifics worth knowing when editing it:
- `changesets/action` v2 inputs are `publish-script` / `version-script` /
  `github-token` (v1 used `publish` / `version` and the `GITHUB_TOKEN` env).
- `GITHUB_TOKEN` must ALSO stay in `env:` — `@changesets/changelog-github`
  reads it itself to resolve PR/commit links; without it `changeset version`
  fails inside the changelog generator.
- v2 requires `@changesets/cli` v3 (ESM-only, Node ^22.11); the workflow runs
  Node 22 and upgrades npm to ≥ 11.5.1 because OIDC publishing needs it.

## Preconditions

Stop with a clear message if any of these fail:

1. cwd is the madr-lint repo root (`package.json` has `"name": "madr-lint"`)
2. Working tree is clean (`git status --porcelain` empty)
3. Current branch is `main` and up-to-date with `origin/main`
4. CI is green on the current commit (`gh run list --branch main --limit 3`)
5. Either pending changesets exist under `.changeset/` (else prompt the user to
   run `pnpm changeset` first), or a "Version Packages" PR is already open

## Procedure

### Step 1: Local preflight on `main` (must all pass)

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm redos
PERF_BASE_REF=v<last-release> pnpm perf:check   # warn ≥5%, fail ≥10%
```

`perf:check` defaults to `HEAD~1`, which only measures noise when the last
commit is docs- or workflow-only — compare against the previous release tag
instead. A single warn on a small benchmark (e.g. `madr/no-broken-links — 10
files`) with untouched rules swinging ±20% in the same run is runner noise;
re-run once before investigating.

If any step fails, stop. Surface the failing command and its output.

### Step 2: Tarball smoke test

```bash
pnpm pack --pack-destination /tmp/madr-lint-pack      # madr-lint-<ver>.tgz
tar -tzf /tmp/madr-lint-pack/madr-lint-<ver>.tgz
```

Verify the tarball:
- contains `dist/cli.js` with the `#!/usr/bin/env node` shebang
- contains `dist/index.js`, `dist/index.d.ts`, `README.md`, `LICENSE`, `CHANGELOG.md`
- does NOT contain `node_modules/`, `tests/`, `.github/`, `benchmarks/`

Then run the packed binary from a scratch directory. Install it first —
`npx /path/to/file.tgz` does not work (it tries to execute the archive:
"Permission denied"):

```bash
mkdir -p /tmp/madr-lint-smoke/docs/adr && cd /tmp/madr-lint-smoke
echo '# Smoke test' > docs/adr/0001-smoke.md
npm install --no-save /tmp/madr-lint-pack/madr-lint-<ver>.tgz
npx madr-lint docs/adr        # expect rule errors (missing sections) — that's the binary working
npx madr-lint --version
```

### Step 3: Review the pending changesets

```bash
ls .changeset/*.md | grep -v README
```

Show the maintainer each pending changeset's body and confirm the bump kinds
(pre-1.0 rules below). If the maintainer wants a different bump, fix the
changeset file in a normal PR — do not hand-edit the bot's PR.

### Step 4: Locate the bot's "Version Packages" PR

```bash
gh pr list --search "Version Packages in:title" --json number,headRefName,headRefOid
git fetch origin changeset-release/main
git merge-base origin/main origin/changeset-release/main   # must equal origin/main HEAD
gh pr diff <N> --name-only                                  # package.json, CHANGELOG.md, .changeset/* removals only
```

It appears within a minute of the last changeset-carrying PR landing. If the
merge-base is behind `main`, wait for the next bot run (every push to `main`
refreshes it). Do not push to `changeset-release/main` yourself.

Manual fallback (only if the bot cannot run): `GITHUB_TOKEN=$(gh auth token)
pnpm changeset version` on a `release/v<ver>` branch, commit `release:
v<ver>`, open a PR — then continue from Step 6.

### Step 5: Trigger CI on the bot's PR (close → reopen)

```bash
gh pr close <N> && gh pr reopen <N>
```

Reopening as a human actor fires the `pull_request` events that the bot's
`GITHUB_TOKEN` push could not. All required checks (Test ×6, ReDoS scan, Perf
regression check, Analyze) start within seconds.

### Step 6: Wait for CI green

```bash
gh pr checks <N> --watch
```

### Step 7: Squash-merge

```bash
gh pr merge <N> --squash
```

`release.yml` then runs in publish mode: `pnpm build`, npm ≥ 11.5.1 upgrade,
`pnpm publish-ci` with `NPM_CONFIG_PROVENANCE=true` (tokenless OIDC), git tag
`v<ver>`, GitHub Release. Typical duration: 1–2 minutes.

```bash
gh run list --workflow=release.yml --branch main --limit 1
gh run view <run-id> --log-failed        # only if it failed
```

If the publish step fails with an auth-shaped 404, check the npm Trusted
Publisher entry (`knktkc/madr-lint`, workflow `release.yml`) at
<https://www.npmjs.com/settings/<user>/trusted-publishers>.

### Step 8: Verify

```bash
npm view madr-lint version dist-tags.latest
npm view madr-lint@<ver> --json | jq '.dist.attestations'   # provenance: https://slsa.dev/provenance/v1
gh release view v<ver>
git fetch --tags && git log -1 --format='%h %s' v<ver>^{commit}
```

### Step 9: Move the GitHub Action major tag

README and the docs pin the action as `knktkc/madr-lint@v0`. The release
creates `v<ver>` only, so move the floating tag by hand:

```bash
git tag -f v0 <release commit>
git push -f origin refs/tags/v0
git ls-remote --tags origin v0          # must show the release commit
```

(`v1` once 1.0 ships.)

## Pre-1.0 release lines

While in `0.x`:
- Patch (`0.4.0` → `0.4.1`): bug fixes, internal refactors, doc-only changes
- Minor (`0.4.0` → `0.5.0`): treated as **potentially breaking** until 1.0 — new rules in `recommended`, schema changes, CLI flag additions/renames, public API changes
- Major (`0.x.y` → `1.0.0`): manual cut, requires a roadmap-driven decision (see CLAUDE.md M7)

Prerelease tags (`alpha`, `beta`, `rc`):

```bash
pnpm changeset pre enter alpha    # enable prerelease mode
pnpm changeset                     # add changesets as usual
# merge → bot PR → 0.5.0-alpha.0 … iterate …
pnpm changeset pre exit            # leave prerelease mode for the stable cut
```

cli v3 keeps versioned prerelease changesets under `.changeset/pre/` (not in
`pre.json`); the presence of `.changeset/pre.json` still marks prerelease mode.

## What this skill does NOT do

- Configure npm Trusted Publishers (one-time, npmjs.com UI)
- Set GitHub branch protection / rulesets (one-time, settings UI)
- Provide a GitHub App token to the bot so its PR gets CI without Step 5 (#64, option 2 — not set up)
- Deal with retracted versions (`npm deprecate`) or yanked releases — manual intervention

## Related

- `bootstrap-ci` — scaffolds the workflows that make this flow possible
- `add-rule` — the typical source of changesets (a new rule is a `minor` bump pre-1.0)
- `perf-regression-check` — invoked from Step 1 preflight
