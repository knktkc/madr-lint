/**
 * Per-iteration document uniqueness for benchmarks.
 *
 * A bench that replays ONE identical content string measures the parse only on
 * its first iteration: gray-matter memoizes by whole-document content, so every
 * later iteration is a cache lookup. That hid the real cost so thoroughly that
 * removing the memoization — 6% faster on real linting, where documents differ —
 * read as a 14% regression on `madr/date-iso8601 — tiny (valid)` (#122).
 *
 * So every content string that reaches `parseFile` inside a hot loop goes
 * through this helper. The appended marker is an HTML comment on its own line:
 * it changes nothing a rule reads (no heading, no metadata list item, and the
 * leading metadata block is unaffected by a trailing node) and costs one string
 * concat per iteration.
 */
export function uniqueDocs(fixture: string): () => string {
  let n = 0;
  return () => `${fixture}\n\n<!-- bench ${n++} -->\n`;
}
