# `scripts`

このディレクトリには次の補助スクリプトを置く。

- `import-upstream-pict-tests.ts`
- `materialize-upstream-fixtures.ts`
- `check-feature-coverage.ts`
- `check-fixture-integrity.ts`

## 現在あるスクリプト

### `import-upstream-pict-tests.ts`

`.work/pict/test/.tests` と各カテゴリ配下の `.tests` を読み、次を生成する。

- `tests/generated/upstream-index.json`
- `tests/generated/upstream-summary.json`

実行例:

```bash
node --experimental-strip-types scripts/import-upstream-pict-tests.ts
```

### `materialize-upstream-fixtures.ts`

`tests/generated/upstream-index.json` を読み、選択 phase の case を
`tests/fixtures/upstream/<category>/<case-id>/` に実体化する。

生成物:

- `tests/fixtures/upstream/**/manifest.json`
- `tests/fixtures/upstream/**/model.pict`
- `tests/fixtures/upstream/**/row-seed-*.{sed,txt,...}`
- `tests/generated/materialized-fixtures-summary.json`

補足:

- 既知の upstream case ディレクトリは再生成前に掃除する
- `--phase` 未指定時は `required_v0_1` だけを実体化する

実行例:

```bash
node --experimental-strip-types scripts/materialize-upstream-fixtures.ts
node --experimental-strip-types scripts/materialize-upstream-fixtures.ts --phase=required_v0_1,deferred_v0_2
```

### `check-fixture-integrity.ts`

`tests/generated/upstream-index.json` と
`tests/generated/materialized-fixtures-summary.json` を基準に、
実体化済み fixture の整合性を検査する。

検査内容:

- summary の件数と phase 集計が upstream index と一致すること
- `tests/fixtures/upstream/**/manifest.json` が存在し内容が index と一致すること
- `model.pict` と `row-seed-*` が manifest と一致して存在すること
- summary にない fixture ディレクトリが紛れ込んでいないこと

実行例:

```bash
node --experimental-strip-types scripts/check-fixture-integrity.ts
```

### `check-feature-coverage.ts`

`docs/pict-compatibility-factors.pict` の
`SupportPhase / UpstreamCoverageBucket / FixtureReadiness` に対応する形で、
upstream index と materialized fixture の欠落を集計する。

生成物:

- `tests/generated/feature-coverage.json`

主な確認内容:

- `required_v0_1` が fully materialized か
- `deferred_v0_2 / deferred_v0_3 / repo_extension_non_goal / reference_regression` に
  何件の未 materialized case が残っているか

実行例:

```bash
node --experimental-strip-types scripts/check-feature-coverage.ts
```
