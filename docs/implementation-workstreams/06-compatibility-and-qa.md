# 06. Compatibility and QA

## 1. 役割

upstream fixture を正規化し、acceptance gate を組み、実装進捗を可視化する。機能実装そのものよりも、互換性の測り方と shared QA harness を作るトラック。

## 2. 主担当範囲

- upstream fixture harness
- semantic comparator
- feature coverage
- CI gate
- regression report

## 3. 所有ファイル

- `tests/fixtures/upstream/**`
- `tests/generated/**`
- `tests/helpers/**`
- `scripts/import-upstream-pict-tests.ts`
- `scripts/materialize-upstream-fixtures.ts`
- `scripts/check-fixture-integrity.ts`
- `scripts/check-feature-coverage.ts`
- `scripts/README.md`
- `docs/testing-architecture-ja.md`
- `docs/upstream-pict-test-matrix-ja.md`
- `docs/pict-compatibility-factors.pict`
- CI 設定ファイル

`tests/core/**/*parse*`, `tests/core/**/*validate*`, `tests/core/**/*generate*` のような feature 実装に密着したテストは、このトラックではなく各実装トラックが持つ。

## 4. タスク

### Wave 1 から並列で進められるもの

- `import-upstream-pict-tests.ts` で `tests/generated/upstream-index.json` / `upstream-summary.json` を再生成できる状態にする
- `materialize-upstream-fixtures.ts` で `required_v0_1` を `tests/fixtures/upstream/**` に実体化できるようにする
- `check-fixture-integrity.ts` で index / summary / materialized fixture の整合性を検査できるようにする
- parser / validator の upstream fixture の assertion mode と manifest 形式を固める
- semantic comparator の設計を固める
- CI で core test と fixture integrity を回す導線を追加する

### Wave 2 で進めるもの

- `required_v0_1` を fail-fast gate 化する
- `reference_regression` を report-only で回す
- `check-feature-coverage.ts` で `tests/generated/feature-coverage.json` を出力する
- `docs/upstream-pict-test-matrix-ja.md` の phase 分類と CI 集計を同期する
- fixture integrity の継続チェックを CI に組み込む

### Wave 3 で進めるもの

- deferred feature ごとの gate を追加する
- browser / worker integration test を追加する
- perf smoke を `08` と分担して導入する

## 5. 並列しない方がよいもの

- `01` / `02` / `03` / `04` の API 変更と同じタイミングで gate 条件も変えること
- feature 実装途中に upstream expectation を動かすこと

## 6. 依存

- 着手条件: `01` 完了
- `02`, `03`, `04` とは public API を固定したうえで upstream expectation をすり合わせる
- `07` とは browser / worker smoke の責務境界を合わせる
- `08` とは perf smoke と release gate の責務を合わせる

## 7. 完了条件

- `required_v0_1` の gate が自動化される
- regression と deferred の可視化がある
- PR ごとに何が壊れたか分かる

## 8. レビュー観点

- exact compare と semantic compare が混ざっていないか
- phase 分離が CI 設計に反映されているか
- upstream case の分類変更が十分説明されているか
