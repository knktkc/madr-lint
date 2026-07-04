---
"madr-lint": minor
---

CLI ergonomics (#27): add `--quiet`, `--max-warnings <n>`, and `--config <path>` flags with ESLint-mirrored semantics.

- `--quiet` filters warnings from the **output** of every reporter (text/json/sarif/github); the unfiltered warning count still drives `--max-warnings`.
- `--max-warnings <n>` exits 1 when warnings exceed n (`0` valid; negative/absent = no limit). When the threshold fails the run, a one-line verdict is printed to **stderr** for every format, and the text reporter never shows "All clear" beside a failing exit code. Baselined warnings do not count toward the threshold.
- `--config <path>` loads exactly that config file (TS or JSON), bypassing discovery; a missing file, a directory, or an invalid config exits 2 with a clear message.
