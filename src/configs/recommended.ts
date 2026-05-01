import type { RuleSeverity } from '../core/types.js';

// The `recommended` preset enables rules whose default behavior is broadly
// useful and grounded in the MADR spec. New rules append here via the
// add-rule skill, with severity decided per-rule (default `error` for
// spec-grounded rules, `warn` for convention-only rules).
//
// Both bare-string and tuple forms are supported here:
//   'madr/foo': 'error'                              — enable with defaults
//   'madr/foo': ['error', { pattern: '^X' }]         — enable with override

export const recommended: Record<string, RuleSeverity> = {
  'madr/filename-format': 'error',
};
