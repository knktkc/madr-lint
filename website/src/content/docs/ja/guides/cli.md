---
title: CLI
description: madr-lint のコマンドラインインターフェース — 引数、フラグ、レポーター、終了コード。
---

```bash
madr-lint [OPTIONS] [PATHS...]
madr-lint init [OPTIONS]
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
| `--fix` | オフ | 自動修正をその場で適用し、残った問題を報告します。 |
| `--fix-dry-run` | オフ | `--fix` が適用する修正の統合 diff を表示します。ファイルには書き込みません。 |
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

## `madr-lint init`

設定ファイルをスキャフォールドします。非対話型の設計です — すべての判断は
ファイルシステムのヒューリスティックまたはフラグで決まるため、CI やパイプの
中でも安全に実行できます。

```bash
npx madr-lint init
```

`init` は次の 3 つを検出し、`madr-lint:recommended` を継承する設定ファイルを
書き出します。

- **ADR ディレクトリ** — `docs/adr`、`docs/decisions`、`doc/adr`、`adr`、
  `docs/architecture/decisions` のうち、直下に `NNNN-*.md` ファイルを 1 つ
  以上含む最初のディレクトリ。どれも該当しない場合は `docs/adr`（リンターの
  デフォルト）にフォールバックし、その旨を出力します。
- **MADR バージョン** — 既存 ADR を最大 20 ファイルサンプリングし、多数決で
  決定します。`decision-makers` を含む YAML frontmatter は v4、それ以外の
  frontmatter は v3、v2 のメタデータリストは v2 としてカウントします。空の
  ディレクトリ、同数、認識できるメタデータなしの場合は `auto`（デフォルト
  なので、書き出される設定からは省略されます）。
- **設定ファイル形式** — プロジェクトが TypeScript を使っていそうな場合
  （`tsconfig.json` がある、または `package.json` の依存に `typescript` が
  ある）は `madr-lint.config.ts`、それ以外は `.madrlintrc.json`。

`init` は既存の設定ファイルを上書きしません（終了コード `2`）。置き換えるには
`--force` を渡します。書き込み後、検出したディレクトリを軽量なインプロセス
lint で確認し、違反が見つかった場合は、レガシーな負債が導入の妨げにならない
よう、次のステップとして
[`--update-baseline`](/ja/guides/adopting-existing-repo/) を提案します。

### フラグ

| フラグ | デフォルト | 説明 |
|---|---|---|
| `--force` | オフ | 終了コード `2` で終了する代わりに、既存の設定ファイルを上書きします。 |
| `--dir <path>` | （検出） | 検出を上書きして、設定に書き込む ADR ディレクトリを指定します。 |
| `--json` | オフ | テキストの代わりに機械可読な JSON サマリー（検出・書き込みの内容）を出力します — エージェントやスクリプト向け。 |

```bash
# モノレポ: 特定パッケージの ADR を設定に指定する
npx madr-lint init --dir services/api/docs/adr

# 機械可読なサマリー
npx madr-lint init --json
```

`--json` のペイロードは `written`、`configPath`、`configFormat`、`adrDir`、
`adrDirSource`（`detected` / `fallback` / `override`）、`madrVersion`、
`filesChecked`、`errors`、`warnings`、`suggestUpdateBaseline`、
`docsUrl`（はじめるガイドの URL）を報告します。

## 自動修正

一部の診断は**機械的に修正可能**です。`madr-lint` はそれらを `text` 出力では淡色の
`🔧 fixable` タグで、`json` では `"fixable": true` フィールドで示します。

```bash
# その場で修正を適用し、残った問題を報告する
madr-lint --fix

# ファイルに触れずに、適用される変更をプレビューする
madr-lint --fix-dry-run
```

`--fix` はファイルを書き換え（実際に変わるものだけ）、修正後の内容を再 lint して
**残った**問題を報告します。終了コードは残った内容を反映するため、CI での `--fix` は
修正しきれなかったものがあれば依然として失敗します。`--fix-dry-run` は同じ修正を
メモリ上で適用し、ファイルごとの統合 diff を表示するだけで、何も書き込みません。
その終了コードは `--fix` が返したであろう値と同じです。両方のフラグを指定した場合は
`--fix-dry-run` が優先されます（何も書き込まれません）。

ドライラン diff の出力先は `--format` によって決まり、機械可読な標準出力が汚れる
ことはありません。`text` は標準出力に表示（下記）、`json` はペイロードのトップレベル
`diffs` 配列に埋め込み（[`json`](#json) を参照）、`sarif` / `github` は標準出力を
パース可能に保つため標準エラー出力（stderr）に送ります。

```text
--- a/docs/adr/0003-use-postgres.md
+++ b/docs/adr/0003-use-postgres.md
@@ -1,3 +1,3 @@
 # ADR-0003

-- Status: Accepted
+- Status: accepted
✓ All clear.
1 problem fixable (dry run; no files written)
```

修正は他のフラグと組み合わせられます。

- `--fix` と `--quiet` / `--max-warnings` は**残った**診断に対して動作します。
- **抑制**された（[`madr-lint-disable`](/ja/guides/suppressing-rules/)）診断や、
  **ベースライン**化された（[`.madr-lint/baseline.json`](/ja/guides/adopting-existing-repo/)）
  診断は決して書き換えられません。残すと選んだ問題はそのまま残ります。
- `--update-baseline` は `--fix` / `--fix-dry-run` と併用できません（ファイルを書き換えるか、
  違反をスナップショットするか、意図が曖昧なため）。併用すると `2` で終了します。
- 修正中はキャッシュがバイパスされます。修正されたファイルは次回の実行で新しい
  コンテンツハッシュとして通常のパイプラインに戻ります。

## レポーター

### `text`（デフォルト）

人間が読みやすい形式で、ファイルごとにグループ化されます。ルールが具体的な修正方法を
提示できる場合はインデントされた `→` 行で表示し、`--fix` で修正できる診断には
`🔧 fixable` タグが付き、ルールのドキュメント URL は
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
修正内容。ルールがそのメッセージに対して定義していない場合は `null`）、ルールの
ドキュメント URL である `docsUrl`、そして `--fix` で修正できるかを示す `fixable` を
持ちます。修正パスが実行された場合、`summary` には適用された修正件数 `fixed` も含まれます。
`--fix-dry-run` の場合、ペイロードにはさらにトップレベルの `diffs` 配列が含まれます
（変更されたファイルごとに `{ "path", "diff" }` エントリ 1 つ。`diff` は統合 diff の
テキスト）。これにより標準出力は純粋な JSON のまま保たれます。

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
      "fixable": false,
      "data": { "section": "Consequences", "found": ["Context and Problem Statement", "Decision Outcome"] }
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
| `1` | 1 件以上の `error` 重大度の診断、または警告数が `--max-warnings` を超過。`--fix` / `--fix-dry-run` の場合は、修正後に**残った**問題を反映 |
| `2` | 使用法または設定エラー（`--max-warnings` の値が不正、`--config` ファイルが存在しない、無効なルールオプション、未知の `--format`、`--update-baseline` と `--fix` の併用、`--force` なしの `madr-lint init` で既存の設定ファイルがある場合） |

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
