---
name: sox-risk-impact-assessment
description: Use after SOX intake to assess ICFR, financial reporting, access, logging, data, deployment, and documentation impact; map the change to controls, approvals, required tests, and required documents.
---

# SOX Risk Impact Assessment

Use this skill after intake and before implementation.
Its job is to decide whether the change affects ICFR or ITGC controls and to define the minimum evidence burden.

## Read First

1. `change-pack/<CHANGE_ID>/change-request.md`
2. [assets/impact-assessment-template.md](assets/impact-assessment-template.md)
3. [references/impact-cues.md](references/impact-cues.md)

## Procedure

1. Read the change request and confirm the scope.
2. Check whether the change affects:
   - billing, revenue, accounting, close, reporting, or tax
   - financial-data interfaces or batch jobs
   - master data used by finance flows
   - IAM, RBAC, privileged access, or segregation of duties
   - logging, monitoring, or audit trails
   - database schema, migrations, backfills, or reconciliations
   - CI/CD, release gates, deployment paths, or production config
3. Rate the change `low`, `medium`, `high`, or `critical`.
4. Map affected control IDs or control areas.
5. Define required approvals.
6. Define required tests.
7. Define required documentation updates.
8. If scope is unclear, mark `requires human control owner review` and stop.

## Output

Create or update:

```text
change-pack/<CHANGE_ID>/impact-assessment.md
```

The result should include:

- SOX scope verdict
- risk level
- affected controls
- required approvals
- required tests
- required documents
- explicit stop conditions or open questions

## Guardrails

- Do not weaken scope to make implementation easier.
- Do not infer approval from the request alone.
- Do not proceed to `$sox-implementation` when the scope is `uncertain`.
