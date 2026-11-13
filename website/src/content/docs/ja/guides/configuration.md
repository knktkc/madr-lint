---
title: 設定
description: 設定ファイルで madr-lint を構成する — プリセット、MADR バージョン、adrDir、ignore パターン、キャッシュ、ルールごとの重大度とオプション。
---

`madr-lint` はプロジェクトのルートに置いた設定ファイルで構成します。TypeScript の
設定（`madr-lint.config.ts`）が正規の形式で、JSON はフォールバックとしてサポートされます。

## 設定ファイルの解決

CLI は次の順序で、最初に存在するファイルを探します。

```
.madrlintrc.json
.madrlintrc.ts
.madrlintrc.mts
.madrlintrc.js
.madrlintrc.mjs
.madrlintrc.cjs
madr-lint.config.ts
madr-lint.config.mts
madr-lint.config.js
madr-lint.config.mjs
madr-lint.config.cjs
```

`.json` は直接パースされ、それ以外の拡張子はすべて
[`jiti`](https://github.com/unjs/jiti) を通じて読み込まれるため、TypeScript も
両方のモジュールシステムもビルドステップなしで動作します。

TypeScript / JavaScript の設定ファイルは、設定オブジェクトをデフォルトエクスポートにします
（`export default {...}` または `module.exports = {...}`）。デフォルトエクスポートがない
モジュールは、エクスポート全体が設定として読まれます。そのため `export const rules = {...}`
は `rules` を設定しますが、`export const config = {...}` は未知のキーになります
（[未知の名前](#未知の名前)を参照）。

> **設定ファイルはコードです。** TypeScript/JavaScript の設定ファイルは読み込み時に
> **実行**されます — ESLint の設定と同じ信頼モデルです。`--config` で指定するパスや
> 設定ファイルは、信頼できるソースのものだけを使用してください。

ルールを何も設定せず、`--config` も指定しない場合、CLI は
`madr-lint:recommended` プリセットのルールにフォールバックするので、設定ゼロでも役に立ちます。
見つかった設定ファイルの `adrDir` などのほかの設定は、そのまま適用されます。

## `defineConfig`

型安全な補完のために `defineConfig` ヘルパーを使用します。これは実行時には恒等関数です。

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  madrVersion: 'auto',
  adrDir: 'docs/adr',
  ignorePatterns: ['README.md', 'template.md'],
  rules: {
    'madr/required-sections': 'error',
    'madr/filename-format': ['error', { pattern: '^[0-9]{4}-.+\\.md$' }],
    'madr/no-numbering-gap': 'off',
  },
});
```

JSON での同等の記述（`.madrlintrc.json`）:

```json
{
  "extends": ["madr-lint:recommended"],
  "madrVersion": "auto",
  "adrDir": "docs/adr",
  "ignorePatterns": ["README.md", "template.md"],
  "rules": {
    "madr/required-sections": "error",
    "madr/filename-format": ["error", { "pattern": "^[0-9]{4}-.+\\.md$" }],
    "madr/no-numbering-gap": "off"
  }
}
```

## トップレベルのオプション

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `extends` | `string[]` | `[]` | 継承するプリセット。現在は `'madr-lint:recommended'`。未知の名前は設定エラーです（[未知の名前](#未知の名前)を参照）。 |
| `madrVersion` | `'v2' \| 'v3' \| 'v4' \| 'auto'` | `'auto'` | 対象の MADR バージョン。メタデータの読み取り元を決めます（[MADR バージョン](#madr-バージョン) を参照）。`auto` はファイルごとに検出します。 |
| `adrDir` | `string` | `'docs/adr'` | CLI でパスを渡さなかったときに lint されるディレクトリ。 |
| `rules` | `Record<string, RuleSeverity>` | `{}` | ルールごとの重大度とオプション（後述）。 |
| `ignorePatterns` | `string[]` | `[]` | スキップするパス（[Ignore パターン](#ignore-パターン) を参照）。 |
| `cache` | `boolean` | `true` | ファイル単位のコンテンツハッシュキャッシュを有効にします。 |
| `cacheLocation` | `string` | `'.madr-lint/cache'` | キャッシュマニフェストのディレクトリ。 |

設定はオブジェクトである必要があり、上記以外のトップレベルキーは設定エラーです
（[未知の名前](#未知の名前)を参照）。

## ルールの設定

`rules` の各エントリは、ルール名を**重大度の文字列**または `[severity, options]` の
**タプル**のいずれかに対応づけます。

```typescript
rules: {
  // severity only — uses the rule's default options
  'madr/status-enum': 'error',

  // turn a rule off
  'madr/no-numbering-gap': 'off',

  // severity + options
  'madr/filename-format': ['error', { pattern: '^ADR-[0-9]+\\.md$' }],
}
```

重大度は `'error'`、`'warn'`、`'off'` のいずれかです。

- **`error`** — 報告され、CLI が終了コード `1` で終了する原因になります。
- **`warn`** — 報告されますが、実行を失敗させません。
- **`off`** — ルールは実行されません。

タプル内のオプションはルールの `defaultOptions` にマージされ、ルールの JSON Schema に対して
検証されます。**無効なオプションは即座に失敗**し、明確なメッセージと終了コード `2` を返します。

```text
Invalid rule options in config: Invalid options for rule madr/filename-format: data/pattern must be string
```

### 未知の名前

[上の表](#トップレベルのオプション)にないトップレベルキー、`rules` に書いた madr-lint が
知らないルール名、`extends` に書いたプリセットではない値も、終了コード `2` で失敗します。
`'off'` を指定したルールや、`$schema` のようなキーも対象です。継承した列挙可能なキー
（`Object.create({...})`）も、自身のキーと同じく扱います。ただし、依存パッケージが
`Object.prototype` に追加した列挙可能なプロパティは数えません。近い既知の名前がある場合、
メッセージはその名前を提案します。ない場合は、既知のキーやプリセットを列挙するか、
[ルールリファレンス](/ja/rules/)へのリンクを示します。設定内の問題はすべてまとめて表示されます。

```text
Invalid config (2 problems):
  - Unknown preset "madr-lint:recomended" in extends. Did you mean "madr-lint:recommended"?
  - Unknown rule "madr/status-enmu" in rules. Did you mean "madr/status-enum"?
```

トップレベルキーの綴りの誤りも同じ形式で報告されます。

```text
Invalid config (2 problems):
  - Unknown key "adrdir" in the config. Did you mean "adrDir"?
  - Unknown key "rule" in the config. Did you mean "rules"?
```

TypeScript / JavaScript の設定ファイルにデフォルトエクスポートがない場合、メッセージの最後に
1 行追加されることがあります。未知のエクスポートの中に設定のように見えるもの（値が既知の
設定キーを持つオブジェクト）があれば、その名前を示し、デフォルトエクスポートにするよう案内します。
`export const config = { rules: {...} }` の場合は次のとおりです。

```text
Unknown key "config" in the config. Known keys: "extends", "madrVersion", "adrDir", "rules", "ignorePatterns", "cache", "cacheLocation".
The export "config" looks like a config. Export it as the default: `export default config` (ESM) or `module.exports = config` (CommonJS).
```

設定のように見えるエクスポートがない場合、ESM 構文で書かれたモジュールには代わりに次の行が
表示されます。

```text
The config file has no default export, so its exports were read as the config.
```

プレーンな CommonJS の `module.exports = {...}` は、そのオブジェクトがデフォルトエクスポートです。
そのため、`module.exports = { config: { rules: {...} } }` のように設定のように見えるキーがない限り、
追加の行は表示されません。JSON の設定ファイルと、デフォルトエクスポートがあるモジュールには、
どちらの行も表示されません。

TypeScript / JavaScript の設定ファイルでは、モジュールの相互運用で付くキーを設定キーとして扱いません。
対象は `__esModule` と、設定自身を指す `default` キー（`module.exports = config; module.exports.default = config`）
です。そのようなモジュールを設定にスプレッドした場合（`export default { ...base }`）のように、自分自身を
`default` に持つオブジェクトを指す `default` キーも対象です。JSON の設定ファイルでは、どちらも未知のキーです。

オブジェクトではない設定も、終了コード `2` で失敗します。関数（`export default () => ({...})`。
静的フィールドを持つクラスのように設定のプロパティを持つ関数も含みます）、
`undefined`（`export default undefined`）、`null`、配列、文字列や数値が対象です。

```text
The config must be an object, not a function.
```

非同期の設定（`export default (async () => ({...}))()` のように Promise を設定にしたもの）は
サポートしていません。

```text
The config must be an object, not a Promise. Async configs are not supported: export the config object itself.
```

`--config` を指定した場合、メッセージの先頭に `Failed to load config "<path>": ` が付きます。

`core/internal-error` など `core/` で始まるルール ID は madr-lint 自身の診断用に予約されて
おり、設定できません。

各ルールが受け付けるオプションについては [ルールリファレンス](/ja/rules/) を参照してください。

## プリセット

### `madr-lint:recommended`

仕様に基づいたルールを妥当な重大度で有効にします。これを継承し、必要に応じて個々の
ルールを上書きしてください。

| ルール | 推奨重大度 |
|---|---|
| `madr/required-sections` | `error` |
| `madr/status-enum` | `error` |
| `madr/date-iso8601` | `error` |
| `madr/filename-format` | `error` |
| `madr/metadata-format` | `error` |
| `madr/no-broken-links` | `error` |
| `madr/no-duplicate-numbering` | `error` |
| `madr/supersedes-bidirectional` | `error` |
| `madr/no-numbering-gap` | `off`（規約のみ — オプトイン） |

あなたの `rules` エントリはプリセットに**上書きする形で**マージされるため、変更したい
ものだけを列挙すれば十分です。

```typescript
export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    // adopt the numbering-gap convention
    'madr/no-numbering-gap': 'warn',
  },
});
```

## MADR バージョン

`madrVersion` は、ルールがどの MADR 仕様に対して検証を行うかを選択します。決まるのは、メタデータの読み取り元と、実行するルールの2つです。

| `madrVersion` | メタデータの読み取り元 | 各ファイルの版 |
|---|---|---|
| `auto`（デフォルト） | YAML frontmatter **と**本文リストを統合（重複時は frontmatter を優先） | 判定: `decision-makers` を含む frontmatter ⇒ v4、その他の MADR の項目を含む frontmatter ⇒ v3、本文リスト ⇒ v2 |
| `v2` | タイトルの下の本文リストのみ（`* Status:` / `- **Status**:`） | v2 |
| `v3` / `v4` | YAML frontmatter のみ | v3 / v4 |

`madr/status-enum` や `madr/date-iso8601` のようなメタデータを読むルールは、選択された読み取り元を読みます。`v3` または `v4` では本文リストに書いた status と date は読まれないため、`madr/status-enum` と `madr/date-iso8601` はそれらがないと報告します。`v2` では frontmatter は読まれません。設定した版が読み取らない形式でメタデータを書いたファイルは、[`madr/metadata-format`](/ja/rules/metadata-format/) が報告します。

ルールは、対応する版でだけ実行されます。`madr/supersedes-bidirectional` は v3 と v4 に対応するため、`madrVersion: 'v2'` では実行されません。`auto` では、ファイル単位のルールは対応外の版と判定したファイルを飛ばします。ファイル間のルールは、ファイル間の参照が欠けないよう、すべてのファイルを対象にします。メタデータがないファイルは版を判定できないため、すべてのルールを実行します。

形式が混在するリポジトリでは `auto` を使ってください。すべての ADR を1つの形式にそろえる場合は、版を固定します。

### JavaScript frontmatter

`---js` と `---javascript` のブロックはデータとして読み取り、実行しません。ブロックには、
文字列、数値、真偽値、`null`、配列、オブジェクトだけからなる静的なオブジェクトリテラルを
書きます。コメント、引用符なしのキー、末尾のカンマも使えます。

```markdown
---js
{
  status: 'accepted', // アーキテクチャ会議で確認済み
  date: '2026-11-04',
}
---
```

関数呼び出し、変数、式、テンプレートリテラル、ゲッター、メソッド、スプレッド構文、
計算プロパティ名があると、エラーで検査が止まります。これらの値は、固定値にして
YAML frontmatter へ移してください。

## Ignore パターン

`ignorePatterns` はパスによってファイルをスキップします。パターンは
[picomatch](https://github.com/micromatch/picomatch) でマッチングされるため、
一般的な形式がすべて利用できます:

- 完全一致のベース名 — `README.md`
- プロジェクト相対のフルパス — `docs/adr/template.md`
- パスの末尾 — `adr/template.md`
- 末尾のワイルドカード — `9999-*`
- フルグロブ — `docs/**/draft-*.md`

```typescript
export default defineConfig({
  ignorePatterns: ['README.md', 'template.md', '9999-*', 'docs/**/draft-*.md'],
});
```

## キャッシュ

ファイル単位のコンテンツハッシュキャッシュにより再実行が高速化されます。ファイルの内容を
キーとし、パッケージのバージョンや解決済み設定が変わると無効化されます。ファイル間
（プロジェクト）のルールは常に再実行されます。

```typescript
export default defineConfig({
  cache: true, // default
  cacheLocation: '.madr-lint/cache',
});
```

CLI では `--no-cache` で無効化したり、`--cache-dir` で別の場所を指定したりできます。
作業ディレクトリの外を指す `cacheLocation` は、警告を出して無視します。外の場所を指定できるのは `--cache-dir` だけです。
[CLI リファレンス](/ja/guides/cli/) を参照してください。
