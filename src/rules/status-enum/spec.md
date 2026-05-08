# madr/status-enum

## Description

Validates that an ADR's `status` field (in YAML frontmatter) is one of
the allowed values. Reports `missingStatus` when frontmatter is absent
or the field is missing, and `invalidStatus` when present but not in
the allowed enum.

## MADR version compatibility

- **v3, v4**: frontmatter form `status: proposed` → **supported**
- **v2**: bold-list form `- **Status**: Proposed` → **supported** via the metadata bridge (ADR-0006). The rule reads `context.metadata.status`, which combines frontmatter and bold-list with key normalization (frontmatter wins on conflict; explicit null/undefined frontmatter values are skipped to preserve bold-list values).

## Diagnostic

- `messageId`: `missingStatus` | `invalidStatus`
- `data`:
  - `missingStatus`: `{}`
  - `invalidStatus`: `{ status: string, allowed: string[] }`
- Default severity in `recommended` preset: `error`

## Options

```json
{
  "values": ["proposed", "rejected", "accepted", "deprecated"],
  "prefixValues": ["superseded by"],
  "caseSensitive": false
}
```

- `values: string[]` — exact-match allowed status values.
- `prefixValues: string[]` — `startsWith` allowed prefixes (e.g.
  `'superseded by ADR-0042'` matches `'superseded by'`).
- `caseSensitive: boolean` — when `false` (default), `'Accepted'`,
  `'ACCEPTED'`, `'accepted'` all match `'accepted'`.

## Examples

### Valid

| Fixture | Status field | Why |
|---|---|---|
| `proposed.md` | `proposed` | exact match |
| `accepted.md` | `accepted` | exact match |
| `deprecated.md` | `deprecated` | exact match |
| `mixed-case.md` | `Accepted` | case-insensitive default |
| `superseded.md` | `superseded by ADR-0042` | prefix match |

### Invalid

| Fixture | Reason | Diagnostic |
|---|---|---|
| `no-frontmatter.md` | no YAML frontmatter at all | `missingStatus` |
| `no-status.md` | frontmatter exists but no `status` key | `missingStatus` |
| `typo.md` | `status: acccepted` (3 c's) | `invalidStatus` |
| `unknown.md` | `status: pending` | `invalidStatus` |

## When to disable

Disable (`'madr/status-enum': 'off'`) when migrating from a system
with different status vocabulary. Prefer overriding `values` to
preserve some validation.
