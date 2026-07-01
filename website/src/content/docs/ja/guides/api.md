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

型（`Rule`、`ProjectRule`、`RuleContext`、`Diagnostic`、`RuleSeverity` など）は、
カスタムルールを作成するためにエクスポートされています。
