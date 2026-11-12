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

/**
 * The known value closest to `value`, or undefined when none is close enough
 * to be a plausible typo. A known value that is `value` plus a namespace
 * (`status-enum` → `madr/status-enum`) always counts as close.
 */
export function closestMatch(
  value: string,
  known: Iterable<string>,
): string | undefined {
  // Sorted so that ties resolve the same way regardless of registry order.
  const candidates = Array.from(known).toSorted();
  const namespaced = candidates.find((c) => c.endsWith(`/${value}`));
  if (namespaced !== undefined) return namespaced;

  let best: string | undefined;
  let bestDistance = MAX_DISTANCE + 1;
  for (const candidate of candidates) {
    const distance = editDistance(value, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
