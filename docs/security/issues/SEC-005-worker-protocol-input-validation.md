# SEC-005: Worker protocol の入力検証を厳格化する

- Severity: Medium
- Area: `packages/web/src/lib/protocol.ts`, `packages/web/src/worker/worker.ts`
- Goal: 想定外メッセージでの例外・不整合・停止不能状態を防ぐ。

## Background

同一オリジン上で worker 参照を取得できた場合、意図しないメッセージが投入される可能性がある。

## Scope

- message schema validation を導入。
- unknown type/invalid payload の reject 方針を統一。
- cancellation と progress イベントの state machine 整合を検証。

## Tasks

1. request/response schema を型 + runtime で定義。
2. worker 側入口で validation を実施。
3. 異常系テストを追加。

## Acceptance Criteria

- 不正 payload でクラッシュせず、規定エラー応答に落ちる。
- 正常フロー性能への影響が軽微。

## Validation

- `npm --prefix packages/web run check`
- `npm --prefix packages/web run build`
- `task check`
