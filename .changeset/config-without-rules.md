---
"madr-lint": patch
---

Keep the settings of a discovered config file that sets no rules. The CLI still fills in the `recommended` rules, but `adrDir`, `ignorePatterns`, `cache`, and `cacheLocation` from the file now apply instead of being reset to their defaults, so a config with only `adrDir` lints that directory. Such a repository used to print "No .md files to lint" and exit 0, so CI can now report errors that were hidden before.
