<!--
Thanks for the PR! A few asks:

- One concept per PR. If this mixes a bug fix and unrelated cleanup, please split.
- All new rules and behavioral changes need a changeset (`pnpm changeset`).
- TDD: failing test first, then implementation. (CI checks tests pass; the discipline is on you.)
- Sign your commits: `git commit -s` (DCO).
-->

## Summary

<!-- One or two sentences. What does this PR change, and why? -->

## What changed

<!-- Bulleted list of concrete changes. File paths welcome. -->

-

## Testing

<!--
- New tests added? Where?
- Manual verification steps (especially for CLI / reporter / dogfood)?
-->

- [ ] `pnpm test` green
- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm build` green
- [ ] `pnpm redos` green (if regex code touched)
- [ ] `pnpm perf:check` no regression (if rule code touched)

## Changeset

<!-- Did you run `pnpm changeset`? If this PR is internal-only (refactor, docs, CI), say so explicitly. -->

- [ ] Changeset added under `.changeset/`
- [ ] Internal-only — no user-visible change

## Related

<!-- Link related issues, ADRs, prior PRs. -->

Closes #
