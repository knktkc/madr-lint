---
status: accepted
date: 2026-11-04
decision-makers:
  - knktkc (t.kaneko)
consulted: []
informed: []
---

# ADR-0009: Read `---js` frontmatter as data with JSON5

## Context and Problem Statement

gray-matter's default JavaScript engine passes a `---js` block to `eval`. ADR
files are untrusted input, so linting a repository could run code from it
([GHSA-39m8-vrf3-v276](https://github.com/knktkc/madr-lint/security/advisories/GHSA-39m8-vrf3-v276)).
v0.4.3 replaced the engine with one that always throws, which also stopped
every harmless `---js` document from linting.

How can a `---js` document be read again without ever executing it?

## Decision Drivers

- No document may be able to run code during a lint.
- A value that is accepted must mean what the same source means in JavaScript.
- Documents with YAML frontmatter must not pay for this feature.
- gray-matter engines are synchronous.

## Considered Options

1. Keep rejecting `---js`.
2. Parse with `acorn` and accept an allowlist of AST node types.
3. Parse with `json5` and check the result.
4. Run the block in `node:vm`.

## Decision Outcome

Chosen option: **3, parse with `json5`**. Its grammar has no calls, variables, or
expressions, so a block cannot express code, and no allowlist of ours has to stay
correct for this to hold.

The result then has to pass these checks, in `src/core/js-frontmatter.ts`:

- The top level is an object.
- No key is `__proto__`, at any depth. JSON5 stores it as an own key, while the
  same source in JavaScript sets the prototype.
- No value is `Infinity` or `NaN`.
- Nesting is at most 64 levels. JSON5 accepted objects nested a million levels
  deep in testing, which would overflow code that recurses into the result.

`json5` is loaded with `createRequire` on first use. Dynamic `import()` is not an
option because the engine is synchronous.

### Comparison

Measured on 2026-11-04 with acorn 8.19.0 and json5 2.2.3:

| | `json5` | `acorn` with allowlist |
|---|---|---|
| Attack inputs that executed (19 tried) | 0 | 0 |
| Installed size | 284 KB | 580 KB |
| Parse time per typical block | about 5.8 µs | about 6.5 µs |
| Security-critical code of ours | Result checks | AST allowlist and result checks |
| Rejects `` `plain` ``, `{1: 'a'}`, `{a: 1};` | Yes | No |
| Latest release | December 2022 | October 2026 |

### Rejected alternatives

- **Keep rejecting**: safe, but it leaves valid documents unreadable.
- **`acorn`**: accepts more real JavaScript, but a mistake in the allowlist is a
  mistake in a security boundary, and it is twice the size.
- **`node:vm`**: Node's documentation says it is not a security mechanism.

## Consequences

### Positive

- Static `---js` documents lint again, without an execution path.
- YAML documents do not load the new dependency.

### Negative

- A new runtime dependency that has had no release since 2022. It is small and
  has no dependencies of its own.
- Template literals without substitutions, numeric keys, and a trailing `;` were
  valid under `eval` but stay rejected. The error message points to YAML.
- CodeQL alerts #8 and #9 (`js/unsafe-code-construction`) stay open: CodeQL treats
  the `grayMatter()` call as a code sink and does not see the replaced engine.
- `madr/supersedes-bidirectional` declines its `--fix` for `---js` and `---json`
  targets, because the fix inserts a YAML line. The diagnostic is still reported.

## Links

- [ADR-0002](0002-ast-parsing-strategy.md): gray-matter for frontmatter
- [ADR-0008](0008-autofix-text-edits.md): raw-text autofix
