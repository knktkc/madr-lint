---
title: CLI
description: madr-lint のコマンドラインインターフェース — 引数、フラグ、レポーター、終了コード。
---

```bash
madr-lint [OPTIONS] [PATHS...]
```

## 引数

### `PATHS`

lint する 1 つ以上のファイルまたはディレクトリです。ディレクトリは `.md` ファイルを
再帰的に検索します。

省略した場合、`madr-lint` は設定された `adrDir`（デフォルト: `docs/adr`）を lint します。

```bash
# lint the configured adrDir
madr-lint

# lint explicit paths
madr-lint docs/adr docs/decisions/0007-use-x.md
```

## オプション

| フラグ | デフォルト | 説明 |
|---|---|---|
| `--format <format>` | `text` | レポーター: `text`、`json`、または `sarif`。 |
| `--cache` / `--no-cache` | `--cache` | ファイル単位のコンテンツハッシュキャッシュを使用します。 |
| `--cache-dir <dir>` | `.madr-lint/cache` | キャッシュディレクトリ。 |
| `--help` | | ヘルプを表示します。 |
| `--version` | | バージョンを出力します。 |

CLI フラグは設定ファイルより優先されます。例えば `--no-cache` は `cache: true` を上書きします。

## レポーター

### `text`（デフォルト）

人間が読みやすい形式で、ファイルごとにグループ化されます。

```text
docs/adr/0003-use-postgres.md
  error  madr/status-enum        Status "decided" is not one of: ...
  error  madr/required-sections  Missing required section: "Consequences"

2 errors
```

### `json`

ツール向けの構造化された出力です。

```bash
madr-lint --format json
```

```json
{
  "version": 1,
  "summary": { "total": 2, "errors": 2, "warnings": 0 },
  "results": [
    {
      "path": "docs/adr/0003-use-postgres.md",
      "ruleName": "madr/status-enum",
      "messageId": "invalidStatus",
      "severity": "error",
      "message": "Status \"decided\" is not one of: ...",
      "data": { "status": "decided" }
    }
  ]
}
```

### `sarif`

コードスキャン連携（例: GitHub code scanning）向けの
[SARIF](https://sariftools.github.io/sarif-spec/) です。

```bash
madr-lint --format sarif > madr-lint.sarif
```

## 終了コード

| 終了コード | 意味 |
|---|---|
| `0` | エラーなし（警告は出力される場合があります） |
| `1` | 1 件以上の `error` 重大度の診断 |
| `2` | 設定の問題（無効なルールオプション、未知の `--format`） |

## キャッシュ

キャッシュはファイル単位の診断をコンテンツハッシュをキーとして保存し、パッケージの
バージョンや解決済み設定が変わると無効化されます。ファイル間のルールは常に再実行されます。

```bash
# force a clean run
madr-lint --no-cache

# use a custom cache directory
madr-lint --cache-dir .cache/madr-lint
```
