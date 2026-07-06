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
| `--format <format>` | `text` | レポーター: `text`、`json`、`sarif`、または `github`。 |
| `--quiet` | オフ | エラーのみ報告し、警告を出力から除外します。 |
| `--max-warnings <n>` | （なし） | 警告数が `n` を超えると終了コード 1 で終了します。`0` は警告が 1 件でも CI を失敗させます。負の値は制限なし。 |
| `--config <path>` | （自動） | ディスカバリーをバイパスして、指定した設定ファイル（TS または JSON）を読み込みます。 |
| `--cache` / `--no-cache` | `--cache` | ファイル単位のコンテンツハッシュキャッシュを使用します。 |
| `--cache-dir <dir>` | `.madr-lint/cache` | キャッシュディレクトリ。 |
| `--baseline` / `--no-baseline` | `--baseline` | 存在する場合に `.madr-lint/baseline.json` を差し引きます。 |
| `--update-baseline` | | 完全な lint から `.madr-lint/baseline.json` を書き直し、`0` で終了します。 |
| `--help` | | ヘルプを表示します。 |
| `--version` | | バージョンを出力します。 |

CLI フラグは設定ファイルより優先されます。例えば `--no-cache` は `cache: true` を上書きします。

### `--quiet` と `--max-warnings` の組み合わせ

`--quiet` は**出力**から警告を除外しますが、元の警告数は `--max-warnings` のしきい値チェックに引き続き使用されます（ESLint の[ドキュメント](https://eslint.org/docs/latest/use/command-line-interface)と同じ仕様です）。`--quiet --max-warnings 0` とすることで、ログをクリーンに保ちながら警告が存在する場合に終了コードを非ゼロにできます。

しきい値を超過した場合、その理由はすべての `--format` において**標準エラー出力（stderr）**に出力されます。標準出力のペイロードは機械可読な消費者のためにクリーンに保たれます。

```text
madr-lint: 3 warning(s) found, exceeds --max-warnings 0
```

```bash
# CI: 警告があれば失敗させるが、出力をクリーンに保つ
madr-lint --quiet --max-warnings 0
```

[ベースライン](/ja/guides/adopting-existing-repo/)に吸収された警告は `--max-warnings` に**カウントされません**。ベースラインはしきい値チェックの前に減算されるため、引き継いだ負債が CI を失敗させることはなく、新規の警告のみがカウントされます。`--update-baseline` は `--quiet` や `--max-warnings` に関係なく常に終了コード 0 で終了します。

## レポーター

### `text`（デフォルト）

人間が読みやすい形式で、ファイルごとにグループ化されます。ルールが具体的な修正方法を
提示できる場合はインデントされた `→` 行で表示し、ルールのドキュメント URL は
ファイルグループごとにルール単位で 1 回だけ出力されます（診断ごとには繰り返さず、
出力をコンパクトに保ちます）。

```text
docs/adr/0003-use-postgres.md
  error  madr/date-iso8601       Date "2026-13-01" is not a valid ISO 8601 calendar date (YYYY-MM-DD)
                                 → use the YYYY-MM-DD calendar-date format, e.g. 2025-03-14
  error  madr/required-sections  Missing required section: "Consequences"
                                 → add a "## Consequences" heading to the document body
  madr/date-iso8601       https://knktkc.github.io/madr-lint/rules/date-iso8601/
  madr/required-sections  https://knktkc.github.io/madr-lint/rules/required-sections/

2 errors
```

### `json`

ツール向けの構造化された出力です。各 result は `suggestion`（機械的に適用できる
修正内容。ルールがそのメッセージに対して定義していない場合は `null`）と、ルールの
ドキュメント URL である `docsUrl` を持ちます。

```bash
madr-lint --format json
```

```json
{
  "version": 1,
  "summary": { "total": 1, "errors": 1, "warnings": 0, "baselineHidden": 0 },
  "results": [
    {
      "path": "docs/adr/0003-use-postgres.md",
      "ruleName": "madr/required-sections",
      "messageId": "missingSection",
      "severity": "error",
      "message": "Missing required section: \"Consequences\"",
      "suggestion": "add a \"## Consequences\" heading to the document body",
      "docsUrl": "https://knktkc.github.io/madr-lint/rules/required-sections/",
      "data": { "section": "Consequences" }
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
| `0` | エラーなし。`--max-warnings` を設定している場合は警告数が上限以内 |
| `1` | 1 件以上の `error` 重大度の診断、または警告数が `--max-warnings` を超過 |
| `2` | 使用法または設定エラー（`--max-warnings` の値が不正、`--config` ファイルが存在しない、無効なルールオプション、未知の `--format`） |

## キャッシュ

キャッシュはファイル単位の診断をコンテンツハッシュをキーとして保存し、パッケージの
バージョンや解決済み設定が変わると無効化されます。ファイル間のルールは常に再実行されます。

```bash
# force a clean run
madr-lint --no-cache

# use a custom cache directory
madr-lint --cache-dir .cache/madr-lint
```

## ベースライン

すでに違反があるリポジトリに `madr-lint` を導入しますか？ それらを
`.madr-lint/baseline.json` にスナップショットすれば、*新しい*違反だけがビルドを
失敗させるようになります。

```bash
# 現在の違反をスナップショットしてファイルをコミットする
madr-lint --update-baseline

# 以降の実行では自動的にベースラインを差し引く
madr-lint

# ベースラインを無視してすべてを確認する
madr-lint --no-baseline
```

差し引きはキャッシュの後、インライン抑制の後に実行され、キャッシュには一切触れません。
そのためベースラインの編集や削除は即座に反映されます。詳しいワークフローは
[既存リポジトリへの導入](/ja/guides/adopting-existing-repo/)ガイドを参照してください。
