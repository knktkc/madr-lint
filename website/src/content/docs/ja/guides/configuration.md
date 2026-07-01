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

設定ファイルが**見つからず**、かつルールを何も設定していない場合、CLI は
`madr-lint:recommended` プリセットにフォールバックするので、設定ゼロでも役に立ちます。

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
| `extends` | `string[]` | `[]` | 継承するプリセット。現在は `'madr-lint:recommended'`。 |
| `madrVersion` | `'v2' \| 'v3' \| 'v4' \| 'auto'` | `'auto'` | 対象の MADR バージョン。`auto` はファイルごとに検出します。 |
| `adrDir` | `string` | `'docs/adr'` | CLI でパスを渡さなかったときに lint されるディレクトリ。 |
| `rules` | `Record<string, RuleSeverity>` | `{}` | ルールごとの重大度とオプション（後述）。 |
| `ignorePatterns` | `string[]` | `[]` | スキップするパス（[Ignore パターン](#ignore-パターン) を参照）。 |
| `cache` | `boolean` | `true` | ファイル単位のコンテンツハッシュキャッシュを有効にします。 |
| `cacheLocation` | `string` | `'.madr-lint/cache'` | キャッシュマニフェストのディレクトリ。 |

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

`madrVersion` は、ルールがどの MADR 仕様に対して検証を行うかを選択します。

- **`auto`**（デフォルト） — ファイルごとに検出します（frontmatter ⇒ v3/v4、本文リスト ⇒ v2）。
- **`v2`** — メタデータは本文リスト（`* Status:` / `- **Status**:`）です。
- **`v3` / `v4`** — メタデータは YAML frontmatter です。

`madr/status-enum` や `madr/date-iso8601` のようなメタデータを読むルールは、YAML frontmatter
**と** v2 の本文リストメタデータを統合したビューを読むため、バージョンをまたいで機能します。

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
[CLI リファレンス](/ja/guides/cli/) を参照してください。
