# 05. Advanced Features

## 1. 役割

公開 PICT 互換の後段機能を段階的に実装する。parser / validator / generator を横断するため、Gate B 以降にまとめて入る。

## 2. 主担当範囲

- aliases の完全対応
- parameter reuse
- sub-models の生成意味論
- weighting
- seeding
- randomize / seed
- optional な repo extension

## 3. 所有ファイル

- `packages/core/**` の advanced feature 変更
- `tests/core/**` の feature test
- `docs/pict-model-grammar-user-guide.md`

## 4. タスク

### Gate B 後に並列で進められるもの

- aliases の semantic / generation 完成
- parameter reuse 展開
- sub-model mixed-order generation
- weighting heuristic
- seeding parser と seed row merge
- randomize / seed

### できれば小分けにするもの

- Feature A: aliases + reuse
- Feature B: sub-models
- Feature C: weighting
- Feature D: seeding + randomize

1 人なら順番に、複数人ならこの単位で branch を分ける。

### repo extension を追う場合

- `IsPositive` / `IsNegative`
- `$RESULT`
- hidden CLI
- `Param @ N:`

これは公開互換と混ぜず、別 PR 群にする。

## 5. 並列しない方がよいもの

- `02`, `03`, `04` の同時大改修
- coverage / exporter / UI 統合と同じ PR

## 6. 依存

- 着手条件: Gate B 通過
- `06`, `07`, `08` は各 feature ごとの API 凍結後に追従する

## 7. 完了条件

- deferred v0.2 / v0.3 項目が独立して有効化される
- public compatibility と repo extension が分離されている
- ドキュメントが実装現実と一致している

## 8. レビュー観点

- 1 回の PR に機能を詰め込みすぎていないか
- parser / validator / generator の差分が同時に大きくなりすぎていないか
- feature toggle や phase 分離が崩れていないか
