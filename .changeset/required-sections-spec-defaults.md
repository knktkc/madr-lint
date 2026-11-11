---
"madr-lint": minor
---

Fix the default `sections` of `madr/required-sections` to match the MADR templates (#214). The defaults are now `Context and Problem Statement`, `Considered Options`, and `Decision Outcome`, the headings that the v2 (2.1.2), v3 (3.0.0), and v4 (4.0.0) templates do not mark as optional. The old defaults required `Consequences` instead of `Considered Options`.

What changes in your results:

- A v2 ADR written from the template no longer fails with `Missing required section: "Consequences"`. The v2 template has `Positive Consequences` and `Negative Consequences` (both optional) and no `Consequences` heading, so these ADRs failed even with `madrVersion: 'v2'`.
- A v3/v4 ADR without the optional `Consequences` heading no longer fails.
- An ADR without a `Considered Options` heading now fails. Add the heading, or set `sections` to keep the old list: `['Context and Problem Statement', 'Decision Outcome', 'Consequences']`.
