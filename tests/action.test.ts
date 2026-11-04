import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('action.yml', () => {
  it('passes --no-cache on both run paths', () => {
    const action = readFileSync(join(import.meta.dirname, '../action.yml'), 'utf8');
    const runs = action.split('\n').filter((line) => line.includes('--format github'));
    expect(runs).toHaveLength(2);
    for (const line of runs) expect(line).toContain('--no-cache');
  });
});
