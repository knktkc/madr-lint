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
- `ignorePatterns`: a list of at most 10000 non-empty strings, even for one pattern. The first invalid entry is reported (`Invalid ignorePatterns entry 42: use a non-empty string.`).
- `cache`: `true` or `false`.
- Each value in `rules`: `'error'`, `'warn'`, `'off'`, or `[severity, options]` with an object as `options`. A severity close to a valid one gets a suggestion (`'eror'` and `'Error'` suggest `"error"`). ESLint's numbers `0`, `1`, and `2` get the string to use instead, and so does `false` (`"off"`). `null` and `undefined` are rejected too. The contents of `options` are still checked by the rule's schema when the rule runs, with the same `Invalid rule options in config: …` message.

`null` and `undefined` still leave `adrDir`, `ignorePatterns`, `cache`, and `cacheLocation` at their defaults. These rule values keep working: `['off', {...}]`, a one-entry `['error']`, and `[severity, options]` whose options are `null`, `undefined`, or `false` (the rule's defaults apply). Any other non-object options are rejected. Severities from the `madr-lint:recommended` preset are not checked; a value you set over the preset is.

The values are checked even when a command-line flag replaces them for the run. If you use the GitHub Action, note that it passes the `path` input as paths on the command line and always passes `--no-cache`. A config that linted fine there can now exit 2 for this reason. The cases are listed below.

What changes in your results:

- A misspelled or differently cased severity (`'eror'`, `'Error'`), an ESLint number (`2`), `true`, or a list such as `['eror', {}]` or `[]` now exits 2. Before, such a value ran a per-file rule as a warning, so an error never failed CI, and skipped a cross-file rule such as `madr/no-duplicate-numbering` entirely. Use `'error'`, `'warn'`, or `'off'`.
- A string `ignorePatterns` (`"0001-*"`) now exits 2. Before, the string was read character by character, and a `*` in it ignored every file, so the run printed `No .md files to lint` and exited 0. Wrap the pattern in a list: `["0001-*"]`.
- A `cache` value that is not a boolean, such as `"false"`, `"true"`, `0`, or `1`, now exits 2. Before, only `true` turned the cache on, so every such value turned it off without a message, `"true"` and `1` included. With `--cache` or `--no-cache`, the flag decided and the value had no effect, so the run linted normally; it now exits 2 too, and that includes every run of the GitHub Action. Use `true` or `false`.
- `adrDir: ""` now exits 2. Before, it linted nothing and exited 0. `cacheLocation: ""` now exits 2. Before, it wrote the cache manifest into the working directory. Remove the key to use the default, or set a directory.
- `adrDir` set to a number or a list used to crash with a `TypeError` (exit 1) when no path was given on the command line. With paths on the command line, as the GitHub Action passes its `path` input, `adrDir` was not read and the run linted normally. Both now exit 2.
- `cacheLocation` set to a number or a list used to crash with a `TypeError` (exit 1), `--no-cache` included. With `--cache-dir`, it was not read and the run linted normally. Both now exit 2.
- `ignorePatterns` set to an object or holding a non-string or empty entry used to crash with a `TypeError` (exit 1). It now exits 2. A list longer than 10000 patterns now exits 2 as well.
- A rule value with more than two entries (`['error', {...}, extra]`) and options that are neither an object nor `null`, `undefined`, or `false` now exit 2. Before, the extra entries were ignored. `['error', []]`, `['error', '']`, and `['error', 0]` ran the rule with its default options. `['off', 'x']` and `['off', []]` did nothing, like `'off'`. `['error', 'x']` failed with an `Invalid rule options` message. Use `[severity, { ... }]`, or a bare severity.
- A rule set to `false`, `null`, or `undefined` now exits 2, also as the first entry of a list (`[false]`, `[null, {}]`, `[undefined]`). Before, `null` crashed with a `TypeError` (exit 1), `false` ran a per-file rule as a warning and skipped a cross-file rule, and `undefined` turned the rule off. The messages are `Invalid severity false for rule "<id>": use "off" instead.` and `Invalid severity undefined for rule "<id>": use "off" instead, or remove the entry.` Write `'off'` to turn a rule off. In a JS config, `'madr/status-enum': ci && 'error'` outside CI is `false` or `undefined`, depending on what `ci` holds, and both now exit 2. Write `ci ? 'error' : 'off'` instead.
