# Current Plan

## Goal
- 既定生成経路に lazy coverage を配線し、invalid tuple 指標の定義を verifier 側で明確化したうえで受入判定まで進める。

## Scope
1. `generateTestSuite` / `generateSuiteStreaming` の既定経路を lazy coverage 化
2. web engine の preview / streaming 保存経路で lazy coverage を明示
3. verifier 指標を `excludedInvalidTupleCount` として定義し、互換のため `invalidTupleTargetedCount` を同値で返却
4. 回帰テスト更新と受入判定

## Acceptance Criteria
- 既定経路 (`generateSuiteStreaming(...,{})`) が lazy coverage と同等の結果を返すこと
- verifier が invalid tuple を「除外件数」として報告すること
- 既存 verifier 利用側互換 (`invalidTupleTargetedCount`) を維持すること
- 変更レイヤー（core/web）で型チェックと対象テストが通ること
