---
name: bootstrap-ci
description: One-time skill that scaffolds the GitHub Actions CI/CD pipeline for madr-lint. Generates ci.yml (matrix lint + typecheck + test + perf-regression), release.yml (changesets + npm OIDC trusted publishing with provenance), dependabot.yml, and CODEOWNERS. Run once before flipping the repo Public.
allowed-tools: Bash(mise:*), Bash(pnpm:*), Bash(gh:*), Bash(git:*), Read, Write
---

# bootstrap-ci — scaffold GitHub Actions and supporting config

One-time setup. Generates the workflow files needed for CI, automated
releases, dependency management, and ownership signals. Designed to be
correct from day one so the repo never ships with a vulnerable
long-lived `NPM_TOKEN`.

## Inputs

Ask the user (or infer from project state):

1. **Node versions to test** — default `[22, 24]`. Matrix is fixed across
   ubuntu-latest unless the user wants Mac/Windows too (overhead, defer).
2. **npm package access** — `public` (OSS) or `restricted` (private).
   For madr-lint: `public` once flipped Public.
3. **Trusted Publishers configured?** — has the user set up the npm
   Trusted Publisher entry at <https://www.npmjs.com/package/madr-lint/access>
   (will be available once `madr-lint` is published once)? If not, surface
   the URL and the GitHub Actions OIDC settings to add.

## Procedure

### Step 1: Verify state

- cwd is madr-lint repo root
- `.github/` does NOT yet contain `ci.yml` / `release.yml` (or skill stops
  to avoid clobbering)
- working tree is clean

### Step 2: Generate `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Test (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build

  perf:
    name: Perf regression check
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # for posting bench delta as PR comment
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm perf:check
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  redos:
    name: ReDoS scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm redos
```

The `pnpm perf:check` and `pnpm redos` scripts must be added to
`package.json` (one wraps the perf-regression-check skill's underlying
command, the other runs safe-regex2 over rule schemas).

### Step 3: Generate `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write       # tag, GitHub Release
  pull-requests: write  # changesets PR
  id-token: write       # npm OIDC trusted publishing

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          publish: pnpm publish-ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: 'true'
```

`pnpm publish-ci` is `pnpm publish --access public --no-git-checks`.
No `NPM_TOKEN`. OIDC + Trusted Publishers does the auth.

### Step 4: Generate `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      types:
        patterns:
          - "@types/*"
      build:
        patterns:
          - tsup
          - typescript
          - vitest
          - oxlint
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

### Step 5: Generate `.github/CODEOWNERS`

```
# Global ownership
* @knktkc

# Skills directory
.claude/skills/ @knktkc

# Rule-specific ownership (extend as contributors arrive)
src/rules/ @knktkc
docs/rules/ @knktkc
```

### Step 6: Set up changesets (idempotent)

```bash
# Add @changesets/cli only if missing
if ! mise exec -- pnpm list @changesets/cli >/dev/null 2>&1; then
  mise exec -- pnpm add -D @changesets/cli
fi

# Init only if .changeset/config.json doesn't exist
if [ ! -f .changeset/config.json ]; then
  mise exec -- pnpm changeset init
fi
```

Then edit `.changeset/config.json`:

- `"changelog": ["@changesets/changelog-github", { "repo": "knktkc/madr-lint" }]`
- `"access": "public"`
- `"baseBranch": "main"`

### Step 7: Add the package.json scripts referenced above

Add to `package.json` `scripts`. Note: do NOT name a script `version` — npm
auto-runs that on `npm version` and would clobber the changesets workflow.
Use `changeset:version` instead.

```json
{
  "publish-ci": "pnpm publish --access public --provenance --no-git-checks",
  "perf:check": "node scripts/perf-regression-check.mjs",
  "redos": "node scripts/redos-scan.mjs",
  "changeset": "changeset",
  "changeset:version": "changeset version"
}
```

The `--provenance` flag is required to actually emit the npm provenance
attestation. The `NPM_CONFIG_PROVENANCE=true` env in `release.yml` makes
provenance the default, but adding the flag explicitly is belt-and-braces
and survives env stripping in some action wrappers.

(The two `scripts/*.mjs` are stubs that wrap the skills' core logic for
non-Claude execution. Generate skeletons that print "TODO: implement".)

### Step 8: Document the npm Trusted Publisher setup

Check current npm Trusted Publishers policy at invocation time
(https://docs.npmjs.com/trusted-publishers) — the policy has evolved.
As of 2026-Q1, npm supports OIDC trusted publishing for new packages
without requiring a manual first publish, provided the Trusted Publisher
entry is created before the first CI publish attempt.

Print to the user:

```
Bootstrap complete. Before the first CI publish:

1. Visit https://www.npmjs.com/package/madr-lint/access
   (or, for new packages: https://www.npmjs.com/settings/<your-user>/trusted-publishers)
2. Add a GitHub Actions Trusted Publisher entry:
   - Owner: knktkc
   - Repository: madr-lint
   - Workflow file: release.yml
   - Environment: (leave blank)
3. Confirm the policy applies to new packages or requires manual
   first publish — see https://docs.npmjs.com/trusted-publishers

Verify post-publish:
  npm view madr-lint --json | jq .signatures
  → should show GitHub Actions OIDC attestation

After this, the release workflow uses OIDC. There is no NPM_TOKEN to
rotate or leak.
```

## Hard rules

- MUST NOT clobber existing `.github/workflows/*.yml`. If present, abort
  and ask the user.
- MUST require `id-token: write` in release.yml — without it, OIDC fails.
- MUST set `NPM_CONFIG_PROVENANCE=true` so npm provenance attestations
  are generated.
- Generated workflows MUST use `pnpm/action-setup` with the same major
  version pinned in `mise.toml`.

## When to invoke

- Once, before flipping the repo Public (M3 phase or pre-v0.1.0 publish)

## When NOT to invoke

- After workflows already exist (use Edit on the specific file instead)
- For non-public repos — restricted access publishes still need NPM_TOKEN
