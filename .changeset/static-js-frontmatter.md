---
"madr-lint": minor
---

Read `---js` and `---javascript` frontmatter that is a static object literal: strings, numbers, booleans, null, arrays, and nested objects, with comments, unquoted keys, and trailing commas. The block is parsed as data and never executed, so calls, variables, expressions, template literals, getters, methods, spread, and computed keys still fail with an error. `madr/supersedes-bidirectional` no longer offers a `--fix` for targets whose frontmatter is `---js` or `---json`, because inserting a YAML line would corrupt them.
