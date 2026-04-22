# Current Plan

## Goal
- `main` マージ時のみ発生する web build 失敗（`../../node_modules/vite/bin/vite.js` 不在）を解消し、PR 時点の品質ゲートで同種の不整合を検知できるようにする。

## Scope
1. `packages/web/package.json` の script を npm ローカルバイナリ解決（`vite` / `tsc` / `playwright`）に変更し、ルート `node_modules` 依存を除去
2. `.github/workflows/quality-gateway.yml` に isolated web install + build を追加して、デプロイ相当条件を PR 時に検証
3. ローカルで web build と workflow YAML の妥当性を確認

## Acceptance Criteria
- キーボードでセルコピーと列幅調整（左右キー）が可能であること
- 主要入力項目に可視ラベル/説明があり、診断時に `aria-invalid` が更新されること
- 英語 UI ラベルの主要箇所を日本語化し、進捗通知の責務分離を反映すること
- `npm --prefix packages/web run check` と `npm --prefix packages/web run build` が通ること

---

## 2026-04-21 Security Hardening Planning (Issue Decomposition)

### Goal
- 脅威モデルを実装可能なセキュリティ Issue 群へ分割し、優先度・受入条件・検証コマンドを固定化する。

### Deliverables
1. `docs/security/ISSUE-REGISTER.md` に優先順付きの台帳を作成
2. `docs/security/issues/SEC-001..006` に個別 Issue 定義を作成
3. M1/M2/M3 のマイルストーン分類を設定

### Acceptance Criteria
- 6件の Issue が Scope / Tasks / AC / Validation を含んで定義されている
- 実行順と依存関係がレジスタ上で判別できる
- 既存計画（アクセシビリティ改善）の記述を壊さない
- `npm --prefix packages/web run build` が `packages/web` 単独 install 条件でも成功すること
- quality gateway に isolated web build ジョブが追加され、PR で実行されること
- 既存 root install 前提ジョブと競合しないこと
