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
  fixable: boolean;           // この diagnostic に自動修正があるか
  fix?: (fixer: Fixer) => TextEdit | TextEdit[] | null; // 一時的。「自動修正」を参照
}
```

`suggestion` と `docsUrl` は、ルールの宣言的な `meta.suggestions[messageId]` と
`meta.docs.url` から、ランナーがレポート時に解決します。`suggestion` はメッセージと
同じく diagnostic の `data` で補間されます。ルールがこれらの文字列を手続き的に
組み立てることはありません。

`fixable` は永続的な真偽値です。キャッシュや `json` 出力にシリアライズされ、text
レポーターは `🔧 fixable` マーカーを表示します。`fix` サンクは**一時的**です。JSON
シリアライズで失われる（そのためキャッシュから復元した diagnostic には存在しない）
クロージャで、自動修正のアプライアが消費します。[自動修正](#自動修正)を参照してください。

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

## 自動修正

ルールは `meta.fixable: 'code'` を宣言し、`context.report(...)` に遅延評価の `fix`
サンクを添えることで自動修正に対応します。サンクは**本文**（mdast）座標
（`node.position.*.offset` と同じ空間）で動作し、`Fixer` がファイル全体のオフセットへ
変換します。そのため frontmatter が除去されていても修正は正しく適用されます。

修正が対象とするオフセット範囲は、通常 `context.metadataValueLoc` から得ます。
`context.metadataValueLoc[field]` は、`metadata` のキーのうち、実効値が v2 の先頭
リストに由来し、かつ単一の連続したテキストトークン（インライン記法を含まない）
だった場合に、本文座標での `{ start, end }` を返します — 本文をスライスして元の値と
一致することを検証済みです。実効値が frontmatter に由来するキーは**存在しません**
（frontmatter はパース前に除去されるため本文オフセットを持たず、YAML を踏まえた
書き換えが必要になります）。そのため、範囲が存在するときだけ `fix` を添付します。

```typescript
const valueRange = context.metadataValueLoc?.status;

context.report({
  messageId: 'invalidStatus',
  data: { status, allowed },
  // metadataValueLoc に対象範囲があるときだけ fix を添付する。
  // 見送る場合は fix を省略する（またはサンクから null を返す）。
  ...(valueRange && {
    fix: (fixer) =>
      fixer.replaceRange([valueRange.start, valueRange.end], 'accepted'),
  }),
});
```

アプライアのプリミティブはツールやファイル間修正のためにエクスポートされています。

```typescript
import {
  applyEdits,
  makeFixer,
  fixFileContent,
  frontmatterOffset,
} from 'madr-lint';

// 本文オフセットを除去済み frontmatter の分だけずらし、差し替える。
const fixer = makeFixer(frontmatterOffset(content)); // fileOffset = body + frontmatter
const edit = fixer.replaceRange([start, end], 'accepted'); // TextEdit（ファイル全体）
const fixed = applyEdits(content, [edit]); // ソートし、重複を除去し、1 パスで適用
```

`fixFileContent(content, lint)` は 1 ファイルの不動点ループを実行します。`lint`
コールバックが返す診断（抑制・ベースライン適用済みであるべき）から編集を収集し、適用して
再 lint し、`MAX_FIX_PASSES`（10）まで繰り返します。戻り値は `{ fixedContent,
remaining, changed, passes, applied }` です。

## エクスポート

| エクスポート | 説明 |
|---|---|
| `parseFile` | コンテンツをパース → frontmatter、metadata、mdast、body |
| `extractListMetadata` | mdast ツリーから v2 の本文リストメタデータを抽出 |
| `frontmatterOffset` | gray-matter が除去する長さ（`fileOffset = bodyOffset + this`） |
| `applyEdits` | `TextEdit` を文字列に適用（ソート、重複除去、1 パス） |
| `makeFixer` | 本文オフセットをファイル全体の `TextEdit` に変換する `Fixer` を生成 |
| `collectFixes` | 診断の `fix` サンクを呼び出し → ファイル全体の `TextEdit[]` |
| `fixFileContent` | `lint` コールバックに対しファイル単位の自動修正不動点を実行 |
| `unifiedDiff` | 2 つの文字列間の統合 diff を生成（`--fix-dry-run` が使用） |
| `MAX_FIX_PASSES` | 不動点の反復上限（10） |
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
