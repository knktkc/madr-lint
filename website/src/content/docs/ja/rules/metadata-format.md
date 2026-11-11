---
title: madr/metadata-format
description: ADR のメタデータが、madrVersion の読み取る形式で書かれていることを強制します。
---

設定した [`madrVersion`](/ja/guides/configuration/#madr-バージョン) が読み取らない形式でメタデータが書かれている ADR を報告します。

`madrVersion` は、メタデータの読み取り元を決めます。`v2` はタイトルの下の箇条書き（`* Status: accepted`）を読み、`v3`/`v4` は YAML の frontmatter を読みます。もう一方の形式で書かれたメタデータは読まれないため、その項目（status、date など）は何も報告されないまま検査から外れます。このルールは、その状態を報告します。

`madrVersion: 'auto'`（デフォルト）では、ファイルごとに形式から版を判定するため、このルールは報告しません。

## チェック内容

- `expectedFrontmatter` — `madrVersion` が `v3` または `v4` で、ファイルにタイトルの下のメタデータの箇条書きがあり、frontmatter がありません。
- `expectedList` — `madrVersion` が `v2` で、ファイルに frontmatter があります。

どちらもファイル単位の診断で、`data.version` には設定した版が入ります。メタデータがないファイルは有効です。MADR のテンプレートでは、メタデータの項目はすべて省略可です。

## 例

### 有効

`madrVersion: 'v4'` の場合:

```markdown
---
status: accepted
date: 2026-11-11
---

# Use PostgreSQL
```

`madrVersion: 'v2'` の場合:

```markdown
# Use PostgreSQL

* Status: accepted
* Date: 2026-11-11
```

### 無効

`madrVersion: 'v4'` の場合:

```markdown
# Use PostgreSQL

* Status: accepted
* Date: 2026-11-11
```

診断を 1 件発行します: `Metadata is written as a body list, but madrVersion "v4" reads YAML frontmatter`。

## オプション

ありません。

## MADR バージョン互換性

| バージョン | 適用 |
|---|---|
| v2 | はい |
| v3 | はい |
| v4 | はい |

v2 のテンプレート（[2.1.2](https://github.com/adr/madr/blob/2.1.2/template/template.md)）は、メタデータをタイトルの下の箇条書きに書きます。v3（[3.0.0](https://github.com/adr/madr/blob/3.0.0/template/adr-template.md)）と v4（[4.0.0](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md)）のテンプレートは YAML の frontmatter を使います。

## 無効化する場合

無効化せずに、食い違いを直してください。メタデータを `madrVersion` が読み取る形式に移すか、形式が混在するリポジトリでは `madrVersion` を `'auto'` にします。無効化すると、食い違ったファイルのメタデータは検査されないままになります。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/metadata-format/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/metadata-format/spec.md>
