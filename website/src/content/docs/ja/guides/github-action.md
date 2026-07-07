---
title: GitHub Action
description: GitHub Actions を使って CI で madr-lint を実行する（PR アノテーションと code scanning への SARIF アップロードを含む）。
---

`madr-lint` は複合 GitHub Action を提供しており、違反ごとに **PR diff アノテーション** を
出力します。エラーと警告がプルリクエストの diff にインラインで表示されます。

## クイックスタート

```yaml
# .github/workflows/adr-lint.yml
name: ADR lint

on:
  pull_request:
    paths:
      - 'docs/adr/**'
  push:
    branches: [main]

jobs:
  madr-lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22   # madr-lint は Node ≥22 が必要です
      - uses: knktkc/madr-lint@v0
        with:
          path: docs/adr
```

> フローティングの `v0` タグは最新の v0.x リリースを指します。より厳密な再現性が
> 必要な場合は、`@v0.3.0` のような正確なタグを固定してください。

`error` 重大度の診断があると action は非ゼロで終了し、ジョブを自動的に失敗させます。

デフォルトでは action は npm の `latest` dist-tag をインストールします。本番の
ワークフローでは[正確な `version:` を固定する](#例)ことを推奨します。

## 入力

| 入力 | デフォルト | 説明 |
|---|---|---|
| `path` | _（config / `docs/adr`）_ | lint するパス（ファイルまたはディレクトリ） |
| `version` | `latest` | インストールする `madr-lint` の npm バージョンまたは dist-tag |
| `working-directory` | `.` | action を実行するディレクトリ |
| `args` | _（なし）_ | `madr-lint` にそのまま渡す追加 CLI 引数 |

### 例

**特定のバージョンを固定する:**

```yaml
      - uses: knktkc/madr-lint@v0
        with:
          version: '0.3.0'
          path: docs/adr
```

正確な `version:` を固定すると CI が決定論的になり、`latest` dist-tag の乗っ取り
（サプライチェーン攻撃）からも保護されます — 本番のワークフローで推奨します。

**警告をエラーとして扱う（警告があれば失敗）:**

```yaml
      - uses: knktkc/madr-lint@v0
        with:
          path: docs/adr
          args: '--max-warnings 0'
```

**モノレポ — 複数ディレクトリを lint する:**

```yaml
      - uses: knktkc/madr-lint@v0
        with:
          path: 'services/api/docs/adr services/web/docs/adr'
```

## 前提条件

この action は Node 自体をインストールしません。事前に `actions/setup-node` を追加し、
`node-version: 22`（以上）を設定してください（上記の例を参照）。

## SARIF を code scanning にアップロードする（上級者向け）

検出結果を **Security → Code scanning** タブに表示し、PR を超えて永続化したい場合は、
`--format sarif` フラグで SARIF レポートをアップロードしてください：

```yaml
jobs:
  madr-lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Lint ADRs (SARIF)
        run: npx madr-lint --format sarif docs/adr > madr-lint.sarif
        continue-on-error: true
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: madr-lint.sarif
```

## ヒント

- `paths:` でトリガーを絞り込み、ADR が変更されたときだけジョブが実行されるようにします。
- 設定ファイルをコミットして（[設定](/ja/guides/configuration/) を参照）、ローカルと CI の
  実行結果を一致させます。
- ファイル単位のキャッシュは CI ランナーに持ち込まないようにします（これはローカルでの
  高速化のためのものです）。CI でのコールドランはすでに十分高速です。
