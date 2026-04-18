# テスト構成メモ

この文書は、`docs/rfc-browser-pict-tool-ja.md` の責務分離をそのままテスト設計に落とすための補足である。

## 1. 方針

- `core` を主戦場にする
- `worker` は protocol と進捗・キャンセルの境界を検証する
- `web` は最小限のスモークに留める
- `.work/pict` は production code から参照せず、upstream fixture の供給源としてのみ使う
- `docs/pict-compatibility-factors.pict` を feature coverage の母表に使う

## 2. 推奨ディレクトリ構成

```text
/packages
  /core
    /parser
    /model
    /constraints
    /generator
    /coverage
    /exporters
    /diagnostics
  /worker
    /protocol
    /entry
  /web
    /components
    /pages
    /hooks
    /state

/tests
  /fixtures
    /unit
    /golden
    /upstream
    /perf
  /helpers
  /generated

/scripts
  import-upstream-pict-tests.ts
  materialize-upstream-fixtures.ts
  check-feature-coverage.ts
  check-fixture-integrity.ts
```

## 3. テスト層

### 3.1 `core`

- parser の構文解釈
- validator のエラー分類
- constraint evaluator の 3 値論理
- generator の制約付き n-wise 生成
- coverage analyzer の `uncoveredTupleCount`
- exporters の CSV / TSV / Markdown 整形

この層は Node 上のテストから直接呼び出し、UI や Worker を介さない。

### 3.2 `worker`

- request / response protocol
- `PROGRESS` の段階送信
- `CANCEL` の伝播
- diagnostics のシリアライズ

ここでは `core` を組み込んだ統合テストを行うが、画面描画は含めない。

### 3.3 `web`

- モデル入力
- 生成開始
- 結果表示
- エクスポート導線

E2E は主要フローのスモークのみを持つ。
互換性の本丸は `web` ではなく `core` と `worker` で担保する。

## 4. Fixture 分類

### 4.1 `tests/fixtures/unit`

小さい AST 断片や診断ケースなど、関数単位の fixture を置く。

### 4.2 `tests/fixtures/golden`

自前で管理する基準ケース。
小さなモデルに対して `output.tsv` まで完全一致で固定する。

### 4.3 `tests/fixtures/upstream`

`.work/pict/test` から取り込んだ upstream 互換ケースを置く。
ここでは `semantic` 検証を基本とし、以下を優先する。

- 制約違反がない
- 必須カバレッジを達成している
- expected な診断コードを返す
- negative 値が 1 行に複数入らない

### 4.4 `tests/fixtures/perf`

性能測定用のケースを置く。
PR では軽量 subset のみ、重いケースは定期実行に分離する。

## 5. Upstream fixture の正規化

`.work/pict/test` にはカテゴリごとに `.tests` があり、そこで

- モデルファイル
- オプション
- 期待結果

がまとまっている。
`scripts/import-upstream-pict-tests.ts` では、この定義を実行可能な索引に正規化する。
`scripts/materialize-upstream-fixtures.ts` では、その索引から fixture ディレクトリを再生成する。
`scripts/check-fixture-integrity.ts` では、索引・summary・実体化済み fixture の整合性を検査する。

### 5.1 1 ケース 1 ディレクトリの例

```text
/tests/fixtures/upstream/cons/cons-001/
  manifest.json
  model.pict
```

### 5.2 `manifest.json` の例

```json
{
  "id": "cons:001",
  "category": "cons",
  "source": {
    "modelPath": ".work/pict/test/cons/cons001.txt",
    "testsPath": ".work/pict/test/cons/.tests",
    "lineNumber": 8,
    "command": "cons001.txt"
  },
  "input": {
    "modelPath": "model.pict",
    "optionsRaw": [],
    "rowSeedPaths": []
  },
  "expected": {
    "upstreamResult": "SUCCESS",
    "expectedExitCode": 0,
    "assertionMode": "semantic",
    "notes": []
  },
  "implementationStatus": "required_v0_1",
  "tags": ["area:constraints", "category:cons"]
}
```

### 5.3 assertion モード

- `exact`
  - 小さな `golden` fixture 用
  - 行順・行数・出力 TSV まで完全一致を見る
- `semantic`
  - upstream fixture 用
  - 行順や件数の完全一致は要求しない
  - RFC の「意味互換優先」と整合させる

## 6. Coverage の考え方

最低でも次の 4 層を見る。

### 6.1 ソースカバレッジ

- `core/parser`
- `core/constraints`
- `core/generator`
- `core/coverage`
- `core/exporters`

### 6.2 フィーチャーカバレッジ

`docs/pict-compatibility-factors.pict` の観点に対して、fixture の `tags` が最低 1 件以上あるかを検査する。
`scripts/check-feature-coverage.ts` は、v0.1 必須タグの欠落を fail させる。

### 6.3 組合せカバレッジ

各生成結果に対して次を毎回算出する。

- `requiredTupleCount`
- `coveredTupleCount`
- `uncoveredTupleCount`

`uncoveredTupleCount = 0` を基本合格条件とする。

### 6.4 互換コーパスカバレッジ

`.work/pict/test/{arg,para,modl,cons,...}` ごとに `pass / skip / fail` を集計し、
どの upstream 領域をどこまで吸収できているかを可視化する。

## 7. `tests/generated` の扱い

`tests/generated` には再生成可能な索引やレポートだけを置く。

- `upstream-index.json`
- `upstream-summary.json`
- `materialized-fixtures-summary.json`
- `feature-coverage.json`

大量の実行結果や一時 TSV は置かない。

## 8. 導入順

1. `packages/core` の AST / validator / coverage analyzer を作る
2. `tests/fixtures/golden` で exact な最小ケースを固める
3. `.work/pict/test` を `tests/fixtures/upstream` に正規化する
4. `check-feature-coverage.ts` を入れる
5. 最後に `worker` と `web` の薄い統合テストを足す
