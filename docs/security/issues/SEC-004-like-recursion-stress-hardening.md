# SEC-004: LIKE/再帰ストレス耐性を強化する

- Severity: Medium
- Area: `packages/core/parser/*`, `packages/core/constraints/*`, `packages/core/oracle/*`
- Goal: 極端な LIKE パターンや深いネストによる CPU/stack 圧迫を抑制する。

## Scope

- LIKE 変換時のパターン長・複雑度制限。
- 再帰深さ上限または反復化可能箇所の見直し。
- エラー分類（入力不正 vs リソース保護）を明確化。

## Tasks

1. 最大パターン長・最大ネスト深さの閾値を定義。
2. parser/oracle の該当箇所で閾値チェック。
3. 境界値テストと病理ケーステストを追加。

## Acceptance Criteria

- 閾値超過入力で予測可能なエラーを返す。
- 正常入力への後方互換性を維持する。

## Validation

- `node --experimental-strip-types --test tests/core/*.test.ts`
- `task check`
