---
name: codex-kickoff
description: Use when the user hands a multi-step or ambiguous task to delegate to codex. Claude Code acts as PM, reads the repo, and converts the fuzzy request into a scoped delivery plan (goals, non-goals, constraints, risks, work packages, acceptance criteria, validation matrix, DoD) written to `.agent/current-plan.md` and `.agent/STATUS.md` — before any `codex exec` runs.
---

# codex-kickoff

Turn a fuzzy request into an executable plan that later `codex exec` runs can act on. Claude Code is the PM; codex is the worker. **No coding happens in this skill** — only planning and fact-gathering.

## When to use

- User says "codex にやらせて" / "作業は codex に / 管理だけして" / "この要件を codex に投げて" etc.
- Task is multi-step, ambiguous, touches multiple files, or has regression risk.
- A plan does not yet exist, or the existing `.agent/current-plan.md` is stale relative to the request.

## Do not use

- Tiny single-file edits that Claude should just do itself.
- Pure code review with no implementation to delegate.
- The plan already exists, is fresh, and the user wants immediate delivery — jump to `codex-delivery`.

## Required reads

Read in this order (skip ones that don't exist; note absence in STATUS):

1. `AGENT.md` / `AGENTS.md` — repo agent contract
2. `PLANS.md` — planning conventions, if present
3. `IMPLEMENT.md` — runbook, if present
4. `.agent/current-plan.md` — prior plan
5. `.agent/STATUS.md` — prior status
6. `README.md`, `package.json`, `Taskfile.yml`, and entry points relevant to the request

Then inspect **only the repo areas relevant to the request**. Use Grep / Read / Glob — do not fan out to unrelated directories.

## Delegation stance in this phase

- **Do not spawn `codex exec` during kickoff.** Planning is faster and cheaper on the Claude side.
- You may use the Claude `Explore` subagent for read-only codebase mapping if scope is genuinely broad.
- Only ask the user about **blocking ambiguity**; otherwise state the assumption and move forward.

## Output responsibilities

Create or update `.agent/current-plan.md` with all of:

- **Brief** — request, user-visible outcome, why now, scope summary
- **Goals / Non-goals**
- **Constraints** — architecture, API/schema compat, security, perf, tooling
- **Repo context** — relevant paths, entry points, existing tests, related docs
- **Assumptions / Risks / Dependencies**
- **Work packages** — each with `id`, `goal`, `scope`, `depends_on`, `owner` (`codex` or `claude`), `parallel_safe` (yes/no + reason), `acceptance_criteria`, `validation_commands`, `expected_artifacts`, `status`
- **Validation matrix** — package-level / repo-wide / smoke
- **Definition of Done** — cross-cutting quality conditions
- **Delegation plan** — what goes to codex, what stays on Claude side, integration owner
- **Exit criteria** — ACCEPTED / REJECTED conditions, follow-up handling
- **Pre-flight for codex** — list of **network-requiring commands Claude will run before delegating** (npm install, pip install, tooling fetches). These MUST be resolved before any `codex exec`.

Use `references/work-package-template.md` for package shape.

Create or update `.agent/STATUS.md` with:

- `current phase = planning`
- active work packages (none yet, but listed as todo)
- blockers
- decisions made (with date from env — today)
- next step (usually: "invoke codex-delivery for wp-XX")

## Planning rules

- Acceptance criteria must be **observable** — command output, file contents, UI state. Prose like "works correctly" is not acceptable.
- Separate package-level AC from repo-wide DoD.
- Mark `parallel_safe: no` by default. Only flip to `yes` when file scopes are demonstrably disjoint and there is no shared config / lockfile / generated-artifact touch.
- Every package needs at least one validation command Claude can run independently (not just what codex will self-report).
- If `AGENT.md` / `AGENTS.md` specifies commit convention, commands, or architecture rules, **copy the relevant subset into the brief** so codex honors them.

## Response back to the user

After writing plan and status, return a short summary:

1. Goal (1 sentence, user-visible)
2. Work package summary (id → goal, 1 line each)
3. Key risks (top 3)
4. What will be delegated to codex vs. kept on Claude side
5. Pre-flight Claude will run (network installs, env prep)
6. Blocking ambiguity, if any

Do not start execution. Wait for the user to confirm, then invoke `codex-delivery`.
