# 02. Parser and Diagnostics

## 1. 役割

PICT モデルテキストを AST に落とし、syntax error と source location を返す。

## 2. 主担当範囲

- model section parser
- parameter parser
- sub-model parser
- constraint tokenizer / parser
- syntax diagnostic

## 3. 所有ファイル

- `packages/core/parser/**`
- `tests/core/**/*parse*`

## 4. タスク

### Gate A 前に並列で進められるもの

- parameter line の permissive parser 完成
- empty parameter / empty value の扱いを upstream 相当に寄せる
- alias の構文パース
- negative prefix の構文パース
- sub-model の構文パース
- recursive descent constraint parser 完成
- `NOT LIKE`, `NOT IN` を含む operator parser 完成
- function syntax を追うなら `IsPositive` / `IsNegative` の parser 追加
- syntax error code と location を安定化する

### Gate A までに終えるべきもの

- `parseModelText()` の戻り型確定
- parser 側で warning にしないこと。warning は semantic へ寄せる
- raw constraint text と constraint span の扱い確定

### Gate B 後でよいもの

- repo extension を増やす parser 追加
- advanced permissive syntax の拡張

## 5. 並列しない方がよいもの

- `05` と同時に parser 仕様を広げる変更
- `01` と同時に AST 型を書き換える変更

## 6. 依存

- 着手条件: `01` 完了
- 依存先: `03`, `04`, `06`, `07`

## 7. 完了条件

- `required_v0_1` に必要な parser 構文がすべて通る
- syntax error に line/column が付く
- parser 単体テストが green
- Gate A で API を固定できる

## 8. レビュー観点

- token 境界が upstream と大きくずれていないか
- section 遷移が `.work/pict` に近いか
- permissive parser が validator の責務を奪っていないか
