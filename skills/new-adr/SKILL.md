---
name: new-adr
description: Author a new MADR Architecture Decision Record that passes madr-lint from the first save — determines the next ADR number, picks a template for the configured MADR version (v4 frontmatter by default, v2 body-list variant included), writes the file, and validates it with madr-lint in a loop until clean. Use for phrases like "write an ADR", "create a new architecture decision record", "add ADR-000X", "document this decision as an ADR", or "author a decision record for <topic>".
allowed-tools: Bash(npx:*), Bash(ls:*), Bash(find:*), Bash(cat:*), Bash(grep:*), Read, Write, Edit
---

# new-adr — author a new MADR ADR that lints clean

Grounded against **madr-lint@0.3.0** (the latest published npm release) and
the upstream MADR templates
([v4](https://github.com/adr/madr/blob/develop/template/adr-template.md),
[v2.1.2](https://github.com/adr/madr/blob/2.1.2/template/template.md)).

This procedure is mechanical: follow it top to bottom. The only judgment
calls are explicitly marked **DECISION POINT**.

## When to invoke

- "write an ADR for \<decision\>"
- "create a new architecture decision record"
- "add ADR-000X documenting \<X\>"
- "author a decision record about \<topic\>"

## When NOT to invoke

- Rolling madr-lint out on a repo that doesn't have it configured yet → use
  the `adopt-madr-lint` skill first.
- Editing an *existing* ADR → just edit it and re-run `npx madr-lint <file>`;
  no number/template decisions apply.

## Procedure

### Step 1: Find the adrDir and madrVersion

Look for a config file at the repo root, in this resolution order (first
match wins): `.madrlintrc.json`, `.madrlintrc.{ts,mts,js,mjs,cjs}`,
`madr-lint.config.{ts,mts,js,mjs,cjs}`.

```bash
cat .madrlintrc.json 2>/dev/null
grep -n "adrDir\|madrVersion" madr-lint.config.ts 2>/dev/null
```

Read `adrDir` (default `docs/adr` if unset or no config exists) and
`madrVersion` (default `auto` if unset).

**DECISION POINT — which template to follow:**

- `madrVersion` is explicitly `v2`, `v3`, or `v4` in the config → use that
  version's template (v3/v4 → the v4 template below).
- `madrVersion` is `auto`, or the repo has no config at all → **look at the
  most recent existing ADR** to infer the house style: YAML frontmatter
  means v3/v4 (use the v4 template below unless told otherwise), a
  `* Status:` / `- **Status**:` body list means v2 (use the v2 template
  below).
- No existing ADRs and no config → default to **v4**. It's this project's
  own recommended target and the only version with a still-current upstream
  template.

### Step 2: Determine the next number

```bash
ls <adrDir> 2>/dev/null | grep -E '^[0-9]{4}-' | sed -E 's/^([0-9]{4})-.*/\1/' | sort -n | tail -1
```

- If that prints nothing (empty/nonexistent dir), the next number is `0001`.
- Otherwise, zero-pad `(highest + 1)` to 4 digits. E.g. highest is `0004` →
  next is `0005`.

Don't just count files — a gap-tolerant repo (or one running with
`madr/no-numbering-gap` off, which is the `recommended` preset default) may
have non-contiguous numbers. Always take `max + 1`, never `count + 1`.

### Step 3: Pick the filename

Match madr-lint's default `madr/filename-format` pattern —
`^[0-9]{4}-[a-z0-9-]+\.md$` — unless the repo's config overrides `pattern`
(check the same config file from Step 1):

- exactly 4 digits, zero-padded
- one hyphen
- lowercase ASCII letters, digits, and hyphens only in the slug (**no**
  uppercase, no underscores)
- `.md` extension

Example: `0005-adopt-feature-flags.md`. If the config declares a custom
`pattern`, follow that pattern instead.

### Step 4: Write the file from the matching template

#### v4 template (default — YAML frontmatter)

```markdown
---
status: proposed
date: YYYY-MM-DD
decision-makers:
  - <name>
consulted: []
informed: []
---

# <Short title, representative of the problem and the chosen solution>

## Context and Problem Statement

<Two or three sentences, or a short story, describing the situation and the
question being decided. Make the scope explicit.>

## Decision Drivers

* <driver 1 — a quality attribute, constraint, or concern>
* <driver 2>

## Considered Options

* <option 1>
* <option 2>

## Decision Outcome

Chosen option: "<option>", because <justification>.

### Consequences

* Good, because <positive consequence>
* Bad, because <negative consequence>
```

This is the upstream MADR v4 template trimmed to the sections madr-lint's
`recommended` preset actually requires by default (`Context and Problem
Statement`, `Decision Outcome`, `Consequences`), plus `Decision Drivers` and
`Considered Options`, which are conventional and cheap to include. **Note
`### Consequences` is a level-3 heading nested under `## Decision Outcome`**
— that's how the upstream template does it, and it still satisfies
`madr/required-sections`, which matches heading *text* at any heading level,
not a specific `##` depth. Verified during dogfooding: this exact shape
produces zero diagnostics against the `recommended` preset.

Date fact, verified against `madr/date-iso8601`'s default: must be a real
calendar date in `YYYY-MM-DD` form (4-digit year, zero-padded month/day) —
`2026-7-6` and `26-07-06` are both rejected.

Status fact, verified against `madr/status-enum`'s default `values`:
`proposed | rejected | accepted | deprecated`, plus anything starting with
`superseded by` (e.g. `superseded by ADR-0042`) via the default
`prefixValues`. Comparison is case-insensitive by default.

#### v2 template (body-list metadata)

```markdown
# <Short title of the problem and the chosen solution>

* Status: proposed
* Deciders: <name>
* Date: YYYY-MM-DD

## Context and Problem Statement

<Two or three sentences describing the situation, framed as a question if
useful.>

## Decision Drivers

* <driver 1>
* <driver 2>

## Considered Options

* <option 1>
* <option 2>

## Decision Outcome

Chosen option: "<option>", because <justification>.

## Consequences

* Good, because <positive consequence>
* Bad, because <negative consequence>
```

**This deviates from the literal upstream MADR v2.1.2 template on purpose —
verify this if grounding against upstream again later.** The real upstream
v2 template splits consequences into `### Positive Consequences` and
`### Negative Consequences`, with no plain `Consequences` heading anywhere.
Verified during dogfooding: that literal upstream shape fails
`madr/required-sections` (`missingSection` for `"Consequences"`), because
the rule's default `sections` list requires an exact heading named
`Consequences` and `matchMode` defaults to `exact` — `"Positive
Consequences"` doesn't match. Use a single `## Consequences` heading (with
`Good, because` / `Bad, because` bullets, matching this project's own
`recommended`-preset-compliant fixtures) instead of the upstream split.

The `* Status:` / `* Date:` / `* Deciders:` lines must stay a **single,
uninterrupted Markdown list** — see the "v2 body-list is fragile" warning in
Step 5 before adding any inline suppression comment near them.

### Step 5: Validate — loop until clean

```bash
npx madr-lint --format json <adrDir>/<new-file>.md
```

Read `summary.total`. If it's `0`, you're done. Otherwise, read
`results[]` — each entry has `messageId`, `message`, `data`, `suggestion`
(a machine-actionable fix, or `null` when the rule has none), and `docsUrl`
— prefer `suggestion` over hand-rolling a fix from `data` when it's
present — fix the file, and re-run. Do not stop until `summary.total` is
`0` for this file, or exit code is `0` for a plain `npx madr-lint <file>`
run.

Two things that commonly trip this up, both confirmed during dogfooding:

- **`madr/no-broken-links` / `madr/no-duplicate-numbering` /
  `madr/supersedes-bidirectional` are project rules** — they see the whole
  ADR collection, not just your new file. If you reference another ADR by
  number or relative link, lint the whole `adrDir`, not just the new file,
  to catch cross-file problems:

  ```bash
  npx madr-lint --format json <adrDir>
  ```

- **Don't reuse a suppression comment as a shortcut past a real fix.**
  Suppression is for legitimate permanent exceptions (see
  `adopt-madr-lint`'s Step 8), not a way to make a brand-new file pass
  faster. If you're tempted to suppress something in a file you're
  authoring from scratch, fix the underlying value instead — that's cheaper
  than an exception you'll have to justify later.

**v2 body-list is fragile around suppression comments.** If you ever need to
suppress a diagnostic on a v2-style ADR's metadata list (status/date/
deciders), do **not** put the HTML comment between list items — it splits
the list and the field after the comment silently vanishes from parsed
metadata (turning a suppressible line-level diagnostic into an
unsuppressible file-level one). See `adopt-madr-lint`'s Step 8 for the
verified failure mode and the safe alternative
(`madr-lint-disable-file <rule>` placed outside the list).

### Step 6: Done

Once `npx madr-lint <adrDir>` (or the whole configured `adrDir`) exits `0`
for the new file, the ADR is ready to commit alongside whatever change it
documents.

## Reference: commands used in this skill

| Command | Effect |
|---|---|
| `npx madr-lint --format json <file>` | validate one new file |
| `npx madr-lint --format json <adrDir>` | validate the whole collection (needed for cross-file rules) |
| `npx madr-lint <file>` | human-readable re-check before finishing |
