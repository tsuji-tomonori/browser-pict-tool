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

---

## 2026-04-22 SEC-001 Spreadsheet Formula Injection Hardening

### Goal

- CSV/TSV/Excel エクスポートで式トリガー文字始まりのセル評価を防止し、安全なデフォルトを統一する。

### Scope

1. `packages/core/exporters` に neutralize ユーティリティを追加し、CSV/TSV エンコーダに適用
2. `packages/web/src/lib/excel-export.ts` で同一ポリシーを適用
3. `tests/core/exporters.test.ts` にトリガー文字・通常値・CSV escaping 併用の回帰テストを追加
4. `docs/security/issues/SEC-001-*.md` に互換性影響を記載

### Acceptance Criteria

- `=`, `+`, `-`, `@` で始まるセル値が `'` プレフィックス付きで出力される
- CSV の既存 quoting/escaping（`,` / `"` / 改行）が維持される
- `node --experimental-strip-types --test tests/core/*.test.ts` と `task check` が通る
