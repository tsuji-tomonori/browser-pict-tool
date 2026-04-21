# STATUS

- Phase: Acceptance
- Active package: core + web
- Decisions:
  - lazy coverage を default とし、eager は opt-in 指定時のみ使用
  - verifier 側指標は `excludedInvalidTupleCount` を追加し、既存 `invalidTupleTargetedCount` は互換 alias として維持
- Commands run:
  - npm install
  - npm run typecheck
  - npx -y node@22 --experimental-strip-types --test tests/core/coverage-verifier.test.ts
  - npx -y node@22 --experimental-strip-types --test tests/core/lazy-coverage-tracker.test.ts
- Blockers:
  - ローカル Node が v20 のため repo 標準 test コマンドは直接は実行不可（`node --experimental-strip-types` 非対応）。Node 22 を npx で明示して代替実行。
- Acceptance state:
  - Go (focused tests + typecheck passed with Node 22 fallback)
