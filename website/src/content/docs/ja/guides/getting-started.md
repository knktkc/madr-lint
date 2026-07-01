---
title: はじめる
description: madr-lint をインストールし、最初の lint を実行して、プロジェクトに組み込む方法を説明します。
---

`madr-lint` は [MADR](https://adr.github.io/madr/)（Markdown
Architectural Decision Records）向けのリンターです。ADR の構造、ステータス値、
日付、ファイル名、そしてファイル間の整合性を検証します。

## インストール

開発依存としてインストールします。

```bash
# npm
npm install --save-dev madr-lint

# pnpm
pnpm add -D madr-lint

# yarn
yarn add -D madr-lint
```

**Node.js 22 以降**が必要です。

インストールせずに実行することもできます。

```bash
npx madr-lint --help
```

## 最初の lint を実行する

デフォルトでは、`madr-lint` は `adrDir` として設定されたディレクトリ
（デフォルト: `docs/adr`）を lint します。

```bash
npx madr-lint
```

または、明示的にファイルやディレクトリを指定することもできます。ディレクトリは
`.md` ファイルを再帰的に検索します。

```bash
npx madr-lint docs/adr docs/decisions/0007-use-x.md
```

出力例:

```text
docs/adr/0003-use-postgres.md
  error  madr/status-enum        Status "decided" is not one of: proposed,rejected,accepted,deprecated,superseded by ...
  error  madr/required-sections  Missing required section: "Consequences"

2 errors
```

## 推奨ルールを有効にする

初期状態では、ルールが設定されていない場合、CLI は `madr-lint:recommended`
プリセットにフォールバックします。これを明示的にする（そしてカスタマイズを始める）
には、設定ファイルを作成します。

```typescript
// madr-lint.config.ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  extends: ['madr-lint:recommended'],
  adrDir: 'docs/adr',
});
```

すべてのオプションについては [設定](/ja/guides/configuration/) を、ルールの完全な
リファレンスについては [ルール](/ja/rules/) を参照してください。

## 終了コード

`madr-lint` は CI に適しています。

| 終了コード | 意味 |
|---|---|
| `0` | エラーなし（警告は出力される場合があります） |
| `1` | 1 件以上の `error` 重大度の診断 |
| `2` | 設定の問題（例: 無効なルールオプション、未知の `--format`） |

## 次のステップ

- [設定](/ja/guides/configuration/) — 設定ファイル、プリセット、ルールごとのオプション
- [CLI](/ja/guides/cli/) — すべてのコマンドラインフラグ
- [GitHub Action](/ja/guides/github-action/) — CI での実行
- [ルール](/ja/rules/) — 各ルールがチェックする内容とそのオプション
