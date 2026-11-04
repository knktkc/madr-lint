---
"madr-lint": patch
---

Reject JavaScript frontmatter instead of evaluating it. A document that opens with `---js` or `---javascript` now fails with an error, and its frontmatter block is not executed.
