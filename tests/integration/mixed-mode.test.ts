import { describe, it, expect } from 'vitest';
import { parseFile } from '../../src/core/parser.js';
import { runRule } from '../../src/core/runner.js';
import statusEnumRule from '../../src/rules/status-enum/index.js';
import dateIso8601Rule from '../../src/rules/date-iso8601/index.js';

// End-to-end coverage of ADR-0006: when a file contains BOTH YAML
// frontmatter and a v2 bold-list, the metadata bridge should:
//   1. Combine both sources into context.metadata.
//   2. Let frontmatter values win on key conflict.
//   3. Let bold-list values fill keys frontmatter omits.
//   4. Skip frontmatter entries whose value is null/undefined so a
//      misformatted YAML doesn't silently blank a bold-list value.
//
// Per-rule unit tests cover each rule in isolation; this file proves
// the bridge holds up when real rules read context.metadata.

describe('integration: mixed-mode (frontmatter + bold-list)', () => {
  it('frontmatter wins on conflict — status from frontmatter, date filled from bold-list', () => {
    const content = [
      '---',
      'status: accepted',
      'deciders: alice',
      '---',
      '',
      '- **Status**: proposed',
      '- **Date**: 2026-04-01',
      '- **Deciders**: bob',
      '',
      '# Title',
      '',
      '## Context',
      'body',
      '',
      '## Decision',
      'body',
      '',
      '## Consequences',
      'body',
    ].join('\n');

    const parsed = parseFile(content);
    expect(parsed.metadata).toEqual({
      status: 'accepted',
      date: '2026-04-01',
      deciders: 'alice',
    });

    expect(
      runRule(statusEnumRule, { content, path: '0001-x.md' }),
    ).toEqual([]);
    expect(
      runRule(dateIso8601Rule, { content, path: '0001-x.md' }),
    ).toEqual([]);
  });

  it('frontmatter null does not override bold-list value (R10 fix)', () => {
    const content = [
      '---',
      'status: ~',
      '---',
      '',
      '- **Status**: accepted',
      '',
      '# Title',
    ].join('\n');

    const parsed = parseFile(content);
    expect(parsed.metadata?.status).toBe('accepted');
    expect(
      runRule(statusEnumRule, { content, path: '0001-x.md' }),
    ).toEqual([]);
  });

  it('frontmatter-only file still works (no bold-list present)', () => {
    const content = [
      '---',
      'status: accepted',
      'date: 2026-04-01',
      '---',
      '',
      '# Title',
    ].join('\n');

    const parsed = parseFile(content);
    expect(parsed.boldListMetadata).toBeNull();
    // gray-matter parses ISO dates into JS Date objects; date-iso8601
    // normalizes that back to a string in normalizeDate(). The rule
    // accepts either form — we only assert the bridge passes the
    // value through unchanged.
    expect(parsed.metadata?.status).toBe('accepted');
    expect(parsed.metadata?.date).toBeInstanceOf(Date);

    expect(
      runRule(statusEnumRule, { content, path: '0001-x.md' }),
    ).toEqual([]);
    expect(
      runRule(dateIso8601Rule, { content, path: '0001-x.md' }),
    ).toEqual([]);
  });

  it('bold-list-only file (v2 ADR) still works', () => {
    const content = [
      '- **Status**: accepted',
      '- **Date**: 2026-04-01',
      '',
      '# Title',
    ].join('\n');

    const parsed = parseFile(content);
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.metadata).toEqual({
      status: 'accepted',
      date: '2026-04-01',
    });

    expect(
      runRule(statusEnumRule, { content, path: '0001-x.md' }),
    ).toEqual([]);
    expect(
      runRule(dateIso8601Rule, { content, path: '0001-x.md' }),
    ).toEqual([]);
  });

  it('invalid status in mixed mode surfaces a status-enum diagnostic', () => {
    const content = [
      '---',
      'status: bogus',
      '---',
      '',
      '- **Status**: accepted',
      '',
      '# Title',
    ].join('\n');

    const diagnostics = runRule(statusEnumRule, {
      content,
      path: '0001-x.md',
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      ruleName: 'madr/status-enum',
      messageId: 'invalidStatus',
    });
  });

  it('invalid date in bold-list (no frontmatter) surfaces a date diagnostic', () => {
    const content = [
      '- **Status**: accepted',
      '- **Date**: 2026/04/01',
      '',
      '# Title',
    ].join('\n');

    const diagnostics = runRule(dateIso8601Rule, {
      content,
      path: '0001-x.md',
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      ruleName: 'madr/date-iso8601',
      messageId: 'invalidDate',
    });
  });

  it('key normalization: "Decision Makers" in bold-list maps to "decision-makers"', () => {
    const content = [
      '- **Status**: accepted',
      '- **Decision Makers**: alice, bob',
      '',
      '# Title',
    ].join('\n');

    const parsed = parseFile(content);
    expect(parsed.metadata).toMatchObject({
      'decision-makers': 'alice, bob',
    });
  });
});
