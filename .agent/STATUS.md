# STATUS

- Phase: Acceptance
- Active package: web / repo workflow
- Decisions:
  - `packages/web` scripts から `../../node_modules/*` 参照を除去し、npm script 標準 PATH 解決に統一する
  - PR の品質ゲートに、`deploy-pages.yml` と同等の `npm --prefix packages/web ci` + build 条件を追加する
- Commands run:
  - npm --prefix packages/web ci
  - npm --prefix packages/web run build
  - npm --prefix packages/web run check
- Blockers:
  - なし
- Acceptance state:
  - Go (isolated web install/build と web check が通過)
