---
name: sox-pr-review-readiness
description: Use before opening or updating a pull request for a SOX-tracked change to prepare the PR body, reviewer checklist, traceability notes, evidence links, and explicit missing-evidence callouts.
---

# SOX PR Review Readiness

Use this skill after implementation, documentation updates, and test evidence exist.
Its job is to make independent review possible without extra archaeology.

## Read First

1. `change-pack/<CHANGE_ID>/change-request.md`
2. `change-pack/<CHANGE_ID>/impact-assessment.md`
3. `change-pack/<CHANGE_ID>/implementation-summary.md`
4. `change-pack/<CHANGE_ID>/documentation-update-summary.md`
5. `evidence/<CHANGE_ID>/test-evidence.md`
6. [assets/pr-template.md](assets/pr-template.md)

## Procedure

1. Compare the implemented diff with approved scope.
2. Summarize business purpose and approved scope.
3. Map the change to affected controls and evidence.
4. Populate the PR body and reviewer checklist.
5. Highlight:
   - missing evidence
   - risky areas for review
   - out-of-scope items intentionally left out
6. State explicitly that Codex is not an independent approver.

## Output

Create or update:

```text
change-pack/<CHANGE_ID>/pr-readiness.md
```

## Guardrails

- Do not mark the PR ready if required evidence is missing without calling that out.
- Do not claim approval status unless the approval evidence exists.
- Do not hide scope drift.
