---
name: sox-doc-update
description: Use whenever a SOX-tracked change may affect architecture, runbooks, data flow, controls, APIs, access documentation, release notes, or operational procedures, and record either the updates made or why none were required.
---

# SOX Doc Update

Use this skill after implementation whenever a SOX-tracked change may alter how the system is understood, operated, reviewed, or audited.

## Read First

1. `change-pack/<CHANGE_ID>/change-request.md`
2. `change-pack/<CHANGE_ID>/impact-assessment.md`
3. `change-pack/<CHANGE_ID>/implementation-summary.md`
4. [assets/documentation-update-summary-template.md](assets/documentation-update-summary-template.md)

## Procedure

1. Identify all documents that may need updates.
2. Check at least these categories:
   - architecture and data-flow docs
   - API or schema docs
   - runbooks and rollback steps
   - control narratives or review procedures
   - access or role documentation
   - release notes and deployment instructions
3. Update the affected docs.
4. For each document not updated, record `not updated` and why.
5. Highlight any reviewer attention item that needs human confirmation.

## Output

Create or update:

```text
change-pack/<CHANGE_ID>/documentation-update-summary.md
```

## Guardrails

- Do not silently skip documentation that changed operational meaning.
- Do not mark `N/A` without a reason.
- Do not replace evidence with a narrative summary when a concrete file or link exists.
