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

Rule IDs under `core/` (such as `core/internal-error`) are reserved for madr-lint's own diagnostics, and configuring one is also an error. An invalid `madrVersion` is reported in the same list. A bare string `extends: 'madr-lint:recommended'` keeps working as a one-entry list, and `extends: null` and `null`, `undefined`, or `false` entries (as in `extends: [ci && 'preset']`) are still skipped.

What changes in your results:

- A config with a misspelled rule ID or preset name now exits 2 instead of linting with fewer rules than you wrote. This includes a misspelled rule set to `'off'`. Fix the name the message points to, or remove the entry.
- A config that sets a `core/` rule ID now exits 2. Remove that entry; the reserved diagnostics cannot be turned off.
- Any other non-string `extends` entry (such as `42`, `true`, or `''`) and a `rules` value that is not an object now exit 2 instead of being ignored.
