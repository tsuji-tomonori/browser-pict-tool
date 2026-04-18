# Core v0.1 実装メモ

このメモは、`browser-pict-tool` の最初の core 実装で固定する境界だけを短く定義する。

## 1. 目的

最初の実装スライスでは、`packages/core` に次を作る。

- モデルテキストの構文解析
- 制約 AST の構築
- 基本的な semantic validation
- upstream `required_v0_1` の代表ケースを通すための診断基盤

この段階では generator はまだ作らない。

## 2. 今回の in-scope

- parameter definitions
- permissive な parameter line
  - `Param: A, B`
  - `Param, A, B`
  - 空 parameter 名
  - 空 value
- negative prefix
- aliases の機械的パース
- sub-model の機械的パース
- constraints
  - `IF / THEN / ELSE`
  - invariant
  - `AND / OR / NOT`
  - `= <> > >= < <=`
  - `LIKE / NOT LIKE`
  - `IN / NOT IN`
  - parameter-to-parameter comparison
- case-sensitive / insensitive な名前解決
- 基本 validation
  - duplicate parameter names
  - all-negative parameter
  - unknown parameter warning
  - type mismatch
  - `LIKE` misuse
  - self comparison

## 3. 今回の out-of-scope

- generator
- coverage analyzer
- exporters
- seeding
- weighting の生成効果
- parameter reuse の展開
- sub-model の生成意味論
- hidden CLI option

parser は将来互換のため一部の repo 拡張を受理してもよいが、acceptance gate は `required_v0_1` を優先する。

## 4. データフロー

```text
text model
  -> parseModelText()
  -> ModelDocument + parse diagnostics
  -> validateModelDocument()
  -> ValidationResult + semantic diagnostics
```

### 4.1 実行ポリシー

- root の `typecheck` / `test` / `lint` は `package.json` と `Taskfile.yaml` に固定する
- Node 実行は 22 系を前提にする
- `.ts` の直接実行は当面 `node --experimental-strip-types` を正式運用とする
- stable import path は `@browser-pict-tool/core` と subpath exports に揃える

## 5. 内部境界

### 5.1 `packages/core/model`

- AST
- parse option 型
- validation result 型
- generation result 型の初版

固定する top-level result 型:

- `ParseModelResult`
- `ValidationResult`
- `GenerateResult`

### 5.2 `packages/core/diagnostics`

- 診断型
- source span / line-column 位置

### 5.3 `packages/core/parser`

- 行指向の model section parser
- recursive descent constraint parser

### 5.4 `packages/core/constraints`

- parameter type inference
- constraint semantic validation
- warning-drop constraint の判定

### 5.5 `packages/core/package.json`

- root export
- `./parser`
- `./constraints`
- `./model`
- `./diagnostics`

## 6. 診断方針

- syntax error は `error`
- unknown parameter は `warning`
- warning 付き constraint は effective constraint から落とす
- semantic mismatch は `error`

## 7. 次のスライス

このスライスの後は次の順で進める。

1. `packages/core/model` に generator 用の normalized model を入れる
2. pairwise generator を実装する
3. constraint evaluator と coverage calculator をつなぐ
4. upstream `required_v0_1` fixture を拡大する
