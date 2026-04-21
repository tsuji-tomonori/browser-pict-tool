---
name: sox-release-deployment
description: Explicit-only. Use to prepare or, when explicitly authorized, execute an approved SOX-tracked release or deployment through protected workflows without bypassing approvals, CI checks, or rollback requirements.
---

# SOX Release Deployment

Use this skill only when the user explicitly invokes `$sox-release-deployment`.
Default behavior is release preparation, not direct production change.

## Read First

1. `change-pack/<CHANGE_ID>/change-request.md`
2. `change-pack/<CHANGE_ID>/impact-assessment.md`
3. `change-pack/<CHANGE_ID>/pr-readiness.md`
4. `evidence/<CHANGE_ID>/test-evidence.md`
5. [assets/release-plan-template.md](assets/release-plan-template.md)

## Procedure

1. Confirm the change has independent review and required approvals.
2. Confirm CI or equivalent validation passed, or record the exception path.
3. Confirm rollback instructions exist.
4. Prepare the release plan and post-deploy validation plan.
5. If deployment execution is explicitly authorized:
   - use only approved, logged, protected workflows
   - capture who executed, who approved, what was deployed, and when
6. If execution is not explicitly authorized, stop after creating the plan.

## Output

Create or update:

```text
change-pack/<CHANGE_ID>/release-plan.md
change-pack/<CHANGE_ID>/rollback-plan.md
evidence/<CHANGE_ID>/deployment-log.md
```

If no deployment happened, mark the deployment log as `not executed` and explain why.

## Hard Stops

- Do not bypass protected branches, manual approvals, or environment gates.
- Do not use direct production access outside an approved path.
- Do not deploy when required evidence or approvals are missing.
