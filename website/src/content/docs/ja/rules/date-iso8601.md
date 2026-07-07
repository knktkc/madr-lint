---
title: madr/date-iso8601
description: ADR の date フィールドが実在する ISO 8601 のカレンダー日付（YYYY-MM-DD）であることを検証します。
---

ADR の `date` フィールドが `YYYY-MM-DD` 形式の有効な ISO 8601 カレンダー日付であることを検証します。

このルールは `context.metadata[field]` を読み取ります。これは YAML frontmatter に v2 の本文リストメタデータを**マージ**したものです（競合時は frontmatter が優先され、明示的な null/undefined の frontmatter 値はスキップされます）。したがって MADR v2（太字の `- **Date**:` および素の `* Date:` リスト項目）、v3、v4 をサポートします。

`gray-matter` はクォートされていない `date: 2026-05-01` を JavaScript の `Date` にパースします。このルールは `Date` を `toISOString().slice(0, 10)` によって正規化し、`string` はそのまま保持し、それ以外（null, boolean, number）は欠落として扱います。検証には `Date.UTC` のラウンドトリップを使用するため、外部ライブラリなしでうるう年や月の日数が正しく扱われます。

## チェック内容

- `missingDate` — 設定されたフィールドが存在しない、またはその値が文字列 / `Date` ではありません。メッセージ: `Metadata does not contain a "<field>" field (checked frontmatter and v2 bold-list)`。`data.field` を含みます。
- `invalidDate` — 値は存在するものの、実在する `YYYY-MM-DD` 日付ではありません: 形式が不正（`2026-5-1`, `26-05-01`, `today`）か、存在しないカレンダー日付（`2026-13-01`, `2026-02-31`, `2025-02-29`）です。メッセージ: `Date "<date>" is not a valid ISO 8601 calendar date (YYYY-MM-DD)`。`data.date` を含みます。

## 例

### 有効

```markdown
---
date: 2026-05-01
---
```

うるう年の日付（YAML が文字列のまま保持するようクォート）:

```markdown
---
date: '2024-02-29'
---
```

### 無効

| Frontmatter | 診断 | 理由 |
|---|---|---|
| (`date` なし) | `missingDate` | フィールドが存在しない |
| `date: 2026-13-01` | `invalidDate` | 13 月は存在しない |
| `date: 2026-02-31` | `invalidDate` | 2 月に 31 日は存在しない |
| `date: 2025-02-29` | `invalidDate` | 2025 年はうるう年ではない |
| `date: '2026-5-1'` | `invalidDate` | 月/日がゼロ埋めされていない |
| `date: '26-05-01'` | `invalidDate` | 2 桁の年 |
| `date: 'today'` | `invalidDate` | 日付文字列ではない |

## 🔧 自動修正

このルールは **自動修正可能**（`madr-lint --fix`）ですが、対象は正確なソースオフセットを持つ **v2 本文リスト**の日付のみです。frontmatter の日付は書き換えません（YAML を意識した編集は対象外）。また、**曖昧さのない**形式だけを正規化します。それ以外は報告のみの診断として残します。

修正される（`YYYY-MM-DD` に正規化）:

| 修正前 | 修正後 | 形式 |
|---|---|---|
| `- Date: 2026/7/3` | `- Date: 2026-07-03` | 年先頭の数値（`/`, `.`, `-` の単一区切り） |
| `- Date: 3 Jul 2026` | `- Date: 2026-07-03` | 日先頭の英語月名 |
| `- Date: July 3, 2026` | `- Date: 2026-07-03` | 月先頭の英語月名 |

修正され**ない**（報告のみ、決して書き換えない）:

- **日/月の順序が曖昧** — `03/07/2026` は 7 月 3 日とも 3 月 7 日とも取れるため、安全な選択がなく決して触れません。
- **2 桁の年** — `26/07/03`。
- **存在しないカレンダー日付** — `2026/2/30`, `2026/13/01`。不正な日付を*別の*有効な日付に変えることはしません。
- **英語以外／未知の月名** — `3 Mai 2026`。
- **frontmatter 由来の値** — YAML frontmatter 内の `date:`（手動で ISO 値に修正してください）。

## オプション

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `field` | `string` | `'date'` | 読み取るメタデータキー（frontmatter または v2 本文リスト、キーの正規化あり）。`created` や `updated` などを使用するプロジェクトでは上書きします。 |

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/date-iso8601': ['error', { field: 'created' }],
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 | 備考 |
|---|---|---|
| v2 | はい | メタデータブリッジ経由で、本文リストの `- **Date**: 2026-05-01` |
| v3 | はい | frontmatter の `date: ...` |
| v4 | はい | frontmatter の `date: ...` |

## 無効化する場合

異なる日付形式を使用するシステムから移行する場合は、`madr/date-iso8601` を `off` にしてください。カスタムのメタデータキーを読み取るには、`field` を上書きすることを優先してください。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/date-iso8601/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/date-iso8601/spec.md>
