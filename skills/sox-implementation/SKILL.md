---
name: sox-implementation
description: Use to implement an approved SOX-tracked change after intake and impact assessment exist. Preserve traceability, keep the diff minimal, update tests, and avoid unrelated refactors or control weakening.
---

# SOX Implementation

Use this skill only after the change request and impact assessment are complete.
Its job is to produce the smallest safe implementation that matches the approved scope.

## Read First

1. `change-pack/<CHANGE_ID>/change-request.md`
2. `change-pack/<CHANGE_ID>/impact-assessment.md`
3. any existing traceability or approval notes

## Before Editing

Confirm all of the following:

- the Change ID exists
- scope is approved or clearly reviewable
- required tests are known
- required documentation updates are known
- the planned diff stays inside approved scope

If any of these are missing, stop and go back to intake or assessment.

## Implementation Rules

1. Make the smallest correct change.
2. Avoid unrelated cleanup or opportunistic refactors.
3. Preserve or improve:
   - logging and audit trail
   - access control and least privilege
   - deployment and approval gates
   - data integrity and rollback path
4. Add or update tests required by the impact assessment.
5. Record which files changed and why.
6. Hand off to `$sox-doc-update` and `$sox-test-evidence` immediately after the code change.

## Output

Create or update:

```text
change-pack/<CHANGE_ID>/implementation-summary.md
```

Include:

- files changed
- requirement mapping
- controls affected
- tests added or updated
- residual risk
- out-of-scope items intentionally left untouched

## Guardrails

- Do not implement if the change is `uncertain`.
- Do not change approvals, logging, access, encryption, or deployment behavior unless they are explicitly in scope.
- Do not claim the change is ready for release without independent review and evidence.
