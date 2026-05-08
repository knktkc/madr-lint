# Security Policy

## Reporting a vulnerability

`madr-lint` parses untrusted Markdown content (ADR files in CI pipelines) and applies user-configurable regex patterns. That makes it a small but real attack surface — particularly for catastrophic backtracking (ReDoS) via crafted file content or hostile regex options in user config.

If you find a security issue, **please do not open a public GitHub issue**. Instead, use GitHub's private vulnerability reporting:

- Go to <https://github.com/knktkc/madr-lint/security/advisories/new>
- Or email the maintainer directly: <t.kaneko@xtone.co.jp>

We aim to acknowledge reports within 48 hours and to coordinate a fix + disclosure timeline before publishing a CVE-tagged advisory.

## What is in scope

- Code execution via crafted ADR file content
- ReDoS triggered by user-supplied regex options (`madr/filename-format` `pattern`, etc.) — **runtime-guarded** via `safe-regex2` in `src/core/regex-safety.ts` and **CI-scanned** by `scripts/redos-scan.ts`. Bypasses are in scope.
- Symlink traversal or path injection via the CLI's directory walk
- Information disclosure from `core/internal-error` diagnostics

## What is out of scope

- Issues in upstream dependencies (please report those upstream; we will rebase)
- Issues that require an attacker to already control the local filesystem or shell
- Performance regressions that are not exploitable as DoS

## Supported versions

`madr-lint` is in early alpha. Once `1.0.0` ships, this section will list the maintained release lines. Until then, only the latest published version receives security fixes.

## Disclosure timeline

1. Report received → acknowledgement within 48 hours
2. Triage + reproduction → 1 week typical
3. Fix in private branch → release with version bump and GHSA advisory
4. Public disclosure
