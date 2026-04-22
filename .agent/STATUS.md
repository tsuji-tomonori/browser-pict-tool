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
  - Go (web check/build passed)

## 2026-04-21 Update (Security Issue Registration)

- Phase: Planning
- Active package: docs/security
- Decisions:
  - セキュリティ改善を SEC-001〜SEC-006 の6 Issueに分解
  - M1 を High/Critical に集中させる段階導入を採用
- Commands run:
  - mkdir -p docs/security/issues
  - markdown issue files creation
- Blockers:
  - GitHub Issue API/CLI が環境上未設定のため、リポジトリ内レジスタとして登録
- Acceptance state:
  - Go (issue decomposition and registration docs completed)
  - Go (isolated web install/build と web check が通過)
