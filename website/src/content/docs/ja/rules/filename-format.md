---
title: madr/filename-format
description: ADR のファイル名規約 NNNN-kebab-case-title.md を強制します。
---

ADR のファイル名規約 `NNNN-kebab-case-title.md` を強制します。

このルールはファイルのベース名を設定可能な正規表現でテストします。デフォルトのパターンは `^[0-9]{4}-[a-z0-9-]+\.md$` で、以下を要求します:

- `NNNN` — 正確に 4 桁の 10 進数、ゼロ埋め
- 単一のハイフン
- 1 文字以上の小文字 ASCII 英字、数字、またはハイフン（kebab-case）
- `.md` 拡張子

このパターンは使用前に ReDoS 安全性ガード（`assertSafeRegex`）を通してコンパイルされます。デフォルトは一部の MADR の例よりも意図的に厳格です（大文字、アンダースコア、`.md` 以外の拡張子を禁止します）。`pattern` オプションで緩和できます。

## チェック内容

- `invalidFilename` — ベース名が設定された `pattern` にマッチしません。メッセージ: `Filename "<filename>" does not match expected pattern "<expected>"`。`data.filename` と `data.expected` を含みます。これはファイルレベルの診断です（ソースの行/列はありません）。

## 例

### 有効

```text
0001-mise.md
9999-multi-word-kebab-title.md
0042-numbers-in-name.md
```

### 無効

```text
1-too-short.md         (number not zero-padded to 4 digits)
0001_underscore.md     (underscore separator instead of hyphen)
0001-Title-Case.md     (uppercase letters in slug)
not-numbered.md        (no leading 4-digit prefix)
0001nohyphen.md        (missing hyphen after the number)
0001-trailing-dot..md  (double dot before .md)
0001-test.markdown     (wrong extension, must be .md)
0001-.md               (empty slug)
```

## オプション

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `pattern` | `string` | `^[0-9]{4}-[a-z0-9-]+\.md$` | ベース名がマッチしなければならない正規表現（文字列として）。緩和または厳格化するために上書きします。 |

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/filename-format': ['error', {
      pattern: '^[0-9]{4}-.+\\.md$', // looser: any characters in the slug
    }],
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 |
|---|---|
| v2 | はい |
| v3 | はい |
| v4 | はい |

ファイル名規約は MADR のバージョン間で同一です。

## 無効化する場合

`madr/filename-format` を `off` にするのは、異なる規約を使用する既存の ADR コレクションを移行する場合のみにしてください。ある程度の検証を維持するために、`pattern` を上書きすることを優先してください。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/filename-format/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/filename-format/spec.md>
