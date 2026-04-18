# `packages/core`

PICT 互換ロジックの本体を置く。
ここは DOM 非依存の pure TypeScript 領域とし、Node 上のテストから直接呼び出す。

## 安定 entrypoint

- `@browser-pict-tool/core`
- `@browser-pict-tool/core/parser`
- `@browser-pict-tool/core/constraints`
- `@browser-pict-tool/core/model`
- `@browser-pict-tool/core/diagnostics`

`01 Foundation and Contracts` が責務を持つ public 型は `model` と `diagnostics` に集約し、parser / validator はその型を返す関数だけを公開する。
