# Current Plan

## Goal

- 品質ゲートに Web E2E を組み込み、主要ユーザーフローの E2E カバレッジを拡充する。

## Scope

1. ルート品質ゲート (`npm run check` / `task check`) に E2E 実行を追加
2. `packages/web/tests/e2e/smoke.spec.ts` を拡張し、成功系以外の主要操作をカバー
3. 変更レイヤーに対する検証（lint/typecheck/core test/e2e）を実行して受入判定

## Acceptance Criteria

- `npm run check` が E2E を含んで実行されること
- E2E で以下を自動検証できること
  - 基本生成フロー成功
  - 不正入力時の診断表示
  - テーブルのフィルタ/並び替え
  - 列幅変更のキーボード操作
- 追加した検証がローカルで再実行可能な形で文書化されていること
