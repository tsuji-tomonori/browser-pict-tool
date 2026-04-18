# 01. Foundation and Contracts

## 1. 役割

このトラックは全体の土台を作る。最初の非並列トラックであり、他トラックの着手条件になる。

## 2. 主担当範囲

- ルート設定
- TypeScript 実行基盤
- test 実行基盤
- core の共通型
- diagnostic 共通型
- normalized API の契約初版

## 3. 所有ファイル

- `package.json`
- `tsconfig*.json`
- root scripts
- `Taskfile.yaml`
- `packages/core/model/**`
- `packages/core/diagnostics/**`
- `docs/core-v0.1-implementation-note-ja.md`

## 4. タスク

### 非並列で進めるもの

- ルートの `package.json` を作る
- `node --experimental-strip-types` 依存をやめるか、暫定運用方針を固定する
- `typecheck`, `test`, `lint` の task を定義する
- Node 実行前提の `tsconfig` を作る
- `packages/core` の entrypoint ルールを決める
- AST と diagnostic の共通型を固定する
- parse result / validation result / generation result の top-level 型を決める

### 他トラックと並列可能なもの

- `README` 系の説明更新
- root の軽微な script 整備

ただし、API 契約に触れる変更は並列にしない。

## 5. 完了条件

- `node` からテストが安定して実行できる
- `packages/core/model` と `packages/core/diagnostics` が他トラックの import 元として固定される
- `docs/core-v0.1-implementation-note-ja.md` が現実の API と一致している

## 6. 他トラックへの受け渡し

- `02` へ: parser が返す AST と diagnostic 型
- `03` へ: validator が受け取る AST と diagnostic 型
- `04` へ: normalized model の置き場所と top-level result 型
- `07` へ: worker protocol が包むべき core result 型
- `06` へ: test harness が参照する public API 名

## 7. レビュー観点

- 型が parser 実装に引っ張られすぎていないか
- 型が generator 実装に引っ張られすぎていないか
- warning と error の表現が一貫しているか
- SourceSpan / line-column の責務がぶれていないか
