# 07. Worker and Web

## 1. 役割

core を browser から使える形に包み、UX を作る。Wave 1 から shell は始められるが、real engine integration は Gate A / Gate B 後に進める。

## 2. 主担当範囲

- worker protocol
- progress / cancel
- web UI shell
- editor / diagnostics / result table
- file import / export UI

## 3. 所有ファイル

- `packages/worker/**`
- `packages/web/**`

## 4. タスク

### Wave 1 から並列で進められるもの

- app shell
- editor UI
- diagnostics panel
- result table shell
- worker protocol の型
- mock engine を使った画面接続

### Gate A 後に進めるもの

- parse / validate を real core に接続
- worker から diagnostic を返す
- generate button / cancel button の wiring

### Gate B 後に進めるもの

- generate result の real integration
- stats / coverage summary 表示
- export UI と exporter 接続
- large result 向け仮想スクロール

## 5. 並列しない方がよいもの

- `04` と同時に generate result 型を自由に変える変更
- `08` と同時に export payload 型を変更する変更

## 6. 依存

- 着手条件: `01` 完了で shell は開始可能
- real core integration は Gate A と Gate B に依存

## 7. 完了条件

- UI から parse / validate / generate / export が一連で動く
- worker 経由で cancel と progress が動く
- model 内容をネットワーク送信しない前提で動作する

## 8. レビュー観点

- mock と real integration の境界が明確か
- UI が core の内部型に直接依存しすぎていないか
- long-running generation でも main thread を塞がないか
