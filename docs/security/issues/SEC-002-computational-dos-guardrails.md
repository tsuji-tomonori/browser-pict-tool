# SEC-002: 計算量 DoS ガードレールを強化する

- Severity: High
- Area: `packages/core/generator/*`, `packages/core/oracle/*`, `packages/web/src/lib/engine.ts`, `packages/web/src/worker/worker.ts`
- Goal: 悪性または極端入力での長時間計算・メモリ逼迫を早期停止できるようにする。

## Background

現行の tuple 上限は有効だが、深い制約・特定組み合わせで高コスト処理が残る可能性がある。

## Scope

- 入力サイズ、制約深さ、評価予算の複合上限を導入。
- Worker キャンセル応答性を改善。
- UI へ早期停止理由を通知。

## Tasks

1. 予算制約（step/time/budget）を導入する設計を確定。
2. generator/oracle にチェックポイントを追加。
3. worker の cancel signal ポーリング密度を改善。
4. 大規模モデル fixture で回帰テスト追加。

## Acceptance Criteria

- 極端入力でハングせず、明示エラーまたは中断ステータスで終了する。
- 通常入力の生成結果に回帰がない。
- キャンセル操作が体感遅延なく反映される。

## Validation

- `node --experimental-strip-types --test tests/core/*.test.ts`
- `npm --prefix packages/web run check`
- `task check`
