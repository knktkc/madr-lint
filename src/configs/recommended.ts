import type { Severity } from '../core/types.ts';

// The `recommended` preset enables rules whose default behavior is broadly
// useful and grounded in the MADR spec. New rules append here via the
// add-rule skill, with severity decided per-rule (default `error` for
// spec-grounded rules, `warn` for convention-only rules).

export const recommended: Record<string, Severity | 'off'> = {
  'madr/filename-format': 'error',
};
