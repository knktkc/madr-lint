---
"madr-lint": minor
---

Report unknown top-level keys in the config, and configs that are not an object (#222). madr-lint read the keys it knows from whatever the config file yielded and ignored the rest. A misspelled key (`rule`, `adrdir`) had no effect. Neither did a config in a named export: with `export const config = {...}` and no default export, the module's exports were read as the config, and `config` is not a key madr-lint reads. A discovered config like that linted with the recommended rules instead of its own; with `--config`, no rule ran and the CLI exited 0. Both are now a config error (exit 2), on discovered config files and on `--config` alike, for every config file format.

The error names the key and suggests a known key when one is close (ignoring case). Otherwise it lists the known keys. When a TypeScript or JavaScript config has no default export and has an unknown key, the error also says to export the config as the default. A CommonJS config with an unknown key always gets this hint, because `module.exports = {...}` and `exports.config = ...` look the same at runtime. For the named-export config above:

```text
Unknown key "config" in the config. Known keys: "extends", "madrVersion", "adrDir", "rules", "ignorePatterns", "cache", "cacheLocation".
The config file has no default export, so its exports were read as the config. If the config is a named export, make it the default: `export default config` (ESM) or `module.exports = config` (CommonJS).
```

With `--config`, the message starts with `Failed to load config "<path>": `. Unknown keys are listed first, in the same error as the unknown rule IDs and `extends` entries from #206. Keys such as `$schema` are unknown keys too. A config that is not an object is reported as, for example, `The config must be an object, not a function.`

These keep working: `export default {...}`, `export default defineConfig({...})`, `module.exports = {...}`, named exports that are all known keys (`export const rules = {...}`), the config `madr-lint init` writes, and running without a config file.

What changes in your results:

- A config with a top-level key madr-lint does not read now exits 2 instead of ignoring the key. Fix the name the message points to, or remove the key.
- A JS/TS config that holds the config object in a named export (`export const config = {...}` or `exports.config = {...}`) now exits 2. Export the object as the default: `export default config` or `module.exports = config`.
- A config that is not an object now exits 2. This includes `export default () => ({...})`, `export default undefined` (also when named exports sit next to it, which used to be read instead), `export default null`, and a JSON file that holds `[]` or a string. `module.exports = null`, `module.exports = undefined`, and a JSON file that holds `null` used to crash with a `TypeError` (exit 1; with `--config`, exit 2 with the `TypeError` text) and now get this message.
- A config module without a default export that mixes known named exports with other exports (`export const rules = {...}` next to `export const helper = ...`) now exits 2, because the other exports are read as unknown keys. Move the config into a default export.
