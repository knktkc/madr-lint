---
title: GitHub Action
description: GitHub Actions を使って CI で madr-lint を実行する（code scanning への SARIF アップロードを含む）。
---

`madr-lint` は通常の npm CLI なので、GitHub Actions での実行は 1 ステップで済みます。
`error` 重大度の診断があると非ゼロで終了するため、lint の失敗はジョブの失敗になります。

## 最小限のワークフロー

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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx madr-lint
```

`madr-lint` がプロジェクトの開発依存である場合は、まずインストールしてからローカルの
バイナリを実行してください。

```yaml
      - run: npm ci
      - run: npx madr-lint
```

## SARIF を code scanning にアップロードする

`sarif` レポーターは GitHub code scanning と連携するため、検出結果が PR 上にインラインで
表示されます。lint が失敗しても SARIF がアップロードされるよう `if: always()` を使い、
lint ステップがアップロードを中断させないようにします。

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
      - name: Lint ADRs
        run: npx madr-lint --format sarif > madr-lint.sarif
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
