---
title: ルールの抑制
description: インライン HTML コメントディレクティブ — disable-file、disable/enable 範囲、disable-next-line — で、ルールをプロジェクト全体で無効化することなく、正当な例外を 1 件だけ抑制する。
---

歴史的な status 値を `madr/status-enum` が拒否するなど、レガシーな ADR が 1 つだけ
正当にルールへ違反することがあります。その 1 ファイルのためにルールをプロジェクト全体で
`off` にするのは割に合いません。インライン抑制コメントは、ESLint の `eslint-disable`
コメントと同じように、ファイル単位・行単位のエスケープハッチを提供します。

ディレクティブは ADR の Markdown 本文に書く通常の HTML コメントです。ルールからは
一切見えません — 抑制はすべてのルールが報告を終えた後に、中央でまとめて適用されます。

## 4 つのディレクティブ

```markdown
<!-- madr-lint-disable-file -->
このファイル内のすべてを抑制します。

<!-- madr-lint-disable -->
この行からファイル末尾まで、または対応する
madr-lint-enable まで抑制します。

<!-- madr-lint-enable -->
以前に無効化したルールを再度有効にします。

<!-- madr-lint-disable-next-line -->
次の（空行でない）行だけを抑制します。
```

## 特定のルールへのスコープ

各形式は、完全なルール ID のカンマ区切りリストを任意で受け取ります。リストがない場合、
ディレクティブは**すべての**ルールに適用されます。

```markdown
<!-- madr-lint-disable-next-line madr/status-enum -->
- Status: superseded-but-we-spelled-it-oddly

<!-- madr-lint-disable madr/status-enum, madr/date-iso8601 -->
…ここから両方のルールが抑制される…
<!-- madr-lint-enable madr/date-iso8601 -->
…以降は madr/status-enum のみ抑制されたまま…
```

`enable` は名指ししたもの（スコープなしの場合はすべて）を再有効化します。つまり
スコープなしの `disable` の後にスコープ付きの `enable` を書くと、それ以外は無効化
されたままになります — ESLint のセマンティクスと同じです。

## `disable-next-line` は次の空行でない行を対象にする

ESLint と異なり、`madr-lint-disable-next-line` は文字どおりの次の行ではなく、次の
**空行でない**行に適用されます。Markdown の書き手はコメントブロックの後に空行を
置くのが慣例であり、それを越えられずに黙って外れるディレクティブは罠になるためです。
次のどちらも機能します。

```markdown
<!-- madr-lint-disable-next-line madr/no-broken-links -->
[アーカイブされた設計文書](./2019-design.md)
```

```markdown
<!-- madr-lint-disable-next-line madr/no-broken-links -->

[アーカイブされた設計文書](./2019-design.md)
```

## プロジェクト（ファイル間）ルール

プロジェクトルール（例: `madr/no-duplicate-numbering`）の診断は特定のファイルに
帰属します。そのファイル内のディレクティブがそれらを抑制します。

- **ファイルスコープ**の抑制 — `disable-file`、または後続の対応する `enable` を
  持たない `disable` — は、そのファイルのプロジェクト診断を抑制します。
- **行スコープ**の抑制（`disable-next-line`、`disable`/`enable` の範囲）は、
  `madr/no-broken-links` の診断のように、診断が行番号を持つ場合に適用されます。

## 制限事項と注意点

- **フロントマターは行単位で対象にできません。** YAML フロントマターは Markdown
  本文のパース前に取り除かれるため、フロントマターの値（例: フロントマターの
  `status:`）に関する診断は行番号を持ちません。行スコープのディレクティブでは
  届かないので、代わりにそのルールに対するファイルスコープの `disable` を使って
  ください。MADR v2 のメタデータリストの値は本文にあるため、行単位で対象に
  **できます**。
- **行番号を持たない診断**（例: `madr/filename-format`、セクションの欠落、
  メタデータフィールドの欠落）は、ファイルスコープの抑制 — `disable-file`、
  またはファイル末尾まで開いたままの `disable` — でのみ抑制されます。
  `disable`/`enable` で閉じた範囲では抑制されません。
- **1 コメントにつき 1 ディレクティブ、単独で書くこと。** 同じ行に別のコメントを
  含むコメント（`<!-- … --><!-- … -->`）はディレクティブとして拒否されます。
  未知のキーワード（例: `madr-lint-disable-line`）や通常の HTML コメントは
  黙って無視されます。
- **`core/internal-error` は抑制できません。** これは ADR に関する指摘ではなく、
  ルールのバグを知らせるものです。
- **キャッシュは正しく保たれます。** ディレクティブはファイル内容の一部なので、
  追加・削除するとコンテンツハッシュのキャッシュは自動的に無効化されます。

## 系統的な例外には設定を使う

多くのファイルで同じルールを抑制していると気づいたら、インラインディレクティブでは
なく[設定ファイル](/ja/guides/configuration/)でルールのオプションや重大度を変更して
ください — インラインディレクティブは 1 回限りの例外のためのもので、ポリシーの
ためのものではありません。
