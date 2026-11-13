---
"madr-lint": minor
---

Report unknown rule IDs and `extends` entries in the config (#206). A typo in a rule ID (`madr/status-enmu`) or a preset name (`madr-lint:recomended`) used to be ignored silently. With both typos, no rule ran and the CLI exited 0. Both are now a config error (exit 2), on discovered config files and on `--config` alike.

The error names the closest known value when there is one, and lists every problem in the config at once:

```text
Invalid config (2 problems):
  - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?
  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?
```

Rule IDs under `core/` (such as `core/internal-error`) are reserved for madr-lint's own diagnostics, and configuring one is also an error. An invalid `madrVersion` is reported in the same list. A bare string `extends: 'madr-lint:recommended'` keeps working as a one-entry list.

What changes in your results:

- A config with a misspelled rule ID or preset name now exits 2 instead of linting with fewer rules than you wrote. This includes a misspelled rule set to `'off'`. Fix the name the message points to, or remove the entry.
- A config that sets a `core/` rule ID now exits 2. Remove that entry; the reserved diagnostics cannot be turned off.
