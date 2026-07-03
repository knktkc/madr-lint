---
title: madr/status-enum
description: ADR の status フィールドが許可された値のいずれかであることを検証します。
---

ADR の `status` フィールドが許可された値のいずれかであることを検証します。

このルールは `context.metadata.status` を読み取ります。これは YAML frontmatter に v2 の本文リストメタデータを**マージ**したものです。これにより MADR v2（太字の `- **Status**:` 形式と、素の `* Status:` リスト形式の両方）、v3、v4 をサポートします。競合した場合は frontmatter が優先されます。明示的な null/undefined の frontmatter 値はスキップされるため、v2 の本文リストの値が保持されます。

## チェック内容

- `missingStatus` — マージ後のメタデータに `status` フィールドが見つからない（frontmatter と v2 太字リストの両方を確認）か、値が文字列ではありません。メッセージ: `Metadata does not contain a "status" field (checked frontmatter and v2 bold-list)`。
- `invalidStatus` — `status` は存在するものの、`values` との完全一致でも `prefixValues` との前方一致でもありません。メッセージ: `Status "<status>" is not one of: <allowed>`。`data.status` と `data.allowed`（許可された値に加え、各プレフィックスを `"<prefix> ..."` として表現したもの）を含みます。

比較はデフォルトで大文字小文字を区別しません（`caseSensitive: false`）。前方一致は `superseded by ADR-0042` が `superseded by` プレフィックスにマッチするような、遷移中の状態を扱います。

## 例

### 有効

```markdown
---
status: accepted
date: 2026-05-01
---

# ADR-0001: ...
```

デフォルトで大文字小文字を区別しないため、`status: ACCEPTED` も有効です。前方一致:

```markdown
---
status: superseded by ADR-0042
---
```

MADR v2 の本文リスト形式も読み取られます:

```markdown
# ADR-0001: ...

- **Status**: accepted
- **Date**: 2026-05-01
```

### 無効

```markdown
# ADR-0001: ...
```

`missingStatus` を発行します（メタデータが一切ありません）。

```markdown
---
status: pending
---
```

`invalidStatus` を発行します（`pending` は許可された列挙値に含まれません）。

## オプション

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `values` | `string[]` | `['proposed', 'rejected', 'accepted', 'deprecated']` | 完全一致で許可する status 値。 |
| `prefixValues` | `string[]` | `['superseded by']` | `startsWith` で一致を許可するプレフィックス（例: `superseded by ADR-0042`）。 |
| `caseSensitive` | `boolean` | `false` | `false` の場合、比較は大文字小文字を区別しません。 |

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/status-enum': ['error', {
      values: ['draft', 'review', 'final', 'archived'],
      prefixValues: [],
      caseSensitive: true,
    }],
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 | 備考 |
|---|---|---|
| v2 | はい | メタデータブリッジ経由で、本文リストの `- **Status**: proposed`（太字）または `* Status: proposed`（素） |
| v3 | はい | frontmatter の `status: ...` |
| v4 | はい | frontmatter の `status: ...` |

## 無効化する場合

異なる status 語彙を持つシステムから移行する場合は、`madr/status-enum` を `off` にしてください。ある程度の検証を維持するために、`values` / `prefixValues` を上書きすることを優先してください。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/status-enum/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/status-enum/spec.md>
