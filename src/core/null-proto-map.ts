/**
 * Null-prototype map. Keys across this codebase derive from untrusted input —
 * on-disk filenames, rule metadata, MADR body-list field names — so a key like
 * '__proto__' or 'constructor' must behave as ordinary data. On a plain object
 * it would read/write THROUGH Object.prototype instead (prototype pollution,
 * silently dropped entries, an inherited value returned for a key that was
 * never set). With no prototype there is nothing to inherit or pollute.
 * JSON.stringify output is identical.
 */
export function nullProtoMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
