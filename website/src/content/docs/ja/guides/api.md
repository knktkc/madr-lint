---
title: プログラマティック API
description: madr-lint をライブラリとして使う — ADR をパースし、ファイル単位またはプロジェクト全体でルールを実行し、推奨プリセットを再利用する。
---

`madr-lint` は CLI に加えて ESM ライブラリのエントリ（`madr-lint`）を提供します。
エディタ連携、カスタムランナー、あるいは使い捨てのスクリプトを作るのに便利です。

```typescript
import {
  parseFile,
  runRule,
  runRulesOnFile,
  runRulesOnProject,
  buildProjectFile,
  recommended,
  rules,
  defineConfig,
} from 'madr-lint';
```

## ファイルをパースする

`parseFile` は YAML frontmatter、v2 の本文リストメタデータ、統合された `metadata` ビュー、
mdast ツリー、そして本文を返します。

```typescript
import { parseFile } from 'madr-lint';

const parsed = parseFile('---\nstatus: accepted\n---\n\n# ADR-0001\n');
parsed.frontmatter; // { status: 'accepted' }
parsed.metadata;    // { status: 'accepted' }  (frontmatter + v2 list)
parsed.ast;         // mdast Root
```

## 単一のルールを実行する

```typescript
import { runRule, rules } from 'madr-lint';

const diagnostics = runRule(
  rules.statusEnum,
  { path: '0001-x.md', content: '---\nstatus: draft\n---\n\n# x\n' },
  { options: { caseSensitive: false } },
);
// → [{ ruleName: 'madr/status-enum', messageId: 'invalidStatus', ... }]
```

## Diagnostic の形

ランナーが返す各 diagnostic は自己完結しています。機械的に適用できる修正内容と
ドキュメントリンクを持つため、消費側がルール名から組み立て直す必要はありません。

```typescript
interface Diagnostic {
  ruleName: string;           // 例: 'madr/required-sections'
  messageId: string;          // ルールの `messages` マップのキー
  severity: 'error' | 'warn';
  path: string;               // POSIX 相対パス
  loc?: { line: number; column: number };
  data?: Record<string, unknown>;
  suggestion: string | null;  // 具体的な修正内容。ルールが定義していなければ null
  docsUrl: string;            // rule.meta.docs.url（core/internal-error はリポジトリ）
}
```

`suggestion` と `docsUrl` は、ルールの宣言的な `meta.suggestions[messageId]` と
`meta.docs.url` から、ランナーがレポート時に解決します。`suggestion` はメッセージと
同じく diagnostic の `data` で補間されます。ルールがこれらの文字列を手続き的に
組み立てることはありません。

## ファイル単位のルールをまとめて実行する

複数のファイル単位ルールは単一の AST 走査を共有します。

```typescript
import { runRulesOnFile, rules } from 'madr-lint';

const diagnostics = runRulesOnFile(
  [rules.requiredSections, rules.statusEnum],
  { path: '0001-x.md', content: fileContents },
  { severity: 'error' },
);
```

## プロジェクト（ファイル間）ルールを実行する

ファイル間ルール（番号の一意性、supersedes グラフ、リンク切れ）は、`buildProjectFile` で
構築した、事前にパース済みの `ProjectFile` の配列を受け取ります。

```typescript
import { runRulesOnProject, buildProjectFile, rules } from 'madr-lint';

const files = [
  buildProjectFile({ path: 'docs/adr/0001-a.md', content: a }),
  buildProjectFile({ path: 'docs/adr/0001-b.md', content: b }),
];

const diagnostics = runRulesOnProject(
  [rules.noDuplicateNumbering],
  files,
  { severity: 'error' },
);
```

## バッチでのルールごとのオプション

それぞれ独自のオプションを必要とする複数のルールを実行する場合は、`optionsByRule`
（名前 → オプション）を渡します。

```typescript
runRulesOnFile([rules.filenameFormat], file, {
  optionsByRule: {
    'madr/filename-format': { pattern: '^ADR-[0-9]+\\.md$' },
  },
});
```

## 推奨プリセットを再利用する

```typescript
import { recommended, defineConfig } from 'madr-lint';

recommended['madr/required-sections']; // 'error'

const config = defineConfig({
  extends: ['madr-lint:recommended'],
  rules: { 'madr/no-numbering-gap': 'warn' },
});
```

## ベースライン

[ベースライン](/ja/guides/adopting-existing-repo/)をプログラムから構築・適用できます —
CLI の `--baseline` / `--update-baseline` フラグと同じ減算処理です。

```typescript
import { buildBaseline, applyBaseline, writeBaseline, baselinePath } from 'madr-lint';

const baseline = buildBaseline(diagnostics);
writeBaseline(baselinePath(process.cwd()), baseline);

// 以降の lint 実行時:
const { kept, hidden } = applyBaseline(newDiagnostics, baseline);
```

## エクスポート

| エクスポート | 説明 |
|---|---|
| `parseFile` | コンテンツをパース → frontmatter、metadata、mdast、body |
| `extractListMetadata` | mdast ツリーから v2 の本文リストメタデータを抽出 |
| `runRule` | 単一のファイル単位ルールを実行 |
| `runRulesOnFile` | ファイル単位ルールを 1 回の AST 走査で実行 |
| `runRulesOnProject` | ファイル間（プロジェクト）ルールを実行 |
| `buildProjectFile` | プロジェクトルール向けにファイルを事前パース |
| `rules` | 組み込みルールの名前空間 |
| `recommended` | 推奨プリセットの重大度 |
| `defineConfig` | 型安全な設定ヘルパー |
| `RuleOptionsError` | ルールオプションの検証に失敗したときにスローされる |
| `isProjectRule` | プロジェクトルールとファイル単位ルールを判別する型ガード |
| `buildBaseline` | 診断結果を `Baseline`（path → rule → messageId → count）に集約 |
| `applyBaseline` | 診断結果リストから `Baseline` を減算し `{ kept, hidden }` を返す |
| `loadBaseline` | ベースラインファイルを読み込んでパース。存在しない・不正な場合は `null` |
| `serializeBaseline` | `Baseline` を決定論的に JSON テキストへシリアライズ |
| `writeBaseline` | `Baseline` をシリアライズしてディスクに書き込み、親ディレクトリも作成 |
| `baselinePath` | 指定した cwd に対する `.madr-lint/baseline.json` の絶対パスを解決 |
| `BASELINE_VERSION` | 現在のベースラインのオンディスクスキーマバージョン |
| `INTERNAL_ERROR_RULE_NAME` | ランナーが投げるエラー用の予約ルール名。ベースライン化されない |

型（`Rule`、`ProjectRule`、`RuleContext`、`Diagnostic`、`RuleSeverity`、
`Baseline`、`BaselineApplyResult` など）は、カスタムルールやツールの作成のために
エクスポートされています。
