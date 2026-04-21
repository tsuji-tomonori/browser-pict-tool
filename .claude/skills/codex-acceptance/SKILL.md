---
name: codex-acceptance
description: Use after `codex-delivery` reports packages complete. Claude Code independently verifies the diff and validation evidence against acceptance criteria and Definition of Done. Do not trust codex's self-reported "done" — re-run checks, inspect the diff, drive the fix loop until ACCEPTED or precisely blocked.
---

# codex-acceptance

Hard go/no-go gate after delegation. Claude Code takes the combined codex output, runs its own checks, and returns ACCEPTED or REJECTED with a blocker list.

## When to use

- All `owner: codex` packages report `ready_for_integration` in their report blocks.
- User asked for acceptance or final QA.
- Before writing any user-facing "done" message.

## Do not use

- While codex packages are still in flight — wait for `codex-delivery` to return.
- For tiny single-edit tasks with no acceptance standard.

## Trust stance

**Do not accept codex's self-report as sufficient evidence.** The report is a hint, not proof. Always independently:

- Re-run validation commands with the Claude Bash tool.
- Read the actual diff with `git diff` (or `git diff --stat` then targeted file reads).
- Confirm each acceptance criterion by observing its evidence yourself.

Codex reports `pass` for unproven criteria more often than it admits `unproven`. Treat unverified AC as failing.

## Required reads

1. `.agent/current-plan.md` — AC and DoD
2. `.agent/STATUS.md` — what was run so far
3. `.work/codex-*.log` — codex reports
4. Current `git diff` and `git status` — ground truth

## Acceptance method

Evaluate in this order:

1. **Package-level acceptance criteria** — one by one, across every package. For each AC:
   - Re-run the validation command (or read the file) yourself.
   - Mark `pass` only with direct Claude-observed evidence.
2. **Repo-wide Definition of Done**:
   - `task lint` (or repo lint command)
   - `task format-check`
   - `task test` (or the appropriate repo-wide test)
   - `npm --prefix packages/web run check` (if UI was touched)
   - Other DoD items from the plan
3. **Diff sanity**:
   - Any files outside declared scopes? → scope drift blocker
   - Any stray `console.log`, debug code, commented-out blocks? → cleanup blocker
   - Any lockfile / config changes that weren't in the plan? → explain or revert
4. **Residual risk** — list what is not proven even after passing all checks.

Use Claude's `Explore` or `Agent` subagents for read-only second opinions when a concern is subtle (security, regression, concurrency).

## Verdict classes

- **ACCEPTED** — every critical AC proven by Claude-side evidence, DoD commands green, no blocking review issues, scope clean.
- **REJECTED** — any critical AC fails or is unproven, or repo-wide validation fails, or scope drift exists, or a blocker remains.
- **CONDITIONAL** — only when the user explicitly pre-approves an exception. Otherwise treat as REJECTED.

Default to REJECTED when in doubt. Codex self-report passing is not enough to flip to ACCEPTED.

## Fix loop

When not ACCEPTED:

1. List the **minimum blocker set** — smallest set of fixes that would flip the verdict.
2. For each blocker, decide the narrowest fixer:
   - Local code bug → re-delegate to codex with a tight, scoped fix brief (see `codex-delivery` brief template).
   - Integration / cross-package bug → Claude fixes directly, or send to codex with an integration-focused brief.
   - Plan misinterpretation → update `.agent/current-plan.md` first, then re-delegate.
3. Re-run only the specific failing validation first.
4. Once green, re-run the broader acceptance pass.
5. Update `.agent/STATUS.md` with the fix round and outcome.

## Update status

Write to `.agent/STATUS.md`:

- `current phase = accepting` (or `fixing` during fix loop)
- Verdict: ACCEPTED / REJECTED / CONDITIONAL
- Passed AC (with evidence reference — log path or command)
- Failed / unproven AC
- DoD status (command + result per line)
- Blocker list
- Residual risk

## Response back to the user

Return:

1. **Verdict** — one word at the top
2. **Passed AC** — with evidence (command + exit, or file ref)
3. **Failed / unproven AC** — with reason
4. **DoD status** — commands run and their results
5. **Blocker list** — minimal
6. **Proposed next fixes** — narrowest fixer per blocker
7. **Residual risk** — honest, not downplayed

Only advance to `codex-handoff` when the verdict is ACCEPTED.
