---
title: madr/supersedes-bidirectional
description: frontmatter の supersedes と superseded-by は互いに一貫して参照し合わなければなりません。
---

frontmatter の `supersedes` フィールドと `superseded-by` フィールドが、ADR コレクション全体で互いに一貫して指し合っていることを検証する、ファイル横断のプロジェクトルールです。

ADR-A が ADR-B を supersede する場合、A の frontmatter は `supersedes: ADR-B` を宣言し、B の frontmatter は `superseded-by: ADR-A` を宣言すべきです。このルールは各ファイルの frontmatter を直接読み取り（マージされたメタデータブリッジは使いません）、ベース名（`^(\d{4})-`）で `ADR-NNNN → file` のインデックスを構築し、両方向をチェックします。`NNNN-` プレフィックスのないファイルはアドレス指定できないためスキップされます。

両フィールドは単一の文字列または文字列の配列（多対一の supersession）を受け付けます。文字列でも配列でもない値（number, null, boolean）は暗黙的に無視されます — 型チェックはこのルールの関心事ではありません。

## チェック内容

- `unknownReference` — `supersedes` または `superseded-by` の値が、対応するファイルが存在しない `ADR-NNNN` を参照しています。メッセージ: ``Frontmatter `<direction>: <ref>` references an ADR that does not exist``。`data.ref` と `data.direction` を含みます。宙に浮いた参照を含むファイルに対して発行されます。
- `missingBackReference` — ファイル A がファイル B への前方参照を宣言しているが、B が相互の参照を宣言していません。メッセージ: ``<source> declares `<direction>: <ref>`, but <ref> (this file) does not back-reference it via <expected>``。逆参照が欠落しているファイルに対して発行され、そのファイルを指し示した `source` ファイルと、追加すべき `expected` の参照を示します。

## 例

### 有効

```yaml
# 0001-old.md
---
status: superseded by ADR-0042
superseded-by: ADR-0042
---
```

```yaml
# 0042-new.md
---
status: accepted
supersedes: ADR-0001
---
```

### 無効 — 逆参照の欠落

```yaml
# 0001-old.md
---
# (no superseded-by here)
---
```

```yaml
# 0042-new.md
---
supersedes: ADR-0001
---
```

`0001-old.md` に対して `data.expected: 'ADR-0042'` を伴う `missingBackReference` を発行します。

### 無効 — 未知の参照

```yaml
# 0042-x.md
---
supersedes: ADR-9999   # no 9999-*.md exists
---
```

`0042-x.md` に対して `data.ref: 'ADR-9999'` を伴う `unknownReference` を発行します。

## 🔧 自動修正

このルールは **自動修正可能**（`madr-lint --fix`）で、madr-lint で最初の**ファイル横断**の修正です。`missingBackReference` が見つかると、対応する `<direction>: <expected>` 行を**ターゲット**ファイルの frontmatter の閉じ `---` の直前に挿入します。frontmatter ブロックは不透明な行として扱う（YAML の再パース／再シリアライズをしない）ため、キーの順序・コメント・改行コードなど他のバイトはすべて保持されます。

修正前（`0001-old.md`、`0042-new.md` への逆参照が欠落）:

```yaml
---
status: superseded by ADR-0042
---
```

`madr-lint --fix` 後:

```yaml
---
status: superseded by ADR-0042
superseded-by: ADR-0042
---
```

`unknownReference` は自動修正**できません**（正しい ADR 番号を知っているのは執筆者だけであり、文脈依存です）。次の場合、`missingBackReference` は修正され**ません**:

- **ターゲットに frontmatter がない** — v2 本文リストの ADR や、frontmatter を持たないファイル。frontmatter ブロックを新規作成することはありません。
- **キーが既に存在する** — ターゲットが既に `superseded-by:`（または `supersedes:`）を異なる値・部分的な値で宣言している場合、キーを重複させたり値を書き換え／追記したりせず（対象外）、修正を見送ります。診断は手動で解決するために残ります。
- **多対一・同一パス** — 2 つのソース ADR が*同じ*ターゲットへの逆参照を必要とする場合、1 パスにつき 1 件だけ挿入し、残りは報告します（配列値が必要で、手動編集の領域です）。

## オプション

このルールにはオプションがありません。

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/supersedes-bidirectional': 'error',
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 | 備考 |
|---|---|---|
| v2 | いいえ | `- **Supersedes**: ADR-NNNN` は本文コンテンツであり、frontmatter ではない |
| v3 | はい | frontmatter の `supersedes` / `superseded-by` |
| v4 | はい | 同上 |

このルールは frontmatter のみを読み取るため、MADR v2 の本文リストメタデータには適用されません。

## 無効化する場合

supersession を ADR frontmatter の外部で追跡しているリポジトリでは無効化してください — 例: Git タグ、外部レジストリ、または明示的な `supersedes` / `superseded-by` フィールドなしで `status: superseded by ...` の行のみを使う場合です。

他のルールと同様、インラインコメントで抑制できます — [ルールの抑制](/ja/guides/suppressing-rules/)を参照してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/supersedes-bidirectional/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/supersedes-bidirectional/spec.md>
