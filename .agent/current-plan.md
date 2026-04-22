# Current Plan

## Goal
- `main` マージ時のみ発生する web build 失敗（`../../node_modules/vite/bin/vite.js` 不在）を解消し、PR 時点の品質ゲートで同種の不整合を検知できるようにする。

## Scope
1. `packages/web/package.json` の script を npm ローカルバイナリ解決（`vite` / `tsc` / `playwright`）に変更し、ルート `node_modules` 依存を除去
2. `.github/workflows/quality-gateway.yml` に isolated web install + build を追加して、デプロイ相当条件を PR 時に検証
3. ローカルで web build と workflow YAML の妥当性を確認

## Acceptance Criteria
- `npm --prefix packages/web run build` が `packages/web` 単独 install 条件でも成功すること
- quality gateway に isolated web build ジョブが追加され、PR で実行されること
- 既存 root install 前提ジョブと競合しないこと
