# 03. Constraints and Validation

## 1. 役割

AST を semantic に検証し、warning-drop constraint と hard error を切り分ける。将来の exclusion compiler / evaluator の土台もここで作る。

## 2. 主担当範囲

- type inference
- duplicate / all-negative など model validation
- unknown parameter handling
- `LIKE` / `IN` の型検証
- parameter-to-parameter comparison validation
- constraint semantic normalization

## 3. 所有ファイル

- `packages/core/constraints/**`
- `tests/core/**/*validate*`

## 4. タスク

### Gate A 前に並列で進められるもの

- parameter type inference 完成
- duplicate parameter name validation
- all-negative parameter validation
- unknown parameter warning-drop 実装
- `LIKE` misuse の validation
- value/value-set type mismatch の validation
- self comparison validation
- parameter-to-parameter type mismatch validation

### Gate A 後に着手してよいもの

- constraint evaluator の 3 値論理
- exclusion compiler の初版
- restrictive constraint warning
- contradiction cleanup

### Gate B 後でよいもの

- advanced feature 用 semantic rule
- repo extension 用 semantic rule

## 5. 並列しない方がよいもの

- `02` と同時に AST 構造を変える変更
- `05` と同時に semantic rule を増やす変更

## 6. 依存

- 着手条件: `01` 完了
- `02` と並列可能
- `04` はこのトラックの出力を前提にする

## 7. 完了条件

- `validateModelDocument()` が安定した型を返す
- warning と error の分類が固定される
- Gate A で parser との境界が凍結できる
- evaluator / exclusion の下準備が終わる

## 8. レビュー観点

- parser が出した曖昧さを validator が正しく吸収しているか
- warning-drop の振る舞いが upstream 方針とズレていないか
- generator が必要とする normalized 情報が欠けていないか
