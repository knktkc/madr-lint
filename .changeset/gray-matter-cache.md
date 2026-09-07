---
"madr-lint": patch
---

Bypass gray-matter's content-keyed parse cache ([#122](https://github.com/knktkc/madr-lint/issues/122)). gray-matter 4.0.3 memoizes a parse only when it is called with no options, in a plain object keyed by the *whole document* (`matter.cache[content]`). Both parser call sites now pass a shared, frozen options object, which turns that memoization off.

- **A document whose entire content is `constructor`, `toString`, or `hasOwnProperty` no longer crashes.** Those three lookups hit an inherited `Object.prototype` member, which gray-matter accepted as a cache hit and returned as a file with `content: undefined` — so `parseFile` threw `TypeError: Cannot convert undefined or null to object` and `frontmatterOffset` threw `TypeError: Cannot read properties of undefined (reading 'length')`. The throw escaped `lintFiles`, so `madr-lint docs/adr` on a directory holding such a file exited with a stack trace instead of reporting; it now reports the file's violations like any other. Only those exact bodies were affected — a trailing newline made the key an ordinary miss.
- **madr-lint no longer keeps every parsed document in memory.** The cache retained each document's full content, as both the key and the stored file object, for the process lifetime — the whole corpus held live on a large repo. Nothing is retained now, and linting a corpus of distinct files is marginally faster, since the cache write cost more than it ever saved when no two documents are identical.
