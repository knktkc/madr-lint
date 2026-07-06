import { describe, it, expect } from 'vitest';
import { interpolate } from '../../src/core/interpolate.js';

describe('core/interpolate', () => {
  it('substitutes {{key}} from data', () => {
    expect(interpolate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  it('coerces non-string values via String()', () => {
    expect(interpolate('n={{n}}', { n: 42 })).toBe('n=42');
    expect(interpolate('list={{xs}}', { xs: ['a', 'b'] })).toBe('list=a,b');
  });

  it('leaves an unknown placeholder intact (visible bug surface)', () => {
    expect(interpolate('value: {{missing}}', {})).toBe('value: {{missing}}');
  });

  it('fast-paths a placeholder-free template to the identical string', () => {
    const template = 'no placeholders here';
    // Same reference — the regex branch is skipped entirely.
    expect(interpolate(template, { unused: 1 })).toBe(template);
  });

  it('substitutes multiple placeholders in one template', () => {
    expect(interpolate('{{a}}-{{b}}-{{a}}', { a: 'x', b: 'y' })).toBe('x-y-x');
  });
});
