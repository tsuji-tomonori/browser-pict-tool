---
name: pm-parallel-delivery
description: Manage a multi-step delivery loop in this repository: refresh the plan, delegate bounded packages, validate, integrate, review, and drive fix loops until the work is truly acceptable. Use when the user wants Codex to act as PM / Tech Lead, not just as an implementer.
---

# PM Parallel Delivery

Use this skill after planning, when the main Codex session should orchestrate the actual delivery.

## Source Of Truth

Treat these as the source of truth, in order:

1. `AGENT.md`
2. `AGENTS.md`
3. `PLANS.md`
4. `IMPLEMENT.md`
5. `.agent/current-plan.md`
6. `.agent/STATUS.md`

## Delivery Loop

1. Refresh plan and status.
2. If package boundaries are stale, refresh them before coding.
3. Fan out read-only exploration freely.
4. Fan out write work only when scopes are materially non-overlapping.
5. Use the TDD workflow for implementation work.
6. Run package-level validation immediately.
7. Integrate and run repo-wide validation.
8. Run review and acceptance.
9. If anything is rejected or unproven, run a fix loop.
10. Only then prepare the final handoff.

## Delegation Guidance

- If custom repo agents are installed, prefer:
  - `task_planner`
  - `codebase_explorer`
  - `implementer`
  - `reviewer`
  - `qa_acceptance`
  - `integration_fixer`
- Otherwise map those roles onto built-in subagents:
  - `explorer` for planning, codebase mapping, review, and acceptance passes
  - `worker` for one scoped implementation or integration fix at a time

When using built-in roles, the parent session must provide the role brief explicitly.

## Write Parallelism Policy

Write fan-out is allowed only when all are true:

- package scopes are materially non-overlapping
- no shared config, schema, lockfile, or generated artifact is touched
- validations can run package-by-package
- the combined diff will still be reviewable

If not, keep writes sequential.

## Validation Expectations

Run the narrowest relevant checks first, then broaden.

- package-level focused tests
- `task lint`
- `task format-check`
- `task test`
- `npm --prefix packages/web run check` when web or worker entrypoints changed
- `npm --prefix packages/web run build` when web delivery changed

## Status Maintenance

After each meaningful batch, update `.agent/STATUS.md` with:

- current phase
- completed packages
- commands run and results
- blockers
- decisions
- next step

## Final Response Contract

Do not return a "done" answer until:

- package AC are satisfied or precisely disproven
- repo-wide validation is green
- blocking review issues are resolved
- acceptance verdict is positive

## Useful References

- Read `references/delivery-loop.md` for the short control loop.
- Read `references/parallelism-policy.md` before enabling write fan-out.
