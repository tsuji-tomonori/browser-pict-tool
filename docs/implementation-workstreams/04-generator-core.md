# 04. Generator Core

## 1. 役割

normalized model から constraint-aware な pairwise / n-wise ケースを生成する。完全体の心臓部。

## 2. 主担当範囲

- normalized model
- pairwise generator
- general n-wise
- negative testing rule
- no-solution / impossible model handling
- coverage 集計の初版

## 3. 所有ファイル

- `packages/core/generator/**`
- `packages/core/coverage/**`
- `tests/core/**/*generate*`

## 4. タスク

### Gate A 後に並列で進められるもの

- validated model から normalized model への変換
- tuple 列挙
- pairwise deterministic generator
- statistics 初版
- negative value の同居防止

### Gate B までに終えるべきもの

- generate API の固定
- coverage summary 型の固定
- no-solution / generation failure の診断整理

### Gate B 後に進めるもの

- n-wise の一般化
- `max` 対応
- heuristic 改善
- larger model 向け最適化

## 5. 並列しない方がよいもの

- `05` と同時に aliases / reuse / sub-model / weight / seed を generator へ入れる変更
- `08` と同時に exporter 向け result 型を変える変更

## 6. 依存

- 着手条件: Gate A 通過
- `02`, `03` の出力に依存
- `07`, `08`, `06` がこのトラックの API を使う

## 7. 完了条件

- pairwise が deterministic に動く
- basic n-wise へ拡張可能な構造になっている
- required v0.1 の主要ケースに対して semantic acceptance が取れる
- Gate B で API を固定できる

## 8. レビュー観点

- output exact match を追いすぎていないか
- constraint-aware generation が coverage を壊していないか
- result 型が UI / exporter / worker に使いやすいか
