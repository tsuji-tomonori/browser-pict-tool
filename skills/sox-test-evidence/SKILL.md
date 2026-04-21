---
name: sox-test-evidence
description: Use after implementation of a SOX-tracked change to run or summarize required tests, capture audit-ready context, and produce deterministic evidence such as commands, timestamps, commit SHA, logs, and artifact hashes.
---

# SOX Test Evidence

Use this skill after implementation and before PR readiness or release readiness.
Its job is to turn test execution into evidence that a reviewer or auditor can follow without guessing.

## Read First

1. `change-pack/<CHANGE_ID>/impact-assessment.md`
2. `change-pack/<CHANGE_ID>/implementation-summary.md`
3. [assets/test-evidence-template.md](assets/test-evidence-template.md)
4. [scripts/hash_artifacts.py](scripts/hash_artifacts.py)

## Procedure

1. List the required tests from the impact assessment.
2. Run the tests that are feasible in the current environment.
3. For each test, record:
   - command
   - environment
   - executor
   - timestamp
   - branch
   - commit SHA
   - result
   - output or log location
4. For tests that cannot be run locally, record the missing external evidence and current status.
5. Hash important logs or generated artifacts when that helps preserve evidence integrity.
6. Hand off to `$sox-pr-review-readiness` once the evidence list is complete.

## Output

Create or update:

```text
evidence/<CHANGE_ID>/test-evidence.md
evidence/<CHANGE_ID>/artifact-hashes.sha256
```

## Guardrails

- Do not say "tested" without naming the command or external evidence source.
- Do not hide failed tests; record the disposition.
- Do not treat a future test plan as completed evidence.
