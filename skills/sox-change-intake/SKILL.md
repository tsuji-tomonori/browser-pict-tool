---
name: sox-change-intake
description: Use before any SOX-relevant code, configuration, schema, deployment, access-control, logging, billing, revenue, accounting, reporting, or CI/CD change to create the change-control package and stop implementation until scope, approvals, and evidence are defined.
---

# SOX Change Intake

Use this skill first for a SOX-tracked change.
Its job is to stop untracked implementation and produce the minimum control package needed to continue safely.

## Read First

1. the target repository `AGENTS.md`, if it exists
2. the user request, ticket, or incident record
3. [assets/change-request-template.md](assets/change-request-template.md)
4. [assets/approval-checklist-template.md](assets/approval-checklist-template.md)

## Required Inputs

- Change ID or provisional ticket ID
- Requestor or business owner
- Business reason
- Systems or paths affected
- Whether the request is normal or emergency

If the Change ID is missing and the repository process requires one, stop and request it.

## Procedure

1. Create or refresh `change-pack/<CHANGE_ID>/`.
2. Populate `change-request.md` from the template.
3. Populate `approval-checklist.md` from the template.
4. Classify the change as `standard`, `normal`, or `emergency`.
5. Classify SOX scope as `in_scope`, `out_of_scope`, or `uncertain`.
6. Mark whether the change touches:
   - financial data or reporting logic
   - access control or privileged access
   - logging or audit trail
   - database or data correction
   - CI/CD, release, or deployment path
7. List required approvals, test evidence, and documentation updates.
8. Hand off to `$sox-risk-impact-assessment` before implementation.

## Output

Create or update:

```text
change-pack/<CHANGE_ID>/change-request.md
change-pack/<CHANGE_ID>/approval-checklist.md
```

## Hard Stops

- Do not edit production code or production-facing configuration.
- Do not classify uncertain scope as `out_of_scope`.
- Do not treat Codex as an approver, reviewer, or deploy approver.
- If the change is emergency work, record that explicitly and require post-change review.
