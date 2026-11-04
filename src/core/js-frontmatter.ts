import { createRequire } from 'node:module';

const MAX_DEPTH = 64;

interface Json5 {
  parse(text: string): unknown;
}

// Loaded on first use because gray-matter engines are synchronous, which rules
// out `import()`, and documents with YAML frontmatter should not pay for this.
let json5: Json5 | undefined;
function loadJson5(): Json5 {
  json5 ??= createRequire(import.meta.url)('json5') as Json5;
  return json5;
}

function invalid(reason: string): Error {
  return new Error(
    `Invalid JavaScript frontmatter (---js): ${reason}. Only a static object literal is allowed (strings, numbers, booleans, null, arrays, objects). Use YAML frontmatter for anything else.`,
  );
}

/**
 * Parse a `---js` block as data, never as code. See ADR-0009.
 *
 * JSON5's grammar has no calls, variables, or expressions, so a block cannot
 * run anything. The walk removes what JSON5 accepts beyond the supported values:
 * - `__proto__`: JSON5 stores it as an own key, but in JavaScript the same
 *   source sets the prototype, so one document would have two meanings.
 * - `Infinity` / `NaN`: outside the supported value types.
 * - unbounded depth: JSON5 accepts objects nested a million levels deep, which
 *   would overflow the stack of any code that recurses into the result. The
 *   walk is iterative for the same reason.
 */
export function parseStaticJsFrontmatter(block: string): Record<string, unknown> {
  let root: unknown;
  try {
    root = loadJson5().parse(block);
  } catch (error) {
    // Also covers the RangeError JSON5 raises on extremely nested arrays.
    throw invalid(error instanceof Error ? error.message : 'parse failed');
  }
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw invalid('the top level must be an object');
  }

  const pending: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 1 },
  ];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { value, depth } = next;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw invalid('Infinity and NaN are not allowed');
    }
    if (value === null || typeof value !== 'object') continue;
    if (depth > MAX_DEPTH) {
      throw invalid(`nesting is limited to ${MAX_DEPTH} levels`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__') throw invalid('the __proto__ key is not allowed');
      pending.push({ value: child, depth: depth + 1 });
    }
  }
  return root as Record<string, unknown>;
}
