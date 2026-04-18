# Upstream PICT テストマトリクス

この文書は `.work/pict/test` を browser-pict-tool の互換テスト基準としてどう扱うかを整理したものである。

生データの正規化結果は次を参照する。

- [tests/generated/upstream-index.json](/home/t-tsuji/project/browser-pict-tool/tests/generated/upstream-index.json:1)
- [tests/generated/upstream-summary.json](/home/t-tsuji/project/browser-pict-tool/tests/generated/upstream-summary.json:1)

再生成コマンド:

```bash
node --experimental-strip-types scripts/import-upstream-pict-tests.ts
```

## 1. 集計結果

現時点の upstream inventory は次のとおり。

- artifact files: `316`
- command cases: `605`

support phase ごとの件数:

- `required_v0_1`: `313`
- `deferred_v0_2`: `132`
- `deferred_v0_3`: `57`
- `repo_extension_non_goal`: `26`
- `reference_regression`: `77`

ここでの `command cases` は `.tests` に定義された CLI 実行単位であり、モデルファイル数そのものではない。

## 2. support phase の意味

- `required_v0_1`
  - v0.1 の受け入れ基準に含める
  - parser / constraints / diagnostics / basic CLI option の互換性を担保する
- `deferred_v0_2`
  - 公開仕様だが v0.1 では後回しにする
  - aliases / parameter reuse / submodels など
- `deferred_v0_3`
  - 公開仕様だが実装コストが高く後段導入に回す
  - weighting / seeding / randomize など
- `repo_extension_non_goal`
  - upstream repo 実装では確認できるが、公開仕様として追わない
  - `IsPositive` / `IsNegative` / `$RESULT` / hidden CLI など
- `reference_regression`
  - 大きい実モデルや歴史的回帰の参照コーパス
  - v0.1 の acceptance gate には直結させず、後段の回帰観測に使う

## 3. カテゴリ別マトリクス

| category | commands | artifacts | default phase             | 役割                                                               |
| -------- | -------: | --------: | ------------------------- | ------------------------------------------------------------------ |
| `root`   |       16 |         0 | `required_v0_1`           | CLI 起動と不正引数の最小 sanity                                    |
| `arg`    |      187 |        10 | `required_v0_1`           | `/o /d /a /n /r /c` など option 解釈。カテゴリ内に後段対応分も混在 |
| `cons`   |      107 |       100 | `required_v0_1`           | constraint parser / validator の本体                               |
| `para`   |       33 |        21 | `required_v0_1`           | parameter / value 定義、空白・空値など permissive parser           |
| `modl`   |       24 |        23 | `required_v0_1`           | セクション順、空行、モデル全体構成                                 |
| `prp`    |       11 |        10 | `required_v0_1`           | parameter-to-parameter comparison                                  |
| `term`   |       12 |        12 | `required_v0_1`           | 複数 term と論理結合                                               |
| `clus`   |       91 |        32 | `deferred_v0_2`           | sub-models / mixed-order                                           |
| `seed`   |       20 |        17 | `deferred_v0_3`           | row seeds, partial row, mismatch handling                          |
| `wght`   |        3 |         3 | `deferred_v0_3`           | weighting                                                          |
| `func`   |       21 |        18 | `repo_extension_non_goal` | `IsPositive` / `IsNegative` 系                                     |
| `bug`    |       26 |        19 | `reference_regression`    | 歴史的バグ再発防止。カテゴリ横断の回帰                             |
| `real`   |       36 |        30 | `reference_regression`    | 実モデル回帰。`real201` は `$RESULT` を含む                        |
| `+real`  |        6 |         6 | `reference_regression`    | 重めの実モデル回帰                                                 |
| `+perf`  |       12 |        15 | `reference_regression`    | perf / 大規模モデルの参照ケース                                    |

## 4. v0.1 でまず gate する範囲

v0.1 の acceptance gate は、次を優先する。

- `root`
- `arg` のうち `required_v0_1` に分類されたコマンド
- `cons`
- `para`
- `modl`
- `prp`
- `term`

この粒度で見ると、v0.1 で直接追う command cases は `313` 件ある。

`arg` カテゴリは mixed なので、カテゴリ丸ごとではなく `tests/generated/upstream-index.json` の `supportPhase` を見て選別する。

## 5. 後段に回す範囲

### 5.1 v0.2

- aliases
- parameter reuse
- sub-models

主な参照カテゴリ:

- `clus`
- `arg` の `/a` 関連
- `para` / `modl` の一部

### 5.2 v0.3

- seeding
- weighting
- randomize

主な参照カテゴリ:

- `seed`
- `wght`
- `arg` の `/r` 関連

## 6. 非 goal と参照コーパス

### 6.1 repo extension non-goal

明示的に追わないもの:

- `func` カテゴリ
- `real201` が使う `$RESULT`
- hidden CLI (`/f /p /x /v`)
- inline parameter order (`Param @ N:`) を含む repo 独自解釈

これらは `pict.exe` の repo 実装由来であり、公開仕様互換の最小定義には含めない。

### 6.2 reference regression

`bug`, `real`, `+real`, `+perf` は acceptance gate の第 1 群ではない。ただし次の価値がある。

- parser / generator の実運用近い回帰を拾える
- 互換範囲を広げるたびに追加で pass を増やせる
- semantic compatibility の観測コーパスとして使える

## 7. 実装上の使い方

- fixture import の source-of-truth は `.tests`
- 個別ケースの canonical な分類は `tests/generated/upstream-index.json` の `supportPhase` を使う
- docs や CI 集計は `tests/generated/upstream-summary.json` を参照する
- v0.1 の CI gate は `required_v0_1` のみ fail-fast にする
- `reference_regression` は report-only から始める

## 8. 注意点

- このマトリクスは「upstream 互換テストをどこまで gate にするか」の整理であり、PICT の文法定義そのものではない
- `arg` や `bug` はカテゴリ内で feature が混ざるため、カテゴリ名だけではなく command 単位の `supportPhase` を見る必要がある
- upstream の expected result は exit code 期待であり、browser-pict-tool 側ではそれを semantic diagnostics へ写像する必要がある
