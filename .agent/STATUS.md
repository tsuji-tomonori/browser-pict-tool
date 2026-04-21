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
