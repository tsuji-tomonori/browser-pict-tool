# browser-pict-tool

PICT 互換の parser / validator / generator を browser 上で扱うための作業リポジトリ。

## 開発コマンド

- `npm run lint`: ESLint と `packages/core` の公開契約チェックを実行する
- `npm run typecheck`: `packages/core` と `packages/web` の TypeScript を検証する
- `npm run test`: core の Node テストを実行する
- `npm run check`: lint, typecheck, test をまとめて実行する

## 実行ポリシー

- Node は 22 系を前提にする
- `.ts` を Node から直接走らせる箇所は、当面 `node --experimental-strip-types` を正式運用とする
- core の安定 import 面は `@browser-pict-tool/core` と subpath exports に寄せる

## Core Entry Points

- `@browser-pict-tool/core`
- `@browser-pict-tool/core/parser`
- `@browser-pict-tool/core/constraints`
- `@browser-pict-tool/core/model`
- `@browser-pict-tool/core/diagnostics`
