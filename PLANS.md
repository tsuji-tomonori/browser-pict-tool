# PLANS.md

This file defines how Codex should turn a complex request in this repository into an executable delivery plan.
The active plan lives in `.agent/current-plan.md`.

## When A Plan Is Required

Make or refresh a plan when any of these are true:

- the task spans multiple files or layers
- the request is ambiguous or risky
- delegation or parallel work may help
- acceptance criteria are not yet explicit
- the user asks for PM / Tech Lead style orchestration

## Non-Negotiable Rules

1. Start from the user-visible outcome.
2. Write non-goals, not just goals.
3. Separate assumptions, risks, and dependencies.
4. Decompose into independently verifiable work packages.
5. Give every package observable acceptance criteria.
6. Give every package concrete validation commands.
7. Keep package AC separate from repo-wide DoD.
8. Mark write work `parallel_safe: no` unless non-overlap is real and explained.
9. Update `.agent/STATUS.md` when the plan changes in a way later agents must know.
10. Do not call work accepted before repo-wide validation and acceptance review.

## Required Sections In `.agent/current-plan.md`

### Brief

- request
- user-visible outcome
- why now
- scope summary

### Goals / Non-goals

- goals
- non-goals

### Constraints

- architecture
- API / export compatibility
- security / privacy
- performance / reliability
- tooling / environment

### Repo context

- relevant paths
- entry points
- existing tests
- related docs / specs / contracts

### Assumptions / Risks / Dependencies

- assumptions
- risks
- dependencies
- external blockers

### Work packages

Each package should have:

- `id`
- `goal`
- `scope`
- `depends_on`
- `owner_agent`
- `parallel_safe`
- `acceptance_criteria`
- `validation_commands`
- `expected_artifacts`
- `status`

### Validation matrix

- package-level commands
- repo-wide commands
- optional smoke / manual checks

### Definition of Done

Cross-cutting quality conditions only.

### Delegation plan

- which agent or subagent role handles which package
- what can run in parallel
- what must remain sequential
- who owns integration and acceptance

### Exit criteria

- accepted when
- rejected when
- follow-up handling

## Package Design Guidance

Prefer packages that:

- have one clear purpose
- touch a narrow and explainable file scope
- can be validated without relying on broad intuition
- are easy to integrate and easy to roll back

Avoid packages like:

- "fix the frontend"
- "clean up core and web together"
- "make tests pass somehow"
- "parallelize first, reason later"

## Parallel Safety Rules

Only mark a package `parallel_safe: yes` when all are true:

- file scope is materially non-overlapping
- no shared config, lockfile, schema, or generated artifact is involved
- packages do not change the same contract simultaneously
- validations can run package-by-package

If any item is unclear, set `parallel_safe: no`.

## Repo-Specific Planning Notes

- Core behavior changes should usually add or tighten a failing `tests/core/*.test.ts` case first.
- Web-only work still needs `npm --prefix packages/web run check`, and web build is expected when UI or worker entrypoints change.
- Fixture or import logic changes must include regeneration and integrity commands in the validation matrix.
- Existing `.agent/current-plan.md` and `.agent/STATUS.md` may already describe an active delivery. Refresh them instead of replacing them wholesale.
