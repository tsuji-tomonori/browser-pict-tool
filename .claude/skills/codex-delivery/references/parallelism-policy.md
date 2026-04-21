# Parallelism policy (codex exec fan-out)

## Safe

- Multiple codex exec runs against **disjoint file scopes** (e.g. wp-01 touches only `packages/core/`, wp-02 touches only `packages/web/src/ui/`).
- Separate git worktrees, one codex per worktree.
- Read-only Claude subagents (Explore) running alongside a codex exec write job.

## Unsafe (serialize instead)

- Two codex runs touching the same directory or same module.
- Any run that touches `package.json` / `package-lock.json` / `tsconfig*.json` / other shared config concurrently.
- Generated artifacts (`tests/generated`, codegen outputs) from more than one package.
- Schema / migration chain edits in parallel.
- Formatter / lint-fix passes across the whole repo in parallel with anything.

## Default when in doubt

Serialize. The cost of an integration collision — especially on `package-lock.json` — exceeds the wall-clock gain of running two codex briefs at once.

## Worktree pattern (for genuinely parallel writes)

```bash
git worktree add ../repo-wp-01 -b wp-01
git worktree add ../repo-wp-02 -b wp-02

codex exec --full-auto --cd ../repo-wp-01 - < /tmp/codex-brief-wp-01.md \
  2>&1 | tee .work/codex-wp-01.log &

codex exec --full-auto --cd ../repo-wp-02 - < /tmp/codex-brief-wp-02.md \
  2>&1 | tee .work/codex-wp-02.log &
```

Merge branches back into main once both return, validate repo-wide, then hand to acceptance.
