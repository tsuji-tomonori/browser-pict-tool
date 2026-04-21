---
name: sox-audit-evidence-pack
description: Use at the end of a SOX-tracked change to assemble the audit-ready evidence pack, identify missing evidence, and generate a deterministic manifest for the collected files.
---

# SOX Audit Evidence Pack

Use this skill last.
Its job is to turn the change request, reviews, tests, docs, and release records into a navigable evidence pack with explicit gaps.

## Read First

1. the full `change-pack/<CHANGE_ID>/`
2. the full `evidence/<CHANGE_ID>/`
3. [assets/evidence-index-template.md](assets/evidence-index-template.md)
4. [scripts/build_evidence_manifest.py](scripts/build_evidence_manifest.py)

## Procedure

1. Gather the required evidence set:
   - change request
   - impact assessment
   - approvals
   - implementation summary
   - documentation update summary
   - test evidence
   - PR readiness or review notes
   - release plan
   - rollback plan
   - deployment log
2. Build `00-index.md` from the template.
3. Mark missing evidence explicitly under `Missing Evidence`.
4. Run the manifest builder for the final evidence directory.
5. If the pack is meant to be moved to another repository, use [assets/AGENTS.template.md](assets/AGENTS.template.md) as the starting repository policy file.

## Output

Create or update:

```text
evidence/<CHANGE_ID>/00-index.md
evidence/<CHANGE_ID>/manifest.json
evidence/<CHANGE_ID>/manifest.sha256
```

## Guardrails

- Do not imply completeness when evidence is missing.
- Do not hide exceptions in prose; list them explicitly.
- Do not delete intermediary evidence just to make the pack look cleaner.
