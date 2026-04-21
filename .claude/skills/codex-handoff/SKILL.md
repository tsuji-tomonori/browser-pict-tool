---
name: codex-handoff
description: Use after `codex-acceptance` returns ACCEPTED. Prepare the final user-facing summary of what codex did, how Claude verified it, what the user should check manually, and residual risk — honestly, without overselling certainty.
---

# codex-handoff

Final wrap. Close out the delivery with a concise, honest summary.

## When to use

- `codex-acceptance` verdict is ACCEPTED.
- User is waiting for the final answer.

## Do not use

- Verdict is still REJECTED / CONDITIONAL.
- Blockers remain in `.agent/STATUS.md`.

## Required reads

1. `.agent/current-plan.md` — what was planned
2. `.agent/STATUS.md` — what was done, verdict, residual risk
3. `git diff --stat` or `git log` for the delivered work
4. The codex `.work/*.log` files if any notable decision sits there

## Output shape

Return to the user (Japanese mirrors the repo's convention from `AGENT.md`):

```
## 変更概要 (What changed)
- <1–3 bullets of user-visible / engineering outcome>

## 変更したファイル / サブシステム
- <path or subsystem>: <one-line what>

## 検証 (Verification)
- `<command>` → <result>
- `<command>` → <result>
(list what Claude ran, not just what codex self-reported)

## 委任の内訳 (Who did what)
- codex: wp-XX, wp-YY (briefs at `.work/codex-wp-XX.log` etc.)
- claude: <direct edits, integration fixes, acceptance>

## 手動確認 (Manual checks for the user)
- <things a human should eyeball — UI behavior, deployment step, etc.>

## 残リスク / follow-up
- <honest residual risk>
- <recommended follow-up tasks not done in this round>
```

## Rules

- Do not restate the whole plan. Keep the summary concrete and short.
- Do not claim certainty beyond Claude-observed evidence.
- Attribute work honestly: what codex implemented vs. what Claude edited or fixed.
- Keep residual-risk section real. If it's empty, say so — do not pad.
- If commits were made, list them with hashes and subjects.

## Post-handoff

- Leave `.agent/current-plan.md` in place so future sessions can resume.
- Update `.agent/STATUS.md` final state: `current phase = closed`, verdict = ACCEPTED, residual risk.
- Do not delete `.work/codex-*.log` — they are evidence.
