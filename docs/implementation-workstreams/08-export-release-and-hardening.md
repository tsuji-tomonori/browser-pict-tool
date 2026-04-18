# 08. Export, Release, and Hardening

## 1. 役割

出力整形、性能確認、release 準備、運用文書をまとめる。Gate B 後に本格化する。

## 2. 主担当範囲

- exporters
- perf measurement
- packaging / hosting
- release checklist
- final docs sync

## 3. 所有ファイル

- `packages/core/exporters/**`
- release 用 script
- hosting 設定
- release / perf 関連 docs

## 4. タスク

### Gate B 後に並列で進められるもの

- TSV exporter
- CSV exporter
- Markdown exporter
- perf smoke script
- static hosting 前提の build / preview
- CSP / privacy posture の確認

### Final Integration 直前に進めるもの

- release checklist
- known limitations
- sample model 整備
- final docs sync

## 5. 並列しない方がよいもの

- `04` と同時に result 型を変更する変更
- `07` と同時に export UI 契約を変える変更

## 6. 依存

- 着手条件: Gate B 通過
- `07` と export contract を共有する
- `06` と perf / release の検証条件を合わせる

## 7. 完了条件

- exporter が browser から使える
- perf smoke が自動で回る
- static hosting 前提の配備が成立する
- release 文書と実装が一致する

## 8. レビュー観点

- exporter が UI と密結合しすぎていないか
- perf 測定が再現可能か
- release 手順が人手依存になりすぎていないか
