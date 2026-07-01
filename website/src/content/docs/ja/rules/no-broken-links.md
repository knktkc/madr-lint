---
title: madr/no-broken-links
description: ADR 内の相対パスの Markdown リンクは、実在するファイルに解決されなければなりません。
---

相対パスの Markdown リンクが実在するファイルに解決されることを検証する、ファイル横断のプロジェクトルールです。

このルールはすべての ADR の mdast を走査し、すべての `link` ノードを収集して、各相対 URL を解決します。ターゲットは、リント対象のファイルのいずれかである**か**、実際のファイルシステム上に存在する（オーケストレーターが注入する `fileExists` チェック経由 — これにより Markdown 以外のアセットやスキャン対象パス外のファイルもカバーされます）場合に、存在するものとしてカウントされます。純粋なインメモリ実行では、リント対象ファイルの集合だけが唯一の真実の情報源となります。

解決の前に、このルールは URL から `#anchor` と `?query` を取り除き、パスをパーセントデコードします（例: `my%20file.md`）。先頭の `/` は OS の絶対パスではなく、プロジェクトルート基準として扱われます（スラッシュは取り除かれます）。

外部リンクおよびパスでないリンクはスキップされます:

- プロトコル付きの URL（`http://`, `https://`, `mailto:`, `ftp:`, …）
- 純粋なアンカー（`#section`）および空の URL
- アンカー/クエリを取り除くと空になる URL

注意: ディスク上のチェックはホストのファイルシステムの大文字小文字の区別を継承するため、大文字小文字が誤ったリンクは macOS/Windows では通過しても Linux/CI では失敗することがあります。

## チェック内容

- `brokenLink` — 相対リンクが、リント対象ファイルでもディスク上に存在するものでもないパスに解決される（またはプロジェクトルートを逸脱する）。メッセージ: `Link to "<url>" resolves to "<resolvedPath>", which does not exist in the project`。`data.url` と `data.resolvedPath` を含みます。診断は、壊れたリンクを含むファイルに対して発行されます。

## 例

### 有効

```markdown
<!-- file: docs/adr/0001-x.md -->
See [ADR-0042](./0042-y.md) for the new approach.
External: [mise](https://mise.jdx.dev)
Anchor: [back to top](#header)
```

（`docs/adr/0042-y.md` が存在すると仮定）

### 無効

```markdown
<!-- file: docs/adr/0001-x.md -->
See [the rewrite](./0042-rewrite.md)
```

`docs/adr/0042-rewrite.md` が存在しない場合、`0001-x.md` に対して `data.resolvedPath: 'docs/adr/0042-rewrite.md'` を伴う `brokenLink` を発行します。

## オプション

このルールにはオプションがありません。

```ts
import { defineConfig } from 'madr-lint';

export default defineConfig({
  rules: {
    'madr/no-broken-links': 'error',
  },
});
```

## MADR バージョン互換性

| バージョン | 適用 |
|---|---|
| v2 | はい |
| v3 | はい |
| v4 | はい |

Markdown のリンク構文は MADR のバージョン間で同一です。

## 無効化する場合

ADR の相互参照を Markdown 本文の外部（例: Git タグや別の ADR レジストリ）で追跡しているリポジトリでは無効化してください。外部リンクの陳腐化はここでの対象外です — それには `lychee` のようなツールを使用してください。

## ソース

- Rule source: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-broken-links/index.ts>
- Spec: <https://github.com/knktkc/madr-lint/blob/main/src/rules/no-broken-links/spec.md>
