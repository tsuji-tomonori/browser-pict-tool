---
name: acceptance-gate
description: Make a hard acceptance decision for complex work in this repository. Compare the actual diff and validation evidence against package acceptance criteria and Definition of Done, identify blockers, and drive the smallest fix loop until the work is acceptable or precisely blocked.
---

# Acceptance Gate

Use this skill near the end of a delivery, after implementation and validation evidence exist.

## Read First

1. `AGENTS.md`
2. `IMPLEMENT.md`
3. `.agent/current-plan.md`
4. `.agent/STATUS.md`
5. the current diff and relevant validation output

## Acceptance Method

Evaluate in this order:

1. package acceptance criteria
2. repo-wide Definition of Done
3. evidence quality
4. residual risk

## Delegation Guidance

- If custom repo agents are installed, use `reviewer` and `qa_acceptance` for second-pass verdicts.
- Otherwise use read-only `explorer` subagents with explicit hard-verdict briefs, or do the acceptance pass locally.

## Verdict Classes

- `ACCEPTED`
  - all critical AC are proven
  - DoD is satisfied
  - no blocking review issue remains
- `REJECTED`
  - any critical AC fails or is unproven
  - repo-wide validation fails
  - scope drift or blocker remains
- `CONDITIONAL`
  - only when the user explicitly approved an exception

Default to `REJECTED` when evidence is missing.

## Fix Loop

If the verdict is not `ACCEPTED`:

1. list the minimum blocker set
2. assign each blocker to the narrowest fixer
3. re-run the specific failing checks first
4. re-run broader acceptance if needed

## Final Response Back To The User

Return:

- verdict
- passed AC
- failed or unproven AC
- DoD status
- commands and evidence used
- blocker list
- minimal next fixes
- residual risk

## Useful References

- Read `references/acceptance-checklist.md` for the minimum checklist.
