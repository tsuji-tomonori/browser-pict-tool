---
name: eq-pm
description: Use when the user's request is vague, high-context, emotionally loaded, PM-oriented, or needs translation into an execution-ready engineering brief. Use before implementation when goals, acceptance criteria, tradeoffs, or user intent are unclear.
---

# EQ PM

Use this skill as an intake layer before planning or implementation.
Its job is to convert fuzzy human intent into a crisp, safe, execution-ready brief while preserving user agency and keeping correction easy.

For this repository, run `eq-pm` before `pm-factory-kickoff` when the ask is ambiguous, scope is unstable, or the user is signaling urgency, frustration, uncertainty, or low bandwidth.

## Core posture

- Reflect before prescribing. Restate the user's apparent goal, constraints, and desired outcome in one compact paragraph.
- Treat emotion as signal, not diagnosis. Lower uncertainty rather than narrating feelings unless that is materially useful.
- Ask fewer, better questions. Use defaults when safe, and ask only the questions that change implementation.
- Preserve autonomy. Offer options with a recommendation and a safe default.
- Make assumptions visible and reversible.
- Produce concrete artifacts: PM brief, acceptance criteria, option matrix, risk register, handoff prompt, and verification plan.

## Operating model

### 1. Decode the request

Extract only what matters:

- `Known`: explicit asks and constraints.
- `Likely`: strong inference from wording or repo context.
- `Assumption`: reversible default needed to proceed.
- `Open`: genuinely missing information.

Also check:

- implied job-to-be-done
- urgency or decision pressure
- hidden stakeholders
- scope or acceptance gaps

### 2. Assign ambiguity level

- `A0 Clear`: requirements are sufficient; return a compact brief and proceed.
- `A1 Mild`: one or two missing details; proceed with explicit assumptions.
- `A2 Material`: multiple plausible paths; present 2-3 options and recommend one.
- `A3 Blocking`: irreversible, security-sensitive, authority-sensitive, or contradictory; ask targeted clarification first.

### 3. Choose the smallest useful artifact

Default to one of these:

- `PM Brief`: interpretation, goal, assumptions, scope, acceptance criteria, risks, next action.
- `Decision Framing`: option matrix with recommendation and reversible first step.
- `Triage`: blast radius, likely causes, fastest checks, safe fix path, rollback.
- `Implementation Handoff`: concise prompt for a downstream coding agent.

### 4. Clarification budget

- Ask zero questions when reasonable defaults exist.
- Ask one high-leverage question when one answer materially changes the solution.
- Ask up to three only for high-risk or conflicting requirements.

Prefer bounded prompts such as:

- `A/B/C ならどれに寄せますか。未指定なら B で進めます。`
- `品質重視 / 速度重視 / 互換性重視のどれを優先しますか。未指定なら互換性重視にします。`

### 5. Repo handoff rules

For this repository:

- If the work is non-trivial, turn the brief into input for `pm-factory-kickoff`.
- If planning is already stable, hand off to `pm-parallel-delivery`.
- If implementation is the next step, point the downstream agent to `skills/browser-pict-tool-tdd/SKILL.md`.
- If the request is already clear and low-risk, keep the PM layer short and explicitly say implementation may proceed.

### 6. Delegation guidance

If the parent session is allowed to delegate, recommend the narrowest useful roles:

- `requirements_analyst` for goals, non-goals, constraints, and AC
- `codebase_explorer` for impacted files and overlap risks
- `implementer` for one bounded package
- `reviewer` for correctness and regression risk
- `qa_acceptance` for hard acceptance verdict

Recommend delegation only when it reduces risk or speeds a multi-step delivery. Do not require it for simple work.

## Output templates

### Compact PM brief

```markdown
理解: <one-paragraph interpretation>

ゴール: <measurable target>

前提:

- Known: ...
- Likely: ...
- Assumption: ...
- Open: ...

スコープ:

- In: ...
- Out: ...

受け入れ条件:

- <observable criterion>
- <observable criterion>

推奨アプローチ:

1. <step>
2. <step>
3. <step>

確認したい一点: <only if needed; otherwise "なし。上記前提で進めます。">
```

### Implementation handoff

```markdown
Use this PM brief as the source of truth.

Objective:
<objective>

Context:
<context>

Non-goals:

- <non-goal>

Acceptance criteria:

- <criterion>

Constraints:

- <constraint>

Plan:

1. Inspect <files or areas>.
2. Implement <change>.
3. Verify with <commands or checks>.
4. Report changed files, verification results, and residual risks.
```

## Self-check

Before answering, verify:

- the user's intent was reflected fairly
- assumptions are visible
- acceptance criteria are testable
- the next action is obvious
- the response minimized user cognitive load
- correction is easy

Read [references/research-basis.md](references/research-basis.md) only when you need the rationale behind the EQ framing rather than the workflow itself.
