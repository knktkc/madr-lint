---
title: madr/no-duplicate-numbering
description: 2 つの ADR が同じ NNNN- 番号プレフィックスを共有してはなりません。
---

2 つ以上の ADR がベース名に同じ `NNNN-` 番号プレフィックスを共有している場合に報告する、ファイル横断のプロジェクトルールです。

ランナーはすべての ADR ファイルを一度だけ事前パースし、それらすべてを 1 回の `check()` 呼び出しでルールに渡します。ルールは各ベース名から先頭の 4 桁（`^(\d{4})-`）を読み取り、番号でファイルをグループ化し、重複グループの**すべての**メンバーに対して診断を発行します。これにより、レビュアーは 1 つだけでなく、影響を受ける各ファイルの出力で競合を確認できます。

## チェック内容

- `duplicateNumber` — 2 つ以上のファイルが同じ `NNNN` プレフィックスに解決されます。メッセージ: `ADR number <number> is used by multiple files: <paths>`。`data.number` と `data.paths`（競合するパス、カンマ区切り）を含みます。グループ内のファイルごとに診断が 1 件発行されます。

ベース名が `NNNN-` で始まらないファイル（例: `template.md`, `README.md`, ハイフンのない `0001invalid.md`）は暗黙的に無視されます — それらは `madr/filename-format` が担当します。

## 例

### 有効

```text
docs/adr/
  0001-mise.md
  0002-aube.md
  0003-oxc.md
```

診断なし。

### 無効

```text
docs/adr/
  0001-foo.md
  0001-bar.md
```

診断を 2 件発行します（ファイルごとに 1 件）。いずれも `data.number: '0001'` と `data.paths: '0001-foo.md, 0001-bar.md'` を伴う `duplicateNumber` です。

```text
docs/adr/
  0001-a.md
  0001-b.md
  0001-c.md
  0002-x.md
  0002-y.md
```

診断を 5 件発行します: `0001` に 3 件、`0002` に 2 件。

## オプション

このルールにはオプションがありません。

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/no-duplicate-numbering': 'error',
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 |
|---|---|
| v2 | はい |
| v3 | はい |
| v4 | はい |

ファイル名の採番規約は MADR のバージョン間で同一です。

## 無効化する場合

このルールを無効化する理由は基本的にありません。2 つの ADR が番号を共有している場合、定義上どちらか一方が誤っています。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-duplicate-numbering/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-duplicate-numbering/spec.md>
