---
"madr-lint": patch
---

Exit 2 with one message when a discovered config file cannot be loaded (#225). A `.madrlintrc.json` that was empty, truncated, or held only a comment, and a config module that had a syntax error or threw while it was loaded or read, used to print a stack trace and exit 1, the code for lint errors, so CI could not tell a broken config from failing ADRs. A module that threw a falsy value (such as `null`, `undefined`, or `0`) exited 0 with no output. The CLI now prints `Failed to load config "<file>": <reason>`, naming the file it found, and exits 2. `--config` already behaved this way. A config that throws a value that cannot be converted to a string, or a Proxy that `instanceof` cannot inspect, no longer crashes the CLI or exits 0 on either path.
