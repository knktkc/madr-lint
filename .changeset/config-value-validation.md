---
"madr-lint": minor
---

Report invalid values of `adrDir`, `ignorePatterns`, `cache`, `cacheLocation`, and rule severities in the config (#229). madr-lint checked the names in a config but not these values. A wrong value either changed what was linted without a message or crashed with a stack trace and exit code 1. Each is now a config error (exit 2), on discovered config files and on `--config` alike, listed in the same error as unknown names and an invalid `madrVersion`:

```text
Invalid config (3 problems):
  - Invalid ignorePatterns "0001-*": use a list of glob patterns, such as ["template.md"].
  - Invalid severity "eror" for rule "madr/status-enum": use one of "error", "warn", "off". Did you mean "error"?
  - Invalid severity 2 for rule "madr/no-broken-links": use "error" instead.
```

With `--config`, the message starts with `Failed to load config "<path>": `.

The accepted values:

- `adrDir` and `cacheLocation`: a non-empty string.
- `ignorePatterns`: a list of non-empty strings, even for one pattern. The first invalid entry is reported (`Invalid ignorePatterns entry 42: use a non-empty string.`).
- `cache`: `true` or `false`.
- Each value in `rules`: `'error'`, `'warn'`, `'off'`, `[severity]`, or `[severity, options]` with an object as `options`. A severity close to a valid one gets a suggestion (`'eror'` and `'Error'` suggest `"error"`). ESLint's numbers `0`, `1`, and `2` get the string to use instead, and so does `false` (`"off"`). `null` is rejected too. The contents of `options` are still checked by the rule's schema when the rule runs, with the same `Invalid rule options in config: …` message.

`null` and `undefined` still leave `adrDir`, `ignorePatterns`, `cache`, and `cacheLocation` at their defaults. These rule values keep working: `['off', {...}]`, a one-entry `['error']`, and `[severity, options]` whose options are `null`, `undefined`, or `false` (the rule's defaults apply). Severities from the `madr-lint:recommended` preset are not checked; a value you set over the preset is.

What changes in your results:

- A misspelled or differently cased severity (`'eror'`, `'Error'`), an ESLint number (`2`), `true`, or a list such as `['eror', {}]` or `[]` now exits 2. Before, such a value ran a per-file rule as a warning, so an error never failed CI, and skipped a cross-file rule such as `madr/no-duplicate-numbering` entirely. Use `'error'`, `'warn'`, or `'off'`.
- A string `ignorePatterns` (`"0001-*"`) now exits 2. Before, the string was read character by character, and a `*` in it ignored every file, so the run printed `No .md files to lint` and exited 0. Wrap the pattern in a list: `["0001-*"]`.
- A `cache` value that is not a boolean, such as `"false"`, `"true"`, `0`, or `1`, now exits 2. Before, only `true` turned the cache on, so every such value turned it off without a message, `"true"` and `1` included. Use `true` or `false`.
- `adrDir: ""` now exits 2. Before, it linted nothing and exited 0. `cacheLocation: ""` now exits 2. Before, it wrote the cache manifest into the working directory. Remove the key to use the default, or set a directory.
- `adrDir` or `cacheLocation` set to a number or a list, and `ignorePatterns` set to an object or holding a non-string or empty entry, used to crash with a `TypeError` (exit 1). They now exit 2 with a message. A rule set to `null` also crashed; see below.
- A rule value with more than two entries (`['error', {...}, extra]`) and options that are not an object (`['error', []]`, `['error', 'x']`) now exit 2. Before, the extra entries were ignored and `[]` ran the rule with its defaults; `['error', 'x']` failed with an `Invalid rule options` message. Use `[severity, { ... }]`.
- A rule set to `false` or `null` now exits 2, also as the first entry of a list (`[false]`, `[null, {}]`). Before, `null` crashed with a `TypeError` (exit 1), and `false` ran a per-file rule as a warning and skipped a cross-file rule. `false` gets `Invalid severity false for rule "<id>": use "off" instead.` Write `'off'` to turn a rule off. In a JS config, `'madr/status-enum': ci && 'error'` outside CI is `false` and now exits 2. Write `ci ? 'error' : 'off'` instead.
- A rule set to `undefined` (possible only in a JS config) now counts as not written, the same as leaving the key out. With a preset, the preset's severity stays. Before, `undefined` turned the rule off. Write `'off'` to keep it off. Without `extends`, a discovered config whose `rules` hold only `undefined` values now gets the recommended rules, as an empty `rules` does.
