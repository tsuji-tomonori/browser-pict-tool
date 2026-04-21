# Delivery loop cheat sheet

For each package with `owner: codex`:

1. Refresh plan + status.
2. Pre-flight (Claude): install network deps, verify clean starting tree.
3. Write brief → `/tmp/codex-brief-<pkg-id>.md`.
4. Launch in background:
   ```bash
   codex exec --full-auto --cd "$PWD" - < /tmp/codex-brief-<pkg-id>.md \
     2>&1 | tee .work/codex-<pkg-id>.log
   ```
5. Monitor for `EAI_AGAIN`, sandbox errors, `=== WP-XX REPORT ===`, long silence.
6. On exit:
   - Tail the log.
   - `git diff --stat` to see real changes.
   - Parse the report block.
7. Independent verify: run `task lint`, `task test`, `npm --prefix packages/web run check`, or whatever the package's validation matrix demands.
8. Update `.agent/STATUS.md`.
9. On failure: tight fix brief → relaunch codex, or Claude-side fix for cross-package issues.
10. When all codex packages are `done`, move to `codex-acceptance`.

## Forbidden

- `codex exec ... "$(cat <<EOF ... EOF)"` — deadlocks.
- Trusting codex's self-reported "done" without Claude-side independent run.
- Letting codex attempt `npm install`.
- Running two `codex exec` against the same working tree with overlapping file scopes.

## Kill / restart

If a codex process hangs (no output > 5 min, no `EXIT`):

```bash
ps -o pid,etime,pcpu,cmd -p <pid>   # confirm it's alive but idle
kill -TERM <pid>
# after 30s if still alive:
kill -KILL <pid>
```

Then diagnose: was the launch form `- < file` (correct) or long-arg (deadlock cause)?
