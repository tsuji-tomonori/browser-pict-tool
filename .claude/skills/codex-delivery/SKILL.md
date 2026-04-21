---
name: codex-delivery
description: Use when delegating work packages to `codex exec` from Claude Code. Claude stays as PM, pre-installs network dependencies, writes a per-package brief to a temp file, launches `codex exec --full-auto ... - < /tmp/brief.md` via stdin redirect (never as a long command argument), monitors with Monitor, and integrates results. Contains the two non-negotiable rules learned from real failures.
---

# codex-delivery

Execute the plan in `.agent/current-plan.md` by delegating write-heavy work to `codex exec` while Claude keeps control of orchestration, validation, and integration.

## When to use

- `.agent/current-plan.md` already defines work packages with `owner: codex`.
- The user said "codex に任せて / 管理だけ" or similar.
- You are past planning and ready to execute.

## Do not use

- Before `codex-kickoff` has produced a plan.
- For single trivial edits Claude can do in one turn.
- When every package's owner is `claude` — no delegation needed.

## The two non-negotiable rules

These are not style preferences. Each one cost real hours (see `feedback_codex_delegation.md` in memory, dated 2026-04-18).

### Rule 1 — Brief MUST go through stdin, never as a long command arg

Passing the brief as `"$(cat <<EOF ... EOF)"` triggers a stdin-wait deadlock in codex's IPC. The process stays alive, prints nothing, and sits idle indefinitely.

**Correct form**:

```bash
# write brief to temp file
cat > /tmp/codex-brief-wp-XX.md <<'BRIEF'
... brief content ...
BRIEF

# redirect stdin from the file; use `-` to tell codex to read from stdin
codex exec --full-auto --cd "$REPO_ROOT" - < /tmp/codex-brief-wp-XX.md \
  2>&1 | tee .work/codex-wp-XX.log
```

**Forbidden form** (will deadlock):

```bash
codex exec --full-auto "$(cat /tmp/brief.md)"   # ❌ IPC stdin-wait
codex exec --full-auto "$(cat <<EOF ... EOF)"   # ❌ same
```

### Rule 2 — Network-requiring commands MUST run on the Claude side before `codex exec`

`codex exec --full-auto` runs in `workspace-write` sandbox with `network_access: false`. `npm install` / `yarn add` / `pip install` / any fetch will fail with `EAI_AGAIN`.

Before launching codex:

1. Enumerate network-dependent steps from the plan.
2. Run them with Claude's Bash tool (or ask user to run).
3. In the brief, state explicitly: **"Dependencies already installed. DO NOT run install commands — network is disabled in your sandbox."**

## Required reads (every invocation)

1. `.agent/current-plan.md` — source of truth
2. `.agent/STATUS.md` — current phase, completed packages, blockers
3. `AGENT.md` / `AGENTS.md` — repo rules to echo into the brief
4. Current `git status` — to spot uncommitted state that codex might collide with

## Delivery loop

For each package (or batch of disjoint-scope packages) with `owner: codex`:

1. **Refresh** — re-read plan/status. Skip packages already `done`.
2. **Pre-flight (Claude side)**:
   - Run install / codegen / fetch steps the package requires.
   - Verify with `git status` that working tree is in a sane starting state.
3. **Brief** — write `/tmp/codex-brief-<pkg-id>.md` using `references/brief-template.md`. Include:
   - Package goal, scope boundaries, forbidden changes
   - Acceptance criteria (observable)
   - Validation commands codex should run locally
   - Explicit "DO NOT run install commands" clause
   - Repo conventions (commit style from AGENT.md, test framework, etc.)
   - Return format (what codex should print at the end)
4. **Launch**:
   ```bash
   mkdir -p .work
   codex exec --full-auto --cd "$PWD" - < /tmp/codex-brief-<pkg-id>.md \
     2>&1 | tee .work/codex-<pkg-id>.log &
   ```
   Use `run_in_background: true` with the Bash tool so Claude stays free to observe.
5. **Monitor** — use the `Monitor` tool on the log file. Watch for:
   - `EAI_AGAIN` → a network dep slipped through; kill, install, restart
   - `sandbox` / `permission` errors → adjust flags or move step back to Claude
   - `EXIT=` or completion marker
   - long silence (>5 min with no output) → likely stdin deadlock; kill and re-check launch form
6. **Collect** — on exit:
   - Read the tail of the log.
   - Read the package's required output (changed files via `git diff --stat`).
   - Extract codex's self-reported AC status from the log.
7. **Independent verify (Claude side)** — DO NOT trust the self-report alone:
   - Run the package's Claude-side validation commands (lint / typecheck / tests).
   - Inspect the diff yourself — scope creep, stray files, secret commits.
8. **Update status** — write phase, package status, commands run, outcomes, blockers to `.agent/STATUS.md`.
9. **Fix loop** — if validation fails:
   - Small, local failure → write a fix brief and re-launch codex for a targeted patch.
   - Integration / cross-package failure → Claude fixes directly or launches an integration-focused codex brief.
   - Scope drift → revert stray hunks, re-brief with tighter scope.

Move to the next package. When all packages with `owner: codex` are `done`, hand off to `codex-acceptance`.

## Parallelism

- **Read-only parallelism**: allowed freely (Claude subagents, Explore).
- **Write parallelism with multiple codex exec at once**: allowed only when all of:
  - Package scopes are disjoint at the file level.
  - No shared config, lockfile, schema, generated artifact, or migration chain.
  - Validations can run per-package.
- Otherwise run codex briefs sequentially. Cost of collision > cost of waiting.
- For truly independent parallel writes, consider separate git worktrees — one `codex exec --cd <worktree>` per thread.

## Brief must-haves

Every brief MUST contain (enforced — incomplete briefs cause rework):

- Package id, goal, scope allow-list, scope deny-list
- Repo commit convention (paste from `AGENT.md`)
- Explicit: "Network is disabled. Dependencies are installed. Do not run npm install / pip install / similar."
- Explicit: "Stay inside scope. Do not touch unrelated files."
- Validation commands to run locally
- Return format: the exact fields Claude will parse (package id, touched files, commands run, AC status, remaining risk)

See `references/brief-template.md`.

## Status maintenance

After every meaningful step update `.agent/STATUS.md`:

- current phase (implementing / validating / fixing)
- active work package
- recent commands + outcomes
- blockers
- decisions (with absolute date)
- next step

## Final response back to the user (only after all codex packages complete)

- What was delegated to codex vs. done by Claude
- Packages completed, packages deferred / blocked
- Claude-side validation results (not just codex self-report)
- Outstanding risks
- Next step: usually `codex-acceptance`

Do not call the overall task done here. `codex-acceptance` and `codex-handoff` come next.
