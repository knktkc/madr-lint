---
"madr-lint": minor
---

Report unknown rule IDs and `extends` entries in the config (#206). A typo in a rule ID (`madr/status-enmu`) or a preset name (`madr-lint:recomended`) used to be ignored silently. With both typos, no rule ran and the CLI exited 0. Both are now a config error (exit 2), on discovered config files and on `--config` alike.

The error suggests a known name when one is close (ignoring case, and adding a missing `madr/` or `madr-lint:` prefix). Otherwise it lists the known presets or links to the rule list. Every problem in the config is listed at once:

```text
Invalid config (2 problems):
  - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?
  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?
```

With `--config`, the message starts with `Failed to load config "<path>": `.

Rule IDs under `core/` (such as `core/internal-error`) are reserved for madr-lint's own diagnostics, and configuring one is also an error. An invalid `madrVersion` is reported in the same list. A bare string `extends: 'madr-lint:recommended'` keeps working as a one-entry list. `null`, `undefined`, and `false` still mean "absent" for `extends`, for `rules`, and for each entry of an `extends` list, as in `rules: ci && {...}` or `extends: [ci && 'preset']`.

What changes in your results:

- A config with a misspelled rule ID or preset name now exits 2 instead of linting with fewer rules than you wrote. This includes a misspelled rule set to `'off'`. Fix the name the message points to, or remove the entry.
- A config that sets a `core/` rule ID now exits 2. Remove that entry; the reserved diagnostics cannot be turned off.
- Other values that used to be ignored now exit 2: an `extends` entry that is not a preset name (including `''`, `42`, and `true`), and a `rules` value that is not an object (such as `[]`, `0`, or `''`).
