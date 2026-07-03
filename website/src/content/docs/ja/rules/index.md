---
title: ルール
description: madr-lint の組み込みルール — 各ルールが何をチェックするか、ファイル単位かファイル間か、そのオプション、推奨重大度。
---

すべてのルールは ESLint 風の名前（`madr/<kebab-case>`）を持ち、`error` / `warn` / `off` の
重大度をサポートします。ルールは**ファイル単位**（1 つの ADR に対する純粋なチェック）か、
**プロジェクト**（ファイル間の整合性）のいずれかです。重大度とオプションは
[設定ファイル](/ja/guides/configuration/) で構成します。正当な例外が 1 件だけなら
設定を変える必要はありません — [抑制コメント](/ja/guides/suppressing-rules/) で
インラインに抑制できます。

## ファイル単位のルール

| ルール | チェック内容 | オプション | 推奨 |
|---|---|---|---|
| [`madr/required-sections`](/ja/rules/required-sections/) | 必須の見出しセクションが存在すること | あり | `error` |
| [`madr/status-enum`](/ja/rules/status-enum/) | `status` が許可された値のいずれかであること | あり | `error` |
| [`madr/date-iso8601`](/ja/rules/date-iso8601/) | `date` が有効な ISO-8601 の日付であること | あり | `error` |
| [`madr/filename-format`](/ja/rules/filename-format/) | ファイル名が ADR の規約に一致すること | あり | `error` |

## プロジェクト（ファイル間）のルール

| ルール | チェック内容 | オプション | 推奨 |
|---|---|---|---|
| [`madr/no-broken-links`](/ja/rules/no-broken-links/) | 相対リンクが既存のファイルに解決されること | なし | `error` |
| [`madr/no-duplicate-numbering`](/ja/rules/no-duplicate-numbering/) | ADR 番号が一意であること | なし | `error` |
| [`madr/no-numbering-gap`](/ja/rules/no-numbering-gap/) | ADR 番号が連続していること（欠番なし） | なし | `off` |
| [`madr/supersedes-bidirectional`](/ja/rules/supersedes-bidirectional/) | `supersedes` / `superseded-by` のリンクが一致すること | なし | `error` |

`madr/no-numbering-gap` は規約のみのルールで、推奨プリセットでは `off` になっています。
チームが ADR の番号付けを連続した並びとして扱う場合に有効化してください。

## 重大度とオプションのおさらい

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  rules: {
    'madr/status-enum': 'warn',
    'madr/required-sections': ['error', { sections: ['Context', 'Decision', 'Consequences'] }],
    'madr/no-numbering-gap': 'off',
  },
});
```

各ルールの正確なオプションについては個別のページを、重大度とオプションの形式については
[設定](/ja/guides/configuration/) を参照してください。
