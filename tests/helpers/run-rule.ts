// Test helper — re-exports the core runner so tests stay terse.
// The core implementation lives in src/core/runner.ts.

export { runRule, runRulesOnFile } from '../../src/core/runner.js';
export type { RunRuleOptions } from '../../src/core/runner.js';
