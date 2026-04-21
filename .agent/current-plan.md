# Current Plan

## Goal
- Web UI を DADS / WAIC 観点の改善方針に沿って、キーボード操作・状態通知・可視ラベル・日本語表記を強化する。

## Scope
1. `packages/web/index.html` のラベル/説明/状態通知/日本語文言を改善
2. `packages/web/src/main.ts` の診断要約、`aria-invalid`、セルコピー button 化、列幅調整のキーボード対応を実装
3. `packages/web/src/styles.css` のフォーカス視認性、ターゲットサイズ、reduced motion / forced colors 対応を追加
4. web 層の型チェック・ビルドで受入判定

## Acceptance Criteria
- キーボードでセルコピーと列幅調整（左右キー）が可能であること
- 主要入力項目に可視ラベル/説明があり、診断時に `aria-invalid` が更新されること
- 英語 UI ラベルの主要箇所を日本語化し、進捗通知の責務分離を反映すること
- `npm --prefix packages/web run check` と `npm --prefix packages/web run build` が通ること
