# STATUS

- Phase: Acceptance
- Active package: web
- Decisions:
  - 既存 1 画面フローは維持しつつ、フォーム/結果テーブルのアクセシビリティ属性を拡張する
  - セルコピーは `td` クリックから `button` 操作へ変更する
  - 列幅変更はドラッグを維持しつつ、`ArrowLeft/ArrowRight` での調整を追加する
- Commands run:
  - npm install
  - npm --prefix packages/web install
  - npm --prefix packages/web run check
  - npm --prefix packages/web run build
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
