# `tests/fixtures/upstream`

このディレクトリには `.work/pict/test` から取り込んだ upstream fixture を置く。

基本方針:

- 1 case を 1 ディレクトリに展開する
- 手書きではなく `scripts/materialize-upstream-fixtures.ts` で再生成する
- `--phase` 未指定時は `required_v0_1` だけを置く
- 再生成時は既知の upstream case ディレクトリを掃除してから作り直す

代表レイアウト:

```text
tests/fixtures/upstream/arg/arg-001/
  manifest.json
  model.pict
```

補助生成物:

- 索引: `tests/generated/upstream-index.json`
- 集計: `tests/generated/upstream-summary.json`
- 実体化 summary: `tests/generated/materialized-fixtures-summary.json`

形式と運用ルールは `docs/testing-architecture-ja.md` の「5. Upstream fixture の正規化」を基準にする。
