# AGENTS.md

## SOX in-scope change rules

This repository is SOX in-scope for the modules and environments defined by the local control owner.

Codex must not:

- change code, configuration, schema, CI/CD, access control, logging, billing, revenue, accounting, reporting, or deployment behavior without a linked Change ID
- approve its own work
- merge its own PR
- bypass CI, protected branches, release approvals, or deployment gates
- deploy to production unless the approved deployment workflow explicitly permits it

For every SOX-relevant change, Codex must:

1. create or update the change-control package
2. classify change type and SOX scope
3. assess ICFR or control impact
4. update relevant documentation or record why none changed
5. produce reviewable test evidence
6. prepare release and rollback evidence before deployment
7. assemble an explicit evidence pack with any missing evidence called out
