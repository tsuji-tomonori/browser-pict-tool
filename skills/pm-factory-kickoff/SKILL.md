---
name: pm-factory-kickoff
description: Turn a non-trivial request in this repository into a scoped delivery plan before coding. Use when the user wants PM / Tech Lead orchestration, when work spans multiple files or layers, or when acceptance criteria and validation need to be made explicit in `.agent/current-plan.md` and `.agent/STATUS.md`.
---

# PM Factory Kickoff

Use this skill when the work is large enough that plan-first is safer than coding immediately.

## Read First

Read, in order:

1. `AGENT.md`
2. `AGENTS.md`
3. `PLANS.md`
4. `IMPLEMENT.md`
5. `.agent/current-plan.md`
6. `.agent/STATUS.md`
7. repo files directly relevant to the request

If `.agent/current-plan.md` or `.agent/STATUS.md` already contain an active delivery, refresh them instead of replacing them wholesale.

## Goal

Turn the request into an executable plan that the main Codex session can manage.

## Delegation Guidance

- Use read-only fan-out first.
- If custom repo agents are installed, prefer `requirements_analyst` and `codebase_explorer`.
- Otherwise use built-in `explorer` subagents with explicit briefs for:
  - requirements and acceptance criteria
  - code path and file-scope mapping
- Do not start write delegation during kickoff unless the user explicitly asked to begin implementation immediately.

## Output Responsibilities

Update `.agent/current-plan.md` with:

- brief
- goals / non-goals
- constraints
- repo context
- assumptions / risks / dependencies
- work packages
- package acceptance criteria
- validation matrix
- Definition of Done
- delegation plan
- exit criteria

Update `.agent/STATUS.md` with:

- current phase = `planning`
- active work packages
- blockers
- decisions made
- next step

## Planning Rules

- Make acceptance criteria observable.
- Distinguish package AC from repo-wide DoD.
- Default `parallel_safe` to `no`.
- Mark a package `parallel_safe: yes` only when file scope non-overlap is real and explained.
- If information is missing, ask only about truly blocking ambiguity. Otherwise record the assumption and move forward.

## Repo Notes

- Core or generator work should usually reference the TDD workflow in `skills/browser-pict-tool-tdd/SKILL.md`.
- Web work must account for `npm --prefix packages/web run check`, and usually `npm --prefix packages/web run build`.
- Fixture or upstream import work must include regeneration and integrity commands in the plan.

## Useful References

- Read `references/kickoff-checklist.md` when you need a fast checklist.
- Read `references/work-package-template.md` when shaping package details.
