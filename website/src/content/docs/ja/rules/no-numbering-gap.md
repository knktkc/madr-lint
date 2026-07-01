---
title: madr/no-numbering-gap
description: "ADR の採番の欠番を検出します（例: 0001 と 0003 は存在するが 0002 が欠落）。"
---

ADR の採番の欠番を検出する、ファイル横断のプロジェクトルールです — `0001-…` と `0003-…` の番号を持つファイルが存在するのに `0002-…` が存在しない場合です。

これは MADR 仕様のルールではなく、**規約のみ**のルールであるため、`recommended` プリセットでは**有効化されません**（デフォルトの重大度は `off`）。MADR は採番が欠番のないことを要求していません。チームが正当な理由で番号を予約したり、下書きの ADR を破棄したり、異なるペースでフォークからマージしたりすることがあります。チームが採番を厳密に連続したシーケンスとして扱う場合にのみ、明示的にオプトインしてください。

このルールは各 ADR 番号（ベース名からの `^(\d{4})-`）をそのファイルにマッピングし、番号をソートして、各欠番を報告します。`NNNN-` プレフィックスのないファイル（例: `template.md`, `README.md`）は無視されます。番号付きファイルが 2 つ未満の場合は何もしません。

## チェック内容

- `numberingGap` — 存在する連続した 2 つの番号の間に欠番があります。メッセージ: `Numbering gap: missing <missing> between ADR-<from> and ADR-<to>`。`data.from`（欠番の前の番号）、`data.to`（後の番号）、`data.missing`（カンマ区切りの欠番）を含みます。診断は `to`（欠番の上側）のファイルに対して発行されます。

## 例

### 有効（欠番なし）

```text
0001-a.md
0002-b.md
0003-c.md
```

### 単一の欠番

```text
0001-a.md
0003-c.md   (0002 is missing)
```

`0003-c.md` に対して診断を 1 件発行します: `data: { from: '0001', to: '0003', missing: '0002' }`。

### 広い欠番

```text
0001-a.md
0005-e.md   (0002, 0003, 0004 missing)
```

`0005-e.md` に対して診断を 1 件発行します: `data.missing: '0002, 0003, 0004'`。連続する各欠番の区間ごとに診断が 1 件生成されます。

## オプション

このルールにはオプションがありません。

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    'madr/no-numbering-gap': 'error', // opt in (default is 'off')
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 |
|---|---|
| v2 | はい |
| v3 | はい |
| v4 | はい |

採番規約は MADR のバージョン間で同一です。

## 無効化する場合

採番ポリシーが枠を予約している場合、下書きが PR の途中で日常的に破棄される場合、または複数のフォークから ADR をマージする場合は、このルールを（デフォルトの）オフのままにしてください。採番が連続したシーケンスでなければならない場合にのみ有効化してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-numbering-gap/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-numbering-gap/spec.md>
