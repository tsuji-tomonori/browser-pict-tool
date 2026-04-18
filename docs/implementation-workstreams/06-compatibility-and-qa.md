# 06. Compatibility and QA

## 1. 役割

upstream fixture を正規化し、acceptance gate を組み、実装進捗を可視化する。機能実装そのものよりも、互換性の測り方を作るトラック。

## 2. 主担当範囲

- upstream fixture harness
- semantic comparator
- feature coverage
- CI gate
- regression report

## 3. 所有ファイル

- `tests/**`
- `scripts/**`
- `docs/upstream-pict-test-matrix-ja.md`
- CI 設定ファイル

## 4. タスク

### Wave 1 から並列で進められるもの

- `tests/generated/upstream-index.json` を使う harness 作成
- `required_v0_1` 抽出
- parser / validator 単体 fixture の整理
- semantic comparator の設計
- CI で core test を回す導線追加

### Wave 2 で進めるもの

- `required_v0_1` を fail-fast gate 化
- `reference_regression` を report-only で回す
- coverage summary のレポート出力
- fixture integrity の継続チェック

### Wave 3 で進めるもの

- deferred feature ごとの gate 追加
- browser / worker integration test 追加
- perf smoke の導入

## 5. 並列しない方がよいもの

- `01` / `02` / `03` / `04` の API 変更と同じタイミングで gate 条件も変えること
- feature 実装途中に upstream expectation を動かすこと

## 6. 依存

- 着手条件: `01` 完了
- `02`, `03`, `04`, `07`, `08` と継続的に連携する

## 7. 完了条件

- `required_v0_1` の gate が自動化される
- regression と deferred の可視化がある
- PR ごとに何が壊れたか分かる

## 8. レビュー観点

- exact compare と semantic compare が混ざっていないか
- phase 分離が CI 設計に反映されているか
- upstream case の分類変更が十分説明されているか
