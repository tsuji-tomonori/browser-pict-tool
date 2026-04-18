# browser-pict-tool 実装分担計画

このディレクトリは、`browser-pict-tool` を完全体まで実装するための分担計画をまとめたものだ。

目的は次の 3 つ。

- 並列に進められる仕事と、順番を守るべき仕事を分ける
- 複数人が同じファイルを同時に触って衝突しないようにする
- マージ順序と受け渡し条件を明確にする

## 1. ファイル一覧

- [01-foundation-and-contracts.md](./01-foundation-and-contracts.md)
- [02-parser-and-diagnostics.md](./02-parser-and-diagnostics.md)
- [03-constraints-and-validation.md](./03-constraints-and-validation.md)
- [04-generator-core.md](./04-generator-core.md)
- [05-advanced-features.md](./05-advanced-features.md)
- [06-compatibility-and-qa.md](./06-compatibility-and-qa.md)
- [07-worker-and-web.md](./07-worker-and-web.md)
- [08-export-release-and-hardening.md](./08-export-release-and-hardening.md)

## 2. 分担の基本原則

- 1 つの作業トラックに 1 つの主担当を置く
- 主担当以外は、そのトラックの所有ファイルを原則触らない
- 共有境界を変える変更は、先に `01` の契約更新を入れてから各トラックで追従する
- parser / validator / generator の public API を変える変更は、必ず overview の波に従う

## 3. 所有ファイル

| トラック | 主担当ディレクトリ                                               | 補助ディレクトリ                           |
| -------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `01`     | ルート設定、`packages/core/model`, `packages/core/diagnostics`   | `docs/core-v0.1-implementation-note-ja.md` |
| `02`     | `packages/core/parser`                                           | `tests/core` の parser 系                  |
| `03`     | `packages/core/constraints`                                      | `tests/core` の validator/evaluator 系     |
| `04`     | `packages/core/generator`, `packages/core/coverage`              | `tests/core` の generator 系               |
| `05`     | advanced feature 用の `packages/core/**` 横断変更                | `docs/pict-model-grammar-user-guide.md`    |
| `06`     | `tests/**`, `scripts/**`, `docs/upstream-pict-test-matrix-ja.md` | CI 設定                                    |
| `07`     | `packages/worker/**`, `packages/web/**`                          | UI 用 fixture                              |
| `08`     | `packages/core/exporters/**`, release 文書, perf 計測            | root scripts, hosting 周り                 |

## 4. 並列できる波

### Wave 0: 非並列

- `01` Foundation and Contracts

理由:

- root 設定、TypeScript 実行基盤、core 型境界が未確定だと他トラックがすぐ衝突する

### Wave 1: 並列可能

- `02` Parser and Diagnostics
- `03` Constraints and Validation
- `06` Compatibility and QA
- `07` Worker and Web

着手条件:

- `01` で root 設定と core 型の初版がマージ済み

注意:

- `07` はこの波では shell と mock 接続までに留める
- `06` は harness と fixture 整備を先に進める

### Gate A: 非並列

- parser / validator の core API 固定

ここで固定するもの:

- `parseModelText()` の戻り型
- `validateModelDocument()` の戻り型
- diagnostic code の命名規約
- normalized model へ渡す前の AST 形

### Wave 2: 並列可能

- `04` Generator Core
- `06` Compatibility and QA
- `07` Worker and Web

着手条件:

- Gate A 通過

注意:

- `07` はここから real engine 接続に進んでよい
- `06` は `required_v0_1` の gate 化を進める

### Gate B: 非並列

- generator API 固定

ここで固定するもの:

- normalized model 型
- generate request / response 型
- stats / coverage summary 型

### Wave 3: 並列可能

- `05` Advanced Features
- `07` Worker and Web
- `08` Export, Release, and Hardening
- `06` Compatibility and QA

着手条件:

- Gate B 通過

### Final Integration: 非並列

- 最終結合
- perf / regression / release 判定

## 5. 並列できない組み合わせ

次の組み合わせは同時に走らせない方がよい。

- `01` と、他トラックの root 設定変更
- `02` と `05` の parser 同時改修
- `03` と `05` の constraint semantic 同時改修
- `04` と `05` の generator 同時改修
- `06` の gate 条件変更と `01/02/03/04` の API 変更を同一タイミングで merge

## 6. 推奨人数

### 4 人体制

- 担当 A: `01` + `02`
- 担当 B: `03` + `04`
- 担当 C: `06`
- 担当 D: `07` + `08`

`05` は Gate B 後に A/B のどちらかへ寄せる。

### 6 人体制

- 担当 A: `01`
- 担当 B: `02`
- 担当 C: `03`
- 担当 D: `04`
- 担当 E: `06`
- 担当 F: `07` + `08`

`05` は Gate B 後に B/C/D のいずれかへ再配置する。

### 8 人体制

- 各ファイルを 1 人 1 トラックで割り当てる

## 7. マージ順

1. `01`
2. `02`, `03`, `06`, `07(shell)` を並列
3. Gate A
4. `04`, `06`, `07(real integration)` を並列
5. Gate B
6. `05`, `06`, `07`, `08` を並列
7. Final Integration

## 8. 完了条件

- `required_v0_1` の acceptance gate が通る
- worker 経由の generate が動く
- web UI から parse / validate / generate / export が一連で動く
- deferred 項目は phase ごとに独立して有効化できる
- repo extension は別フラグまたは別 phase として整理されている
