/**
 * "Did you mean ...?" support for config errors (#206).
 */

/**
 * Optimal string alignment distance: Levenshtein plus adjacent transposition,
 * so the common typo `enmu` → `enum` costs 1 instead of 2.
 */
function editDistance(a: string, b: string): number {
  const cols = b.length + 1;
  const d: number[] = Array.from({ length: (a.length + 1) * cols }, () => 0);
  for (let i = 0; i <= a.length; i++) d[i * cols] = i;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[(i - 1) * cols + j] + 1,
        d[i * cols + j - 1] + 1,
        d[(i - 1) * cols + j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[(i - 2) * cols + j - 2] + 1);
      }
      d[i * cols + j] = best;
    }
  }
  return d[a.length * cols + b.length];
}

// Every built-in rule ID shares the `madr/` prefix, so a threshold relative to
// the length would call unrelated rules "close". A small absolute bound only
// catches real typos.
const MAX_DISTANCE = 2;

// `/` separates a rule's namespace (`madr/status-enum`), `:` a preset's
// (`madr-lint:recommended`).
const NAMESPACE_SEPARATORS = ['/', ':'];

/**
 * The known value closest to `value`, ignoring case, or undefined when none is
 * close enough to be a plausible typo. A known value that is `value` plus a
 * namespace (`status-enum` → `madr/status-enum`) always counts as close.
 */
export function closestMatch(
  value: string,
  known: Iterable<string>,
): string | undefined {
  const needle = value.toLowerCase();
  // Sorted so that ties resolve the same way regardless of registry order.
  const candidates = Array.from(known).toSorted();
  const namespaced = candidates.find((c) =>
    NAMESPACE_SEPARATORS.some((sep) => c.toLowerCase().endsWith(`${sep}${needle}`)),
  );
  if (namespaced !== undefined) return namespaced;

  // Two edits turn a short word into an unrelated one (`files` → `rules`), so
  // a short value gets fewer.
  const maxDistance = Math.min(MAX_DISTANCE, Math.floor(needle.length / 3));
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    // The distance is at least the length difference, so this skips the
    // quadratic computation for a key that cannot be close (e.g. a huge one).
    if (Math.abs(candidate.length - needle.length) > maxDistance) continue;
    const distance = editDistance(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
