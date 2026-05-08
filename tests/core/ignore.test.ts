import { describe, it, expect } from 'vitest';
import { shouldIgnore } from '../../src/core/ignore.js';

describe('core/ignore', () => {
  it('returns false for empty pattern list', () => {
    expect(shouldIgnore('docs/adr/0001-x.md', [])).toBe(false);
  });

  describe('exact basename', () => {
    it('matches by basename', () => {
      expect(shouldIgnore('docs/adr/README.md', ['README.md'])).toBe(true);
    });

    it('does not match a similar but different basename', () => {
      expect(shouldIgnore('docs/adr/READMEs.md', ['README.md'])).toBe(false);
    });
  });

  describe('exact relative path', () => {
    it('matches the full path', () => {
      expect(
        shouldIgnore('docs/adr/draft.md', ['docs/adr/draft.md']),
      ).toBe(true);
    });

    it('does not match a different path with same basename', () => {
      expect(
        shouldIgnore('docs/other/draft.md', ['docs/adr/draft.md']),
      ).toBe(false);
    });
  });

  describe('path suffix match', () => {
    it('matches when relativePath ends with /<pattern>', () => {
      expect(
        shouldIgnore('docs/adr/template.md', ['adr/template.md']),
      ).toBe(true);
    });

    it('does not match when only basename overlaps', () => {
      expect(
        shouldIgnore('docs/adr/template.md', ['docs/template.md']),
      ).toBe(false);
    });
  });

  describe('trailing wildcard', () => {
    it('matches files whose basename starts with the prefix', () => {
      expect(shouldIgnore('docs/adr/9999-smoke.md', ['9999-*'])).toBe(true);
      expect(shouldIgnore('docs/adr/9999-test.md', ['9999-*'])).toBe(true);
    });

    it('does not match files starting with a different prefix', () => {
      expect(shouldIgnore('docs/adr/9998-smoke.md', ['9999-*'])).toBe(false);
    });

    it('matches `*` against any basename', () => {
      expect(shouldIgnore('docs/adr/x.md', ['*'])).toBe(true);
    });
  });

  describe('hyphen-vs-no-hyphen edge cases', () => {
    it('exact pattern "9999.md" matches the no-hyphen file', () => {
      expect(shouldIgnore('docs/adr/9999.md', ['9999.md'])).toBe(true);
    });

    it('wildcard "9999-*" requires the hyphen — does NOT match "9999.md"', () => {
      expect(shouldIgnore('docs/adr/9999.md', ['9999-*'])).toBe(false);
    });

    it('wildcard "9999*" (no hyphen) matches both forms', () => {
      expect(shouldIgnore('docs/adr/9999.md', ['9999*'])).toBe(true);
      expect(shouldIgnore('docs/adr/9999-x.md', ['9999*'])).toBe(true);
    });
  });

  describe('multiple patterns (any match wins)', () => {
    it('returns true if any pattern matches', () => {
      const patterns = ['README.md', 'template.md', '9999-*'];
      expect(shouldIgnore('docs/adr/README.md', patterns)).toBe(true);
      expect(shouldIgnore('docs/adr/template.md', patterns)).toBe(true);
      expect(shouldIgnore('docs/adr/9999-smoke.md', patterns)).toBe(true);
      expect(shouldIgnore('docs/adr/0001-x.md', patterns)).toBe(false);
    });
  });
});
