---
"madr-lint": patch
---

Exit 2 with one message when a discovered config file cannot be loaded (#225). A `.madrlintrc.json` that was empty, truncated, or held only a comment, and a config module that had a syntax error or threw while it was loaded or read, used to print a stack trace and exit 1, the code for lint errors, so CI could not tell a broken config from failing ADRs. A module that threw `null` exited 0. The CLI now prints `Failed to load config "<file>": <reason>`, naming the file it found, and exits 2. `--config` already behaved this way. A config that throws a value that cannot be converted to a string no longer crashes the CLI on either path.
