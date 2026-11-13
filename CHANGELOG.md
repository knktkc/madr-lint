# Changelog

## 0.6.0

### Minor Changes

- [#216](https://github.com/knktkc/madr-lint/pull/216) [`e96897c`](https://github.com/knktkc/madr-lint/commit/e96897cdd42b1ab49d4551e7576250c270924fe4) Thanks [@knktkc](https://github.com/knktkc)! - Make `madrVersion` take effect ([#207](https://github.com/knktkc/madr-lint/issues/207)). The setting was accepted and documented as selecting the MADR spec to validate against, but no rule read it: `'v2'`, `'v3'`, `'v4'`, and `'auto'` gave the same results. It now decides two things.
  
  - **Where metadata is read from.** `v2` reads the list under the title (`* Status: ...`) only, and `v3`/`v4` read YAML frontmatter only. `auto` (the default) still merges both, so a repository on the default sees no change.
  - **Which rules run.** A rule runs only for the MADR versions it supports. `madr/supersedes-bidirectional` supports v3/v4, so it no longer runs with `madrVersion: 'v2'`.
  
  An unknown `madrVersion` value (for example `"V3"`) is now a config error (exit 2) instead of being accepted.
  
  New rule `madr/metadata-format` (enabled as `error` in `recommended`) reports a file whose metadata is in the format the configured version does not read, for example a body list with `madrVersion: 'v4'`. Without it, that file's status and date would go unchecked.
  
  What changes in your results if you set a fixed `madrVersion`:
  
  - With `v3`/`v4`, a file whose metadata is a body list now gets `madr/metadata-format`, and `madr/status-enum` / `madr/date-iso8601` report its status and date as missing. Move the metadata into frontmatter, or switch to `madrVersion: 'auto'`.
  - With `v2`, a file with frontmatter now gets `madr/metadata-format`, and its frontmatter fields are no longer read.
  
  `madr-lint init` now writes `auto` when the sampled ADRs mix frontmatter and body-list metadata, instead of the majority version.
  
  For rule authors and API users: `context.madrVersion` and `context.listMetadata` are new on the per-file rule context; `parseFile` takes an optional version and returns `version`; `runRule`, `runRulesOnFile`, and `runRulesOnProject` accept `madrVersion`; `buildProjectFile` takes it as a second argument.

- [#215](https://github.com/knktkc/madr-lint/pull/215) [`5d04308`](https://github.com/knktkc/madr-lint/commit/5d04308f319bc295cf764efd0819d8bbace24199) Thanks [@knktkc](https://github.com/knktkc)! - Fix the default `sections` of `madr/required-sections` to match the MADR templates ([#214](https://github.com/knktkc/madr-lint/issues/214)). The defaults are now `Context and Problem Statement`, `Considered Options`, and `Decision Outcome`, the headings that the v2 (2.1.2), v3 (3.0.0), and v4 (4.0.0) templates do not mark as optional. The old defaults required `Consequences` instead of `Considered Options`.
  
  What changes in your results:
  
  - A v2 ADR written from the template no longer fails with `Missing required section: "Consequences"`. The v2 template has `Positive Consequences` and `Negative Consequences` (both optional) and no `Consequences` heading, so these ADRs failed even with `madrVersion: 'v2'`.
  - A v3/v4 ADR without the optional `Consequences` heading no longer fails.
  - An ADR without a `Considered Options` heading now fails. Add the heading, or set `sections` to keep the old list: `['Context and Problem Statement', 'Decision Outcome', 'Consequences']`.

- [#223](https://github.com/knktkc/madr-lint/pull/223) [`2c8e4fe`](https://github.com/knktkc/madr-lint/commit/2c8e4fe671437fc3b4ab7263fea9d8472bc6d3d0) Thanks [@knktkc](https://github.com/knktkc)! - Report unknown top-level keys in the config, and configs that are not an object ([#222](https://github.com/knktkc/madr-lint/issues/222)). madr-lint read the keys it knows from whatever the config file yielded and ignored the rest. A misspelled key (`rule`, `adrdir`) had no effect. Neither did a config in a named export: with `export const config = {...}` and no default export, the module's exports were read as the config, and `config` is not a key madr-lint reads. A discovered config like that linted with the recommended rules instead of its own; with `--config`, no rule ran and the CLI exited 0. Both are now a config error (exit 2), on discovered config files and on `--config` alike, for every config file format.
  
  The error names the key and suggests a known key when one is close (ignoring case). Otherwise it lists the known keys. When a TypeScript or JavaScript config has no default export and an unknown export looks like a config (its value is an object with a known config key), the error names that export and says to export it as the default. For the named-export config above:
  
  ```text
  Unknown key "config" in the config. Known keys: "extends", "madrVersion", "adrDir", "rules", "ignorePatterns", "cache", "cacheLocation".
  The export "config" looks like a config. Export it as the default: `export default config` (ESM) or `module.exports = config` (CommonJS).
  ```
  
  If no export looks like a config, a module written in ESM syntax gets the line `The config file has no default export, so its exports were read as the config.` instead. A plain CommonJS `module.exports = {...}` is its default export, so it gets no extra line unless one of its keys looks like a config (`module.exports = { config: { rules: {...} } }`). JSON configs and modules with a default export never get either line.
  
  With `--config`, the message starts with `Failed to load config "<path>": `. Unknown keys are listed first, in the same error as the unknown rule IDs and `extends` entries from [#206](https://github.com/knktkc/madr-lint/issues/206). Keys such as `$schema` are unknown keys too, and inherited enumerable keys (`Object.create({...})`) are checked like own keys, except enumerable properties that a dependency added to `Object.prototype`. Two keys that module interop adds are not config keys in a JS/TS config: `__esModule`, and a `default` key that points back at the config (`module.exports = c; module.exports.default = c`) or at an object that is its own default (such a module spread into the config with `{ ...base }`); in JSON both are unknown keys. A config that is not an object is reported as, for example, `The config must be an object, not a function.` An async config gets `The config must be an object, not a Promise. Async configs are not supported: export the config object itself.`
  
  These keep working: `export default {...}`, `export default defineConfig({...})`, `module.exports = {...}`, named exports that are all known keys (`export const rules = {...}`), a class instance with config fields, the config `madr-lint init` writes, and running without a config file.
  
  What changes in your results:
  
  - A config with a top-level key madr-lint does not read, own or inherited, now exits 2 instead of ignoring the key. Fix the name the message points to, or remove the key.
  - A JS/TS config that holds the config object in a named export (`export const config = {...}` or `exports.config = {...}`) now exits 2. Export the object as the default: `export default config` or `module.exports = config`.
  - A config that is not an object now exits 2. This includes a Promise (`export default (async () => ({...}))()`, which used to be read as an empty config), a function, even one that carries config properties (`export default () => ({...})`, `export default Object.assign(function () {}, { rules: {...} })`, or a class with static config fields, which used to be read), `export default undefined` (also when named exports sit next to it, which used to be read instead), `export default null`, and a JSON file that holds `[]` or a string. `module.exports = null`, `module.exports = undefined`, and a JSON file that holds `null` used to crash with a `TypeError` (exit 1; with `--config`, exit 2 with the `TypeError` text) and now get this message.
  - A config module without a default export that mixes known named exports with other exports (`export const rules = {...}` next to `export const helper = ...`) now exits 2, because the other exports are read as unknown keys. Move the config into a default export.

- [#221](https://github.com/knktkc/madr-lint/pull/221) [`3f8e101`](https://github.com/knktkc/madr-lint/commit/3f8e101b7ecbc0069fd80badefa65de8db5f5668) Thanks [@knktkc](https://github.com/knktkc)! - Report unknown rule IDs and `extends` entries in the config ([#206](https://github.com/knktkc/madr-lint/issues/206)). A typo in a rule ID (`madr/status-enmu`) or a preset name (`madr-lint:recomended`) used to be ignored silently. With both typos, no rule ran and the CLI exited 0. Both are now a config error (exit 2), on discovered config files and on `--config` alike.
  
  The error suggests a known name when one is close (ignoring case, and adding a missing `madr/` or `madr-lint:` prefix). Otherwise it lists the known presets or links to the rule list. Every problem in the config is listed at once:
  
  ```text
  Invalid config (2 problems):
    - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?
    - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?
  ```
  
  With `--config`, the message starts with `Failed to load config "<path>": `.
  
  Rule IDs under `core/` (such as `core/internal-error`) are reserved for madr-lint's own diagnostics, and configuring one is also an error. An invalid `madrVersion` is reported in the same list. A bare string `extends: 'madr-lint:recommended'` keeps working as a one-entry list. `null`, `undefined`, and `false` still mean "absent" for `extends`, for `rules`, and for each entry of an `extends` list, as in `rules: ci && {...}` or `extends: [ci && 'preset']`.
  
  What changes in your results:
  
  - A config with a misspelled rule ID or preset name now exits 2 instead of linting with fewer rules than you wrote. This includes a misspelled rule set to `'off'`. Fix the name the message points to, or remove the entry.
  - A config that sets a `core/` rule ID now exits 2. Remove that entry; the reserved diagnostics cannot be turned off.
  - Other values that used to be ignored now exit 2: an `extends` entry that is not a preset name (including `''`, `42`, and `true`), and a `rules` value that is not an object (such as `[]`, `0`, or `''`).

## 0.5.2

### Patch Changes

- [#208](https://github.com/knktkc/madr-lint/pull/208) [`319f6ce`](https://github.com/knktkc/madr-lint/commit/319f6cecfc80ee3513ea9cde79b0ce2fac78f566) Thanks [@knktkc](https://github.com/knktkc)! - Keep the settings of a discovered config file that sets no rules. The CLI still fills in the `recommended` rules, but `adrDir`, `ignorePatterns`, `cache`, and `cacheLocation` from the file now apply instead of being reset to their defaults, so a config with only `adrDir` lints that directory. Such a repository used to print "No .md files to lint" and exit 0, so CI can now report errors that were hidden before.

## 0.5.1

### Patch Changes

- [`671cae1`](https://github.com/knktkc/madr-lint/commit/671cae1efa3f598a49fef17b773a82310d5b916f) Thanks [@knktkc](https://github.com/knktkc)! - Stop following symbolic links committed to a repository. The directory walk skips linked directories, and a start path or explicit argument that a link takes outside the working directory now exits with code 2. Cache, baseline, and `init` writes replace a link instead of writing to its target, and they refuse linked parent directories. A config `cacheLocation` outside the working directory is ignored with a warning. The GitHub Action now passes `--no-cache`. `cache: false` in a config now takes effect, invalid frontmatter is reported per file without printing the file's content, and the `github` format escapes a cached line number.

## 0.5.0

### Minor Changes

- [#200](https://github.com/knktkc/madr-lint/pull/200) [`c67293d`](https://github.com/knktkc/madr-lint/commit/c67293dc6f3f94afe6e32180f4c86221f0d21d6d) Thanks [@knktkc](https://github.com/knktkc)! - Read `---js` and `---javascript` frontmatter that is a static object literal: strings, numbers, booleans, null, arrays, and nested objects, with comments, unquoted keys, and trailing commas. The block is parsed as data and never executed, so calls, variables, expressions, template literals, getters, methods, spread, and computed keys still fail with an error. `madr/supersedes-bidirectional` no longer offers a `--fix` for targets whose frontmatter is `---js` or `---json`, because inserting a YAML line would corrupt them.

## 0.4.3

### Patch Changes

- [`f854ca3`](https://github.com/knktkc/madr-lint/commit/f854ca3a84e2694307356117bfd23c9d5db3ef2c) Thanks [@knktkc](https://github.com/knktkc)! - Reject JavaScript frontmatter instead of evaluating it. A document that opens with `---js` or `---javascript` now fails with an error, and its frontmatter block is not executed.

## 0.4.2

### Patch Changes

- [#127](https://github.com/knktkc/madr-lint/pull/127) [`ac0883e`](https://github.com/knktkc/madr-lint/commit/ac0883e1b9c015cf328ea2d4e806c564cc42489f) Thanks [@knktkc](https://github.com/knktkc)! - Bypass gray-matter's content-keyed parse cache ([#122](https://github.com/knktkc/madr-lint/issues/122)). gray-matter 4.0.3 memoizes a parse only when it is called with no options, in a plain object keyed by the *whole document* (`matter.cache[content]`). Both parser call sites now pass a shared, frozen options object, which turns that memoization off.
  
  - **A document whose entire content is any `Object.prototype` member name (`constructor`, `toString`, `valueOf`, `__proto__`, …) no longer crashes.** Every one of those twelve lookups hit an inherited member, which gray-matter accepted as a cache hit and returned as a file with `content: undefined` — so `parseFile` threw `TypeError: Cannot convert undefined or null to object` and `frontmatterOffset` threw `TypeError: Cannot read properties of undefined (reading 'length')`. The throw escaped `lintFiles`, so `madr-lint docs/adr` on a directory holding such a file exited with a stack trace instead of reporting; it now reports the file's violations like any other. Only those exact bodies were affected — a trailing newline made the key an ordinary miss.
  - **madr-lint no longer keeps every parsed document in memory.** The cache retained each document's full content for the process lifetime, as the key, the stripped body, and an `orig` Buffer. Measured over 1,000 distinct 8.4 KB documents: 16.9 MB retained before (8.9 MB heap + 8.0 MB buffers, about 2.1x the corpus), 0 MB now. Per-file lint throughput is unchanged (-1% to +3% across the rule benches, i.e. noise). `--fix` now performs a real second parse in `frontmatterOffset` where it previously got a memo hit — about +3 µs per file per pass, measured on this repo's own ADRs; correctness is unaffected.

- [#134](https://github.com/knktkc/madr-lint/pull/134) [`7512968`](https://github.com/knktkc/madr-lint/commit/7512968fc1420e232bd60cb977b5f7cb091be5aa) Thanks [@knktkc](https://github.com/knktkc)! - Read the fields below a bullet-marker change in a MADR v2 metadata block ([#115](https://github.com/knktkc/madr-lint/issues/115)). `* Status: accepted` followed by `- Date: 2026/07/06` is two CommonMark lists with no node between them, so the HTML-comment bridge added for [#73](https://github.com/knktkc/madr-lint/issues/73) could not reach the second one and every field below the marker change vanished from metadata.
  
  - **A marker change no longer drops fields.** An adjacent list now joins the metadata block when *every* one of its items reads as a `Key: value` pair, so the `Date` above is parsed, keeps its own line number, is targetable by `madr-lint-disable-next-line`, and is repaired by `--fix` — instead of degrading a line-suppressible `invalidDate` into an unsuppressible file-level `missingDate`. The gate is shape, not marker: an ordered list (`1. Date: …`) after an unordered one merges on the same terms; a list with any non-`Key: value` item is prose and still ends the block, as do a paragraph, a code fence, a thematic break, a blockquote, a heading of any depth, and visible HTML.
  - **`extractListMetadata` (public export) returns more keys for some documents.** The accepted cost of a shape-only gate is over-merging: a genuine prose list whose every bullet happens to read `Key: value` (`- Option A: do nothing`) is now merged into the block, so its keys appear in `listMetadata` / `metadata`. Merging can only add keys — duplicates still resolve first-wins, so an earlier field always shadows a later one and no document loses a key it had. The recognized-key gate (`status`, `date`, `deciders`, `decision-makers`, `consulted`, `informed`) is unchanged as a mechanism, but its outcome can change: a document whose only recognized key sits in the adjacent list now returns metadata where it previously returned `null` (which also lets `madr-lint init` cast a v2 version vote for it). Absorbed junk keys on their own never flip that gate.
  - **Upgrading with a baseline**: a v2 field below a marker change was reported as a file-level `missingDate` / `missingStatus`; it is now reported as `invalidDate` / `invalidStatus` on the field's own line. If you baselined the old entry, re-run `madr-lint --update-baseline` — the stored entry no longer absorbs the new diagnostic, and the file goes red on an otherwise unchanged tree.

- [#135](https://github.com/knktkc/madr-lint/pull/135) [`eba7822`](https://github.com/knktkc/madr-lint/commit/eba78224ea23a018b6d1102c5de4af1a114903ca) Thanks [@knktkc](https://github.com/knktkc)! - Resolve `madr-lint-disable-next-line` from the comment's last line ([#116](https://github.com/knktkc/madr-lint/issues/116)). A directive spelled as a multi-line `<!--` … `-->` block parsed correctly, but the suppression layer counted its target from the html node's **start** line, so it landed on the comment's own interior instead of the content below `-->`. Directives now carry the node's end line and count from there.
  
  - **A multi-line directive now reaches the line it points at.** Previously the diagnostic below `-->` was reported despite the directive — for the issue's document (a `disable-next-line madr/date-iso8601` split across three lines between two MADR v2 metadata items), `invalidDate` on the `* Date:` line was reported, not suppressed. A blank line between `-->` and the content is skipped, exactly as it is for a one-line directive.
  - **Single-line directives are unchanged**: a one-line comment's end line *is* its start line, so nothing about the existing spelling moves. `disable` / `enable` ranges still open and close at the comment's **start** line, which is what preserves their pre-existing behavior. That choice is observable: an inline multi-line comment shares its start line with the content beside it — `[gone](./nope.md) <!--` … `-->` spans three lines while `madr/no-broken-links` reports the link on the first — so counting a range from the end line would stop such a `disable` from covering its own line.
  - **The docs no longer ask you to keep a directive on one line.** The suppression guide (en/ja) and the `adopt-madr-lint` / `new-adr` skills previously called the multi-line spelling a miss; they now document it as working.

- [#123](https://github.com/knktkc/madr-lint/pull/123) [`657e3ef`](https://github.com/knktkc/madr-lint/commit/657e3ef7ab641fc8055796d22c8303a2b931b4b0) Thanks [@knktkc](https://github.com/knktkc)! - Make filename- and document-derived record keys prototype-safe ([#56](https://github.com/knktkc/madr-lint/issues/56)). Both the cache manifest and the MADR v2 metadata parser accumulated untrusted keys on plain objects, where a key that names an `Object.prototype` member is read and written *through* the prototype instead of stored as data.
  
  - **Cache manifest keys are now prototype-safe.** `manifest.files` is a null-prototype map on both the cold path and rehydration, so a file whose relative path is `__proto__` caches, serializes, and cache-hits like any other. Previously the write went through the inherited `__proto__` setter — the entry never reached `manifest.json` and every run was a cold miss. No user-facing bug is fixed: the key is unreachable from the CLI (`findAdrFiles` drops every non-`.md` target, and a `__proto__.md` file keys as `__proto__.md`) and from the published API (`lintFiles` is not exported from `madr-lint`). This is hardening for the internal `lintFiles` seam and any future entry point that passes explicit paths. It was never a global pollution vector either: plain assignment swapped that one record's prototype rather than mutating `Object.prototype`. `saveManifest` output is byte-identical for ordinary keys, so existing manifests stay valid — no `CACHE_SCHEMA_VERSION` bump.
  - **A v2 body-list key named `constructor` is now read.** The leading metadata block de-duplicates with `Object.hasOwn` instead of `in`, so `* Constructor: x` lands in `metadata.constructor` (with its body position and value offset) rather than being silently skipped because `'constructor' in {}` is true through inheritance. `constructor` is the only reachable case: key normalization lowercases, so `toString` arrives as `tostring` (not a member), and `__proto__` never matches the key pattern, which requires a leading letter. No rule reads these fields — the fix is for library consumers of `extractListMetadata` and `ParsedFile`, which previously got `Object` back for such a key. The returned records keep an ordinary prototype, so `hasOwnProperty` still works on them.
  - **A frontmatter key named `__proto__` survives the v2 merge.** When a file carries both YAML frontmatter and a v2 body list, the merge step that drops explicit `null`/`undefined` now builds its record on a null prototype, so `__proto__: x` reaches `metadata.__proto__` as data instead of being swallowed by the inherited setter. The merged `metadata` is still a plain object.

## 0.4.1

### Patch Changes

- [#114](https://github.com/knktkc/madr-lint/pull/114) [`e7d3a30`](https://github.com/knktkc/madr-lint/commit/e7d3a30fc84e0cbc4f2f76bcdc50a7681a38b8fc) Thanks [@knktkc](https://github.com/knktkc)! - Fix v2 metadata being silently dropped after an HTML comment ([#73](https://github.com/knktkc/madr-lint/issues/73)). A suppression comment placed _between_ MADR v2 metadata-list items splits the Markdown list in two (CommonMark), and the v2 bridge previously read only the first segment — so a field below the comment vanished from `context.metadata`, turning a line-suppressible `invalidDate` into an unsuppressible file-level `missingDate`. Suppressing was strictly worse than not suppressing.

  - **The v2 metadata block is now the leading run of lists joined across HTML comments.** A comment renders as nothing, so it can no longer end the block. A key below a comment now behaves exactly like one above it: it keeps its own body line, so `<!-- madr-lint-disable-next-line madr/date-iso8601 -->` between items reaches the field below it, and it carries the same value offsets, so — with no directive above it — `--fix` rewrites that field in place (`madr/status-enum`, `madr/date-iso8601`). Not both: `--fix` never rewrites a suppressed problem. Blank lines around the comment do not matter — `disable-next-line` already targets the next non-blank line.
  - **Only comments bridge.** Visible HTML (`<div>`, `<details>`, or a node like `<!-- a --> visible` that is not purely a comment), a paragraph, a code fence, a thematic break, a blockquote, and a heading of any depth all still end the metadata block — it must lead. Two lists with no comment between them (a bullet-marker change, `* Status:` then `- Date:`) are still two lists, and the second is still not metadata.
  - **Public API**: `extractListMetadata` now reads list segments separated only by HTML comments. The signature is unchanged and the change is additive — merging can only add keys (duplicate keys still resolve first-wins), so it never returns fewer than before. Two consequences worth knowing: a document whose recognized MADR key sits only in a later segment now returns metadata where it previously returned `null` (which also lets `madr-lint init` cast a v2 version vote for it), and a prose list placed after the metadata block with only a comment between them, before the next heading of any depth, can contribute an extra key.
  - **Upgrading with a baseline**: a v2 field hidden by this bug was reported as a file-level `missingDate` / `missingStatus`; it is now reported as `invalidDate` / `invalidStatus` on the field's own line. If you baselined the old entry, re-run `madr-lint --update-baseline` — the stored entry no longer absorbs the new diagnostic, and the file goes red on an otherwise unchanged tree.
  - **Not fixed here**: a directive written as a multi-line `<!--` … `-->` block still resolves to its own second line, so keep `disable-next-line` on a single line. `<div>`-style HTML on the line directly above a metadata item swallows that line into the HTML block, so the item never reaches the AST at all.

## 0.4.0

### Minor Changes

- [#87](https://github.com/knktkc/madr-lint/pull/87) [`7795ca7`](https://github.com/knktkc/madr-lint/commit/7795ca7c40634097806ad2bd7f82d4a3a02e465d) Thanks [@knktkc](https://github.com/knktkc)! - Autofix framework — `--fix`, `meta.fixable`, and the fixer API ([#28](https://github.com/knktkc/madr-lint/issues/28), [ADR-0008](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0008-autofix-text-edits.md)). Fixes are raw-text offset edits, never AST serialization, so a fix changes only the span it targets and leaves every other byte untouched.

  - **Rule API**: a rule declares `meta.fixable: 'code'` and attaches a lazy `fix: (fixer) => TextEdit | TextEdit[] | null` to `context.report(...)`. The `Fixer` (`replaceRange` / `insertAt` / `remove`) takes body (mdast) offsets and translates them to whole-file offsets past stripped frontmatter, so fixes are correct on files with YAML frontmatter. A fix from a rule that did not declare `meta.fixable` is a rule bug — the runner routes it through `core/internal-error`. Fix thunks are lazy: a normal lint constructs no fixer and invokes no thunk.
  - **CLI**: `--fix` applies fixes in place (only files that change are written) and the exit code reflects the problems that **remain**; `--fix-dry-run` prints a per-file unified diff and writes nothing (exit code as if fixes were applied). Fixes compose with existing flags — `--quiet` / `--max-warnings` operate on the remaining diagnostics, and **suppressed** (`madr-lint-disable`) and **baselined** problems are never rewritten. `--update-baseline` combined with `--fix` / `--fix-dry-run` is a usage error (exit 2).
  - **Applier**: collects fixes from reported diagnostics only (after suppression and baseline), sorts by offset, drops overlaps (first-by-position wins), applies in one pass, then re-lints to a fixpoint (max 10 passes). Per-file scope — cross-file fixes are tracked separately.
  - **First real fix**: `madr/status-enum` now mechanically normalizes a v2 list-sourced status value that differs from an allowed value purely by case (e.g. `Accepted` → `accepted`). Frontmatter-sourced values and genuine typos get no fix.
  - **Reporters**: `text` marks fixable diagnostics with a dim `🔧 fixable` tag; `json` gains a `fixable` boolean per result and a `summary.fixed` count when a fix pass ran; `github` / `sarif` are unchanged.
  - **Programmatic API**: exports `applyEdits`, `makeFixer`, `collectFixes`, `fixFileContent`, `unifiedDiff`, `MAX_FIX_PASSES`, `frontmatterOffset`, and the `TextEdit` / `Fixer` / `FixFn` types.
  - **Parser**: `ParsedFile.metadataValueLoc` (exposed to rules as `context.metadataValueLoc`) gives the body-coordinate `{ start, end }` offset range of a `metadata` value, for values sourced from the v2 leading list as a single contiguous text token — the offset source a fix's `fixer.replaceRange` targets.

  **Breaking (type + cache):** `Diagnostic` gains a required `fixable: boolean` field (disclosed like the earlier `suggestion` / `docsUrl` additions), and the content-hash cache schema version is bumped to `3` (missing/mismatched ⇒ cold), so the first run after upgrading re-lints once instead of serving stale-shape cached diagnostics. Consumers constructing `Diagnostic` objects by hand must set `fixable`.

- [#88](https://github.com/knktkc/madr-lint/pull/88) [`32e1c04`](https://github.com/knktkc/madr-lint/commit/32e1c0475b9547236b32c94154ad023270d8b0e6) Thanks [@knktkc](https://github.com/knktkc)! - Make three rules fixable, including the first **cross-file** fix ([#29](https://github.com/knktkc/madr-lint/issues/29)). Building on the autofix framework ([#28](https://github.com/knktkc/madr-lint/issues/28)), fixes remain raw-text offset edits — only the targeted span changes.

  - **`madr/date-iso8601`** now normalizes an **unambiguous** v2 body-list date to `YYYY-MM-DD`: year-first numeric with a single separator (`2026/7/3`, `2026.7.3`, `2026-7-3`) and English named-month forms (`3 Jul 2026`, `July 3, 2026`). Ambiguous day/month order (`03/07/2026`), two-digit years, impossible calendar dates (`2026/2/30`), non-English month names, and any **frontmatter**-sourced value are reported but never rewritten.
  - **`madr/status-enum`** extends its case-only fix with a tiny synonym/misspelling map validated against the **configured** enum: curated typos (`superceded by …` → `superseded by …`, `depricated` → `deprecated`) fixed under any case setting, and prefix corrections that preserve the tail. Case-only corrections (`Accepted` → `accepted`, `Superseded By ADR-0042` → `superseded by ADR-0042`) apply under `caseSensitive: true` — with the default `caseSensitive: false` such values are valid and never flagged. A value that maps to two candidates, a synonym whose target is not configured, a genuine typo with no unique target, and frontmatter-sourced values get no fix.
  - **`madr/supersedes-bidirectional`** gains the first **cross-file** fix: a `missingBackReference` inserts the reciprocal `<direction>: <expected>` line into the target ADR's **existing** YAML frontmatter, immediately before the closing `---`. The frontmatter is treated as opaque lines (no YAML reparse/reserialize), so key order, comments, and the file's newline style (LF/CRLF) are preserved. It declines when the target has no frontmatter (a block is never created), when the key already exists (value rewrite/append is out of scope), and for `unknownReference` (contextual). When two sources need a back-reference in the same target, one insertion lands per pass and the runner-up is reported.
  - **Framework**: `context.report({ fix })` on a **project** rule is now honored (`meta.fixable: 'code'` gates it; a fix from a non-fixable project rule routes through `core/internal-error`, matching per-file behavior). `lintAndFix` runs a project-fix fixpoint on the fixed contents — collecting edits keyed by the target's `path`, applying them per file (the ADR-0008 per-file edit-set seam), and re-running the project pass to a fixpoint under the same 10-pass bound; suppressed and baselined problems are never rewritten.
  - **Programmatic API**: exports `collectProjectFixes` and `applyEditsCounted` from `src/core/fix.ts`.

  No breaking changes: `Diagnostic.fixable` was already required ([#28](https://github.com/knktkc/madr-lint/issues/28)); project-rule diagnostics that previously reported `fixable: false` now report `true` only when the rule attaches a fix.

- [#85](https://github.com/knktkc/madr-lint/pull/85) [`0e05d1c`](https://github.com/knktkc/madr-lint/commit/0e05d1cd338ae6adec99c066822c3c1edddac029) Thanks [@knktkc](https://github.com/knktkc)! - `madr-lint init` — scaffold a config file with detection heuristics ([#30](https://github.com/knktkc/madr-lint/issues/30)). Non-interactive by design (works in CI / piped stdin):

  - **ADR directory**: first of `docs/adr`, `docs/decisions`, `doc/adr`, `adr`, `docs/architecture/decisions` whose top level contains at least one `NNNN-*.md` file; falls back to `docs/adr` (the linter's default) with a note when nothing qualifies.
  - **MADR version**: samples up to 20 existing ADRs and lets the majority win — frontmatter with `decision-makers` counts as v4, other frontmatter as v3, a v2 metadata list as v2; empty/tie/no-metadata yields `auto` (omitted from the config, it is the default).
  - **Config format**: `madr-lint.config.ts` when the project looks TypeScript-ish (`tsconfig.json`, or `typescript` among `package.json` dependencies), `.madrlintrc.json` otherwise.
  - Refuses to overwrite an existing config file (exit 2); `--force` overwrites, `--dir <path>` overrides directory detection, `--json` emits a machine-readable summary of what was detected and written.
  - The next-steps epilogue runs a cheap in-process lint of the detected directory and suggests `--update-baseline` when it finds violations, so legacy debt does not block adoption.

  The plain `madr-lint [paths]` command is unchanged — `init` is dispatched only when it is the literal first argument, so paths, flags and exit codes behave exactly as before.

## 0.3.0

### Minor Changes

- [#71](https://github.com/knktkc/madr-lint/pull/71) [`55e7b89`](https://github.com/knktkc/madr-lint/commit/55e7b89a5d1dc6c3109e04b02c082aadd713b701) Thanks [@knktkc](https://github.com/knktkc)! - Diagnostics now carry machine-actionable `suggestion` and `docsUrl` in the json/text/github output ([#67](https://github.com/knktkc/madr-lint/issues/67)). Error feedback is self-contained — expected vs actual plus a concrete fix and a docs link — so agents and humans repair violations without a separate doc lookup.

  - **Rule meta** gains an optional declarative `suggestions` map (messageId → template), interpolated with the diagnostic data exactly like `messages`. Rules stay declarative — no imperative suggestion building. Declare an entry only where a mechanical fix exists; omit where the fix is contextual.
  - **`Diagnostic`** gains `suggestion: string | null` (null when the rule defines none for that message) and `docsUrl: string` (the rule's `docs.url`; the repository for `core/internal-error`), both resolved by the runner at report time.
  - **Reporters**: `text` renders an indented `→ <suggestion>` line under a diagnostic and prints the docs URL once per rule per file group (compact — never per diagnostic); `json` adds `suggestion` and `docsUrl` to every result (keys always present); `github` appends ` — <suggestion>` to the annotation message (escaped). `sarif` is unchanged — its `helpUri` already carries the docs URL.
  - **All 8 rules audited**; suggestions filled where the remediation is mechanical (`required-sections`, `status-enum` missing status, `date-iso8601`, `filename-format`, `no-broken-links`, `no-duplicate-numbering`, `supersedes-bidirectional`) and omitted where contextual (`no-numbering-gap`; `status-enum` invalid status already lists the allowed values).
  - **Fixed** `supersedes-bidirectional`'s `missingBackReference` message, which named the wrong declared field: it now renders the field the source file actually declares (`supersedes:` vs `superseded-by:`) and states the exact `field: value` back-reference to add.
  - **Breaking (pre-1.0)**: `Diagnostic` gains two required fields — external code that **constructs** `Diagnostic` values must now supply `suggestion` (`string | null`) and `docsUrl` (`string`); consumers that only read diagnostics are unaffected (the keys are always present). The on-disk cache manifest also gains a schema version (`schemaVersion: 2`; missing/mismatched ⇒ cold), so the first run after upgrading re-lints once instead of serving stale-shape cached diagnostics.

  Resolution is report-time only, so it stays zero-cost on clean files and free on the sub-microsecond hot path.

## 0.2.0

### Minor Changes

- [#54](https://github.com/knktkc/madr-lint/pull/54) [`d91e248`](https://github.com/knktkc/madr-lint/commit/d91e248928b68d5408d38de731986cbfa61174aa) Thanks [@knktkc](https://github.com/knktkc)! - Baseline file for gradual adoption ([#24](https://github.com/knktkc/madr-lint/issues/24)). Adopt `madr-lint` on a repo with existing violations without fixing them all first — `--update-baseline` snapshots today's violations to `.madr-lint/baseline.json`, and subsequent runs subtract them so only **new** violations fail the build.

  - `madr-lint --update-baseline` writes the baseline (deterministic sorted JSON, POSIX-relative paths, 2-space indent + trailing newline for clean git diffs) and exits 0.
  - Default runs subtract an existing baseline; `--no-baseline` ignores it and shows everything.
  - Fingerprint = `(relative path, ruleName, messageId)` → allowed **count** (a tsc-baseline-style count model), so the baseline survives unrelated edits by construction — no line numbers, no message text. See [ADR-0007](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0007-baseline-fingerprint-design.md).
  - Subtraction runs after inline suppression and is never stored in the cache, so editing or deleting the baseline takes effect without cache invalidation (warm-cache runs still subtract). `core/internal-error` is never baselined.
  - `--format json` gains `summary.baselineHidden` (always present, `0` when no baseline is active); SARIF output is unchanged. A present-but-malformed baseline file is ignored with a one-line stderr warning rather than silently.
  - Programmatic API adds `buildBaseline`, `applyBaseline`, `loadBaseline`, `writeBaseline`, `serializeBaseline`, `baselinePath`, and the `Baseline` type.

- [#55](https://github.com/knktkc/madr-lint/pull/55) [`47624ad`](https://github.com/knktkc/madr-lint/commit/47624add4af8c611dd566993905457a27a826231) Thanks [@knktkc](https://github.com/knktkc)! - CLI ergonomics ([#27](https://github.com/knktkc/madr-lint/issues/27)): add `--quiet`, `--max-warnings <n>`, and `--config <path>` flags with ESLint-mirrored semantics.

  - `--quiet` filters warnings from the **output** of every reporter (text/json/sarif/github); the unfiltered warning count still drives `--max-warnings`.
  - `--max-warnings <n>` exits 1 when warnings exceed n (`0` valid; negative/absent = no limit). When the threshold fails the run, a one-line verdict is printed to **stderr** for every format, and the text reporter never shows "All clear" beside a failing exit code. Baselined warnings do not count toward the threshold.
  - `--config <path>` loads exactly that config file (TS or JSON), bypassing discovery; a missing file, a directory, or an invalid config exits 2 with a clear message.

- [#58](https://github.com/knktkc/madr-lint/pull/58) [`e6008a8`](https://github.com/knktkc/madr-lint/commit/e6008a8ec76494aa22364f7d262696d52fd59dad) Thanks [@knktkc](https://github.com/knktkc)! - Add `--format github` reporter that emits GitHub Actions workflow commands (`::error` / `::warning`) for PR diff annotations; add `action.yml` composite action and dogfood smoke workflow.

- [#53](https://github.com/knktkc/madr-lint/pull/53) [`be2456e`](https://github.com/knktkc/madr-lint/commit/be2456e6e1fc34c8b295168effe54740210fbcb2) Thanks [@knktkc](https://github.com/knktkc)! - Inline suppression comments ([#23](https://github.com/knktkc/madr-lint/issues/23)). ADR bodies can now silence diagnostics with HTML-comment directives, filtered centrally so rules stay unaware:

  - `<!-- madr-lint-disable-file -->` — suppress everything in the file
  - `<!-- madr-lint-disable -->` … `<!-- madr-lint-enable -->` — suppress a range (or to EOF when left open)
  - `<!-- madr-lint-disable-next-line -->` — suppress the next non-blank line

  Each form takes an optional comma-separated rule-id list (no list = all rules). To make line-scoped suppression work against real rules, `madr/no-broken-links` diagnostics now carry the link's position, and `madr/status-enum` / `madr/date-iso8601` carry the metadata list item's position when the value comes from the MADR v2 list (frontmatter-sourced values stay line-less). `ParsedFile`/`RuleContext` gain `metadataLoc`. `core/internal-error` diagnostics are never suppressible.

  **Breaking (pre-1.0)**: the public `ProjectFile` type gains a required `body` field. Code that constructs `ProjectFile` objects by hand must now populate it — use `buildProjectFile()`, which handles it. Consumers that only read `ProjectFile` values are unaffected.

All notable changes to `madr-lint` are recorded here. Releases are managed via
[changesets](https://github.com/changesets/changesets); each entry below
corresponds to a published npm version.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0 releases (`0.x`) treat minor bumps as potentially breaking.

## 0.1.0

### Minor Changes

- Initial public release of **madr-lint** — the MADR-native linter for the JS/TS ecosystem.

  - MADR **v2 / v3 / v4** aware: reads YAML frontmatter and v2 body-list metadata (bold `- **Status**:` and canonical `* Status:`), or auto-detects per file.
  - **8 rules** with ESLint-style names, `error`/`warn`/`off` severities, and per-rule options validated by a JSON Schema: `required-sections`, `status-enum`, `date-iso8601`, `filename-format`, `no-broken-links`, `no-duplicate-numbering`, `no-numbering-gap`, `supersedes-bidirectional`.
  - **CLI** with `text` / `json` / `sarif` reporters, multi-path input, TypeScript config, picomatch ignore globs, and a per-file content-hash cache.
  - **Programmatic API** (`runRulesOnFile`, `runRulesOnProject`, `parseFile`, …) and a `recommended` preset.
  - Bilingual documentation site (English / 日本語).
