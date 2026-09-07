---
"madr-lint": patch
---

Resolve `madr-lint-disable-next-line` from the comment's last line ([#116](https://github.com/knktkc/madr-lint/issues/116)). A directive spelled as a multi-line `<!--` … `-->` block parsed correctly, but the suppression layer counted its target from the html node's **start** line, so it landed on the comment's own interior instead of the content below `-->`. Directives now carry the node's end line and count from there.

- **A multi-line directive now reaches the line it points at.** Previously the diagnostic below `-->` was reported despite the directive — for the issue's document (a `disable-next-line madr/date-iso8601` split across three lines between two MADR v2 metadata items), `invalidDate` on the `* Date:` line was reported, not suppressed. A blank line between `-->` and the content is skipped, exactly as it is for a one-line directive.
- **Single-line directives are unchanged**: a one-line comment's end line *is* its start line, so nothing about the existing spelling moves. `disable` / `enable` ranges still open and close at the comment's **start** line, which is what preserves their pre-existing behavior. That choice is observable: an inline multi-line comment shares its start line with the content beside it — `[gone](./nope.md) <!--` … `-->` spans three lines while `madr/no-broken-links` reports the link on the first — so counting a range from the end line would stop such a `disable` from covering its own line.
- **The docs no longer ask you to keep a directive on one line.** The suppression guide (en/ja) and the `adopt-madr-lint` / `new-adr` skills previously called the multi-line spelling a miss; they now document it as working.
