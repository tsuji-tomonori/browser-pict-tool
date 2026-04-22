# SEC-003: XSS 回帰防止ルールを導入する

- Severity: Critical/High
- Area: `packages/web/src/main.ts`, rendering helpers
- Goal: ユーザー入力を DOM に反映する経路での未エスケープ挿入を継続的に防止する。

## Background

現在は `escapeHtml` と CSP により対策されているが、`innerHTML` の増加や新規表示経路で回帰する可能性がある。

## Scope

- 表示経路の棚卸し。
- `innerHTML` 使用箇所の安全規約化。
- 回帰検知のテスト/静的チェック導入。

## Tasks

1. `main.ts` の DOM 書き込み API を一覧化。
2. 安全な描画ヘルパーに寄せる（可能なら `textContent` 優先）。
3. XSS payload fixture で UI 回帰テストを追加。
4. 「新規 `innerHTML` 追加時のレビュー観点」を docs に追記。

## Acceptance Criteria

- 代表的 XSS 文字列（`<script>`, event handler, URL scheme）が実行されない。
- すべてのユーザー入力由来表示が規約に従っている。
- 回帰検知テストが CI で実行される。

## Validation

- `npm --prefix packages/web run check`
- `npm --prefix packages/web run build`
- `task check`
