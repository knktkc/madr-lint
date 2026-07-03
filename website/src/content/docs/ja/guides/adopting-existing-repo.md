---
title: 既存リポジトリへの導入
description: 大量のレガシー ADR があるリポジトリに、すべての違反を先に修正することなく madr-lint を導入する。現状の問題をベースラインにスナップショットし、新しい違反だけがビルドを失敗させるようにする。
---

数十個のレガシー ADR があるリポジトリで `madr-lint` を初めて実行すると、数百件の
エラーが出ます。最初のグリーンビルドまでにすべてを修正するのは現実的ではありません。
そこで `madr-lint` では既存の違反を**ベースライン化**し、*新しい*違反にだけルールを
適用できます。これは [`tsc-baseline`](https://github.com/tvsom/tsc-baseline) や
ESLint の一括抑制、Betterer と同じパターンです。

## 3 ステップでの導入

### 1. 現状を把握する

```bash
madr-lint
# → 342 errors, 17 warnings
```

### 2. 現在の違反をスナップショットする

```bash
madr-lint --update-baseline
# → Wrote 359 violations across 53 files to .madr-lint/baseline.json
```

これは `.madr-lint/baseline.json` を書き出して `0` で終了します。**このファイルを
コミットしてください。**

### 3. これ以降を強制する

```bash
madr-lint
# → 17 problems hidden by baseline (.madr-lint/baseline.json)
#   exit code 0
```

ベースラインに含まれる違反はすべて差し引かれます。まったく新しい違反 — セクションが
欠けた新しい ADR や、古いファイルでの新たなミス — を追加すると、通常どおりビルドが
失敗します。

```bash
madr-lint
# docs/adr/0060-new-decision.md
#   error  madr/required-sections  Missing required section: "Consequences"
#
# 1 error
#   exit code 1
```

ステップ 3 を CI に組み込めば、レガシーな負債はあなたのペースで返済しつつ、初日から
「新しい負債を増やさない」強制が得られます。

## フィンガープリントの仕組み

ベースライン化された違反は、行番号やメッセージ本文ではなく `(ファイルパス, ルール,
messageId)` を**件数**に対応づけて識別されます。これは意図的な設計で、ベースラインが
**無関係な編集に耐える**ことを意味します。ADR の先頭に段落を挿入すると以降の違反は
すべて数行下にずれますが、フィンガープリントはそもそも行を見ていないため、ベースラインは
引き続きそれらを吸収します。

新しい負債を捕捉するのが件数です。あるファイルが 2 件の `missingSection` 違反で
ベースライン化されていて、後の編集で 3 件目が発生した場合、2 件は吸収され、3 件目が
報告されます。

設計の詳細と却下した代替案については
[ADR-0007](https://github.com/knktkc/madr-lint/blob/main/docs/adr/0007-baseline-fingerprint-design.md)
を参照してください。

## 負債を返済する

いくつかの違反を修正したら、再スナップショットします。

```bash
madr-lint --update-baseline
```

書き直しでは修正済みのものが取り除かれるため、ベースラインファイルは解決した分だけ
縮小します — クリーンでレビューしやすい git 差分になります。キーはソートされ、
安定した 2 スペースインデントを使うため、`--update-baseline` を再実行しても不要な
差分は生じません。

ベースラインが隠しているものをすべて確認するには、ベースラインなしで実行します。

```bash
madr-lint --no-baseline
```

## フラグ

| フラグ | 効果 |
|---|---|
| `--update-baseline` | 既存のベースラインを無視して完全な lint を実行し、`.madr-lint/baseline.json` を書き直し、1 行のサマリーを表示して `0` で終了します。 |
| `--no-baseline` | ベースラインファイルを完全に無視し、すべての違反を報告します。 |
| *(デフォルト)* | `.madr-lint/baseline.json` が存在すれば差し引き、なければ何もしません。 |

## 補足

- ベースラインは `.madr-lint/baseline.json` にあり、キャッシュディレクトリ
  (`.madr-lint/cache`) と同じ場所に置かれます。ベースラインはコミットし、キャッシュは
  gitignore して構いません。
- ベースライン内のパスは**プロジェクトルートからの相対パスでスラッシュ区切り**なので、
  macOS・Linux・Windows の CI で同じファイルが機能します。
- 差し引きはエラーと警告の両方に適用され、[インライン抑制](/ja/guides/suppressing-rules/)
  の*後*に実行されます。恒久的で正当な少数の例外にはインラインの `madr-lint-disable`
  コメントを、返済予定の大量のレガシー負債にはベースラインを使ってください。
- ベースラインの編集や削除は即座に反映されます。ベースラインは常に差し引き前の結果を
  保存する[コンテンツハッシュキャッシュ](/ja/guides/cli/#キャッシュ)とは独立しています。
- ベースラインファイルが存在するのにパースできない場合は、`stderr` に 1 行の警告を
  出して無視されます（`--update-baseline` を実行して再生成してください）。ファイルが
  存在しない場合は何も出力されません。
- `--format json` では、吸収された診断の件数が `summary.baselineHidden` で報告されます
  （常に存在し、ベースラインが有効でないときは `0`）。SARIF 出力には影響しません。
- `core/internal-error`（ルール自体がクラッシュしたときに発行される）は**決して**
  ベースライン化されません — これは負債ではなくバグを示すためです。
