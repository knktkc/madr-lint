---
title: madr/required-sections
description: すべての ADR が必須の見出しセクションを含んでいることを強制します。
---

ADR の Markdown ファイルが `sections` オプションに列挙されたすべての見出しを含んでいることを強制します。

このルールは Markdown AST を走査し、すべての見出しのテキストを収集し（レベルは問わず、`mdast-util-to-string` によってインラインの装飾は除去されるため、`## **Status**` は `Status` にマッチします）、存在しない必須見出しごとに診断を 1 件報告します。

## チェック内容

- `missingSection` — 必須の見出しがファイルの見出しの中に見つかりません。欠落しているセクションごとに診断が 1 件発行されます。メッセージは `Missing required section: "<section>"` です。診断には `data.section`（欠落している見出し）と `data.found`（ファイル内で確認されたすべての見出しテキスト、デバッグ用）が含まれます。これはファイルレベルの診断であり、指し示すノードはありません。

見出しのマッチングは `matchMode` によって制御されます。`exact` はトリム済みの見出し全体が必須テキストと一致することを要求します。`startsWith` は必須テキストで始まる任意の見出しにマッチします（例: `Decision Outcome` は `Decision Outcome (Architectural)` にマッチします）。

## 例

### 有効

デフォルトの 3 つの必須セクションを含むファイル:

```markdown
# ADR-0001: Use mise for runtime management

## Context and Problem Statement
...

## Considered Options
* ...

## Decision Outcome
Adopted: ...
```

### 無効

```markdown
# ADR-0001: Missing context

## Considered Options
* ...

## Decision Outcome
...
```

診断を 1 件発行します: `Missing required section: "Context and Problem Statement"`。

## オプション

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `sections` | `string[]` | `['Context and Problem Statement', 'Considered Options', 'Decision Outcome']` | 必須の見出しテキスト。順序は問いません。 |
| `matchMode` | `'exact' \| 'startsWith'` | `'exact'` | 各必須エントリを見出しと比較する方法。`startsWith` にすると `Decision Outcome (Architectural)` が `Decision Outcome` を満たします。 |

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/required-sections': ['error', {
      sections: ['Context', 'Decision', 'Consequences'],
      matchMode: 'startsWith',
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

デフォルトのセクションは、MADR のテンプレートで省略可とされていない見出しです（[v2 (2.1.2)](https://github.com/adr/madr/blob/2.1.2/template/template.md), [v3 (3.0.0)](https://github.com/adr/madr/blob/3.0.0/template/adr-template.md), [v4 (4.0.0)](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md)）。3 つのバージョンで同じため、v2/v3/v4 のどれにも同じデフォルトが適用されます。

`Consequences` はデフォルトに含まれません。v3/v4 では省略可で、v2 のテンプレートには代わりに `Positive Consequences` と `Negative Consequences`（どちらも省略可）があります。必須にする場合は、`sections` に追加してください。

## 無効化する場合

`madr/required-sections` を `off` にするのは、異なるセクション名を使用する ADR コレクションを移行する場合のみにしてください。ある程度の検証を維持するために、`sections` を上書きする（かつ／または `startsWith` に切り替える）ことを優先してください。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/required-sections/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/required-sections/spec.md>
