---
title: AIエージェント
description: llms.txt を通じて madr-lint のドキュメントを LLM に渡し、adopt-madr-lint / new-adr エージェントスキルを使って、毎回ワークフローを再導出することなく導入や ADR 作成を進める。
---

`madr-lint` は人間だけでなくエージェントによる操作も前提に作られています。構造化された
JSON 出力、機械可読な終了コードに加え、導入とライティングのワークフローをあらかじめ
組み込んだ 2 つの
[エージェントスキル](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
を用意しているので、エージェントが実行のたびにドキュメントからワークフローを
再導出する必要はありません。

## `llms.txt`

ドキュメントサイトは、この規約に対応した LLM 向けに
[`llms.txt`](https://knktkc.github.io/madr-lint/llms.txt) インデックスと、
一度のフェッチでコンテキストに読み込める全文版 2 種類を公開しています。

| ファイル | 内容 |
|---|---|
| [`llms.txt`](https://knktkc.github.io/madr-lint/llms.txt) | インデックス — 他の 2 ファイルへのリンク |
| [`llms-small.txt`](https://knktkc.github.io/madr-lint/llms-small.txt) | 非本質的な内容を省いた抄録版 |
| [`llms-full.txt`](https://knktkc.github.io/madr-lint/llms-full.txt) | 英語ドキュメント全文を結合したもの |

いずれもドキュメントサイト本体と同じ Astro Starlight のコンテンツから生成されています
（英語のみ — `/ja/` 配下は同じ内容の翻訳であり、重複させても LLM にとって新しい情報には
ならないためです）。サイトをページ単位でクロールする代わりに `llms-full.txt` を
エージェントに渡せば、一度のフェッチでリファレンス全体を与えられます。

## エージェントスキル

このリポジトリには 2 つの
[Claude Code スキル](https://docs.claude.com/en/docs/claude-code/skills)が
[`skills/adopt-madr-lint/`](https://github.com/knktkc/madr-lint/tree/main/skills/adopt-madr-lint)
と
[`skills/new-adr/`](https://github.com/knktkc/madr-lint/tree/main/skills/new-adr)
に同梱されています。どちらも普通の `SKILL.md` ファイルで、特別なランタイムや
madr-lint 固有のツールを必要としません（CLI 自体を除く）。そのため Claude Code に
限らず、SKILL.md の規約を読めるエージェントハーネスであればどれでも利用できます。

### `adopt-madr-lint`

数十件のレガシー ADR を抱えている可能性のあるリポジトリに madr-lint を導入する手順を
エージェントに示します: ADR ディレクトリの検出 → インストール → 設定ファイルの作成 →
最初の lint 実行 → 既存の違反を**ベースライン化**して新しい違反だけがビルドを
失敗させるようにする → composite action で CI を配線 → 必要に応じてインライン抑制で
一部の例外をトリアージ、という流れです。
[既存リポジトリへの導入](/ja/guides/adopting-existing-repo/)、
[CLI](/ja/guides/cli/)、[GitHub Action](/ja/guides/github-action/) の各ガイドを、
判断ポイント（今すぐ直すかベースライン化するか、どのパッケージマネージャーを使うか、
どのディレクトリを対象にするか）を明示した、機械的でステップバイステップな手順に
まとめたものです。

### `new-adr`

最初のコミットから madr-lint を通過する新しい ADR を書く手順をエージェントに示します:
次の番号を決定し、設定された MADR バージョン向けのテンプレート（デフォルトは v4 の
フロントマター、v2 のボディリスト版も用意）を選び、ファイルを作成した後、
`npx madr-lint --format json` を診断が 0 件になるまでループで検証します。

### 導入先リポジトリへのインストール方法

どちらのスキルもリポジトリのコンテンツであり、npm パッケージの一部ではありません —
現時点ではこれらをインストールする `madr-lint` の CLI フラグはありません（下記の注記を
参照）。ファイルをコピーしてプロジェクトに取り込んでください。

```bash
mkdir -p .claude/skills
curl -fsSL -o .claude/skills/adopt-madr-lint/SKILL.md --create-dirs \
  https://raw.githubusercontent.com/knktkc/madr-lint/main/skills/adopt-madr-lint/SKILL.md
curl -fsSL -o .claude/skills/new-adr/SKILL.md --create-dirs \
  https://raw.githubusercontent.com/knktkc/madr-lint/main/skills/new-adr/SKILL.md
```

または、利用しているエージェントハーネスが `.claude/skills/` 以外の任意パスからの
スキル読み込みに対応している場合は、このリポジトリの `skills/` ディレクトリを
直接クローン・参照してください。

### 配布方法について: なぜ今は手動コピーなのか

長期的な自然な解は `npx madr-lint init --skills` で、設定をスキャフォールドする際に
両方の `SKILL.md` を導入先リポジトリの `.claude/skills/` にコピーするという形です。
これは [#30](https://github.com/knktkc/madr-lint/issues/30)（`madr-lint init`、
未実装）に紐づいています。`init` 自体がまだ存在しない以上、`--skills` フラグを
生やす土台がないため、その依存関係の完了を待つのではなく、当面はこのリポジトリの
`skills/` 配下に単純にコピー可能なファイルとして公開しています。これは専用の ADR を
起こすほどではない小さな決定なので、この場に記録しておきます。`init` が実装された
時点で見直してください。

## プログラムから利用するための `--format json`

```bash
npx madr-lint --format json
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
      "data": { "section": "Consequences" }
    }
  ]
}
```

上記は、本稿執筆時点で最新の公開バージョンである **v0.2.0** が実際に出力する形です —
`path`、`ruleName`、`messageId`、`severity`、`message`、そしてルール固有の `data`
オブジェクトです。すでに `main` にマージ済み（まだリリースには含まれていない）の
変更により、各 result にさらに 2 つのフィールドが追加される予定です:
`suggestion`（機械的に適用できる修正内容。ルールが定義していない場合は `null`）と
`docsUrl`（ルールのドキュメントページ）です。これが公開されたら、`data` から
自前で修正メッセージを組み立てるより `suggestion` を読む方を優先してください。
上記の 2 つのスキルはいずれも現在公開されている形に基づいて書かれており、
関係する箇所でその旨を明記しています。

詳しいレポーターのリファレンスは [CLI](/ja/guides/cli/#json) ガイド、
CLI を呼び出す代わりにライブラリとして使う方法は
[プログラマティックAPI](/ja/guides/api/) ガイドを参照してください。

## 終了コード

| 終了コード | 意味 |
|---|---|
| `0` | エラーなし。`--max-warnings` を設定している場合は警告数が上限以内 |
| `1` | 1 件以上の `error` 重大度の診断、または警告数が `--max-warnings` を超過 |
| `2` | 使用法または設定エラー（`--max-warnings` の値が不正、`--config` ファイルが存在しない、無効なルールオプション、未知の `--format`） |

スクリプトから `madr-lint` を実行するエージェントは、標準エラー出力のテキストを
パースするのではなく、この 3 つの終了コードで分岐すべきです。`1` は「直すべき lint
違反がある」ことを意味し、`2` は「呼び出し自体が誤っている」（不正なフラグ、不正な
設定、不正なオプション）ことを意味します — 後者は通常、ADR ではなくコマンドの方を
直すべきというサインです。
