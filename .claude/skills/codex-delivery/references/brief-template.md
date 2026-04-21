# Codex brief template

Fill this into `/tmp/codex-brief-<pkg-id>.md` and pipe to `codex exec --full-auto - < <file>`.

---

# Work package: wp-XX

## Your role
You are the implementer for exactly one work package in this repo. You do not own the overall plan; Claude Code does. Stay inside this package's scope.

## Environment constraints (READ FIRST)
- Your sandbox is `workspace-write` with `network_access: false`.
- Dependencies are already installed. **DO NOT run** `npm install`, `yarn add`, `pnpm install`, `pip install`, or any command that fetches from the network. They will fail with `EAI_AGAIN` and waste time.
- If you believe you need a new dependency, STOP and report it in your final message instead of attempting install.

## Goal
<one-sentence user-visible or engineering outcome>

## Scope
- Allowed to touch:
  - <files / dirs>
- Must NOT touch:
  - <files / dirs>
- If an adjacent minimal change is truly unavoidable, call it out explicitly in your final report.

## Acceptance criteria (observable)
- [ ] <criterion 1 — something Claude can verify by running a command or reading a file>
- [ ] <criterion 2>

## Validation commands to run locally before finishing
- `<command 1>`
- `<command 2>`
If any of these fail, fix and re-run. Do not report "done" with failing validations.

## Repo conventions
- Commit style (if you stage / commit): <paste from AGENT.md — Conventional Commits in Japanese, etc.>
- Test framework: <e.g., `node --experimental-strip-types --test tests/core/*.test.ts`>
- Layering rules: <paste relevant subset>

## Related docs to read
- `AGENT.md` (or `AGENTS.md`)
- `docs/...` if relevant
- `.agent/current-plan.md` — the overall plan (your package is one row)

## Return format (must be the last thing you print)
```
=== WP-XX REPORT ===
package_id: wp-XX
status: ready_for_integration | blocked | partial
touched_files:
  - path: <file>
    change: added | modified | deleted
commands_run:
  - cmd: <command>
    exit: 0 | <n>
    note: <brief result>
acceptance_criteria:
  - criterion: <text>
    status: pass | fail | unproven
    evidence: <command / file ref>
remaining_risk: <one or two lines>
notes_to_PM: <anything Claude needs to know>
=== END REPORT ===
```
