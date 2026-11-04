---
status: accepted
date: 2026-11-04
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0010: Do not follow symbolic links out of the working directory

## Context and Problem Statement

A repository can commit symbolic links. Through them, madr-lint could hang on two
self-referential directory links, overwrite a file outside the repository with its
cache, baseline, or `--fix`, and print values from outside files in diagnostics
([GHSA-74ff-4852-wm6j](https://github.com/knktkc/madr-lint/security/advisories/GHSA-74ff-4852-wm6j)).
Since Node 22.13, `readdirSync({ recursive: true })` also recurses through directory
links, so the same version of madr-lint behaved differently per Node version.

Which links should madr-lint follow?

## Decision Drivers

- A committed link must not read or write outside the working directory.
- Discovery must terminate and behave the same on every supported Node version.
- Linked documentation directories inside the working directory should keep working.
- Discovery must not add a syscall per file.

## Considered Options

1. Follow links, and track visited real paths to stop cycles.
2. Follow only links that stay inside the working directory, everywhere.
3. Skip links during the walk, and check only the paths the caller passes.

## Decision Outcome

Chosen option: **3**. The walk descends only into real directories and returns only
real files, so it needs no real-path lookup per file.

A start path is checked once:

- It is allowed if its real path is inside the real working directory.
- It is allowed if it contains no link, even outside the working directory, such as
  `../real/docs/adr`. A repository cannot redirect such a path.
- Otherwise the CLI exits with code 2. Glob expansion looks the same as typed input,
  so a typed argument gets no exception.

An explicit `.md` link counts only if its target is also named `.md`.

Writes go to a temporary file followed by `rename`, which replaces a link instead of
writing to its target. Parent directories below the working directory must not be
links. `O_NOFOLLOW` was not used: it does not cover parents and is unavailable on
Windows. Reads of the manifest and baseline ignore anything that is not a regular
file, which also avoids hanging on a FIFO.

Only `--cache-dir` may place the cache outside the working directory, because a
`cacheLocation` can come from a config in the repository.

## Consequences

### Positive

- Discovery terminates and returns the same files on every supported Node version.
- A committed link cannot redirect a read or write out of the working directory.

### Negative

- This breaks `docs/adr -> ../../shared/adr` when run from `app/`. Run from the
  common root, or pass the real path. A linked directory inside a walk is now skipped.
- An absolute path through a system link outside the working directory is rejected,
  such as `/tmp/...` on macOS. Pass the real path.
- A link that stays inside the working directory is still followed for a start path.
  If an untrusted checkout is a subdirectory of the working directory, a link can
  reach other files in that working directory.
- This does not make a run on an untrusted checkout safe. The config file in the
  checkout still runs, and `npx` in `action.yml` can run a binary from the checkout.
- Races with a process that can already write to the directory remain.

## Links

- [ADR-0008](0008-autofix-text-edits.md): raw-text autofix
- [ADR-0009](0009-static-js-frontmatter.md): reading frontmatter as data
