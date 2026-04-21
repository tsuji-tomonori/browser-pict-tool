# IMPLEMENT.md

This runbook defines how Codex should execute a delivery after planning.
`.agent/current-plan.md` is the source of truth.
`.agent/STATUS.md` is the execution log.

## Read Before Execution

1. `AGENT.md`
2. `AGENTS.md`
3. `PLANS.md`
4. `.agent/current-plan.md`
5. `.agent/STATUS.md`
6. [skills/browser-pict-tool-tdd/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/browser-pict-tool-tdd/SKILL.md:1) if code changes are required

## Execution Principles

1. Stay inside scope.
2. Prefer the smallest correct change.
3. Add or tighten tests before behavior changes whenever feasible.
4. Run focused validation as soon as a package-level change is ready.
5. Do not postpone integration failures.
6. Keep status artifacts current enough for another agent to resume.
7. Completion requires repo-wide validation, not just local package success.

## Delivery Loop

### 1. Refresh

- re-read plan and status
- inspect current `git status`
- identify completed, active, and blocked packages

### 2. Explore

- trace the impacted code path
- confirm file scope and overlap risk
- use read-only delegation first when multiple unknowns exist

### 3. Implement

- assign one write agent to one bounded package when delegating
- keep diffs reviewable
- do not widen scope into unrelated cleanup

### 4. Focused validation

- run the package's focused validation commands
- if they fail, do not mark the package done
- record the failure and next step in `.agent/STATUS.md`

### 5. Integrate

- review combined diff
- run repo-wide validation for touched layers
- re-check exports, imports, generated artifacts, and worker/web boundaries

### 6. Review and acceptance

- run a correctness-focused review
- compare evidence against package AC and repo-wide DoD
- if anything critical is unproven, treat the verdict as rejected

### 7. Close

- summarize what changed
- summarize what was actually verified
- record residual risk or follow-up

## Fix Loop

If work is not accepted:

1. identify the smallest blocker set
2. choose the narrowest fixer
3. re-run the specific failing validation first
4. re-run broader acceptance if needed
5. update `.agent/STATUS.md`

## Repo-Wide Validation Defaults

Use the smallest relevant set, then broaden:

- always relevant for TypeScript or repo tooling: `task lint`
- always relevant before acceptance: `task format-check`
- core behavior changes: `task test`
- repo-wide gate: `task check`
- web or worker entrypoint changes: `npm --prefix packages/web run check`
- web UI delivery or bundling changes: `npm --prefix packages/web run build`

## Status Minimum

Record at least:

- current phase
- active work package
- commands run
- result summary
- blockers
- decisions made
- next step

## Completion Rule

Do not report the task as complete until:

- package-level validation is green
- repo-wide validation is green
- blocking review issues are resolved
- acceptance criteria are proven, not assumed
- residual risk / follow-up are documented
