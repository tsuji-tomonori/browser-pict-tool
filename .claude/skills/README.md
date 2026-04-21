# Claude Code skills — codex delegation suite

Four skills for running Claude Code as the PM while `codex exec` does the heavy writing. Mirrors the phase structure of `codex-pm-interactive-starter.zip`, but flipped: **Claude orchestrates, codex implements.**

## Flow

1. `/codex-kickoff` — Turn a fuzzy request into a scoped plan. Writes `.agent/current-plan.md` and `.agent/STATUS.md`. No coding yet.
2. `/codex-delivery` — Pre-install network deps on the Claude side, write per-package briefs, run `codex exec --full-auto - < /tmp/brief.md` in background, monitor, integrate, independently verify.
3. `/codex-acceptance` — Claude-side independent re-run of validation, diff sanity, AC/DoD verdict. Drives the fix loop.
4. `/codex-handoff` — Final user-facing summary after ACCEPTED.

## Why this shape

`codex-pm-interactive-starter` was built for Codex-as-PM (Codex orchestrates subagents). Our constraint is the opposite: the user asked for Claude to stay in the PM seat while codex does implementation. Same artifacts (`.agent/current-plan.md`, `.agent/STATUS.md`) because they still work as the shared source of truth across sessions.

## Two rules baked into `codex-delivery`

Both cost real hours on 2026-04-18 (see memory `feedback_codex_delegation.md`):

1. **Brief goes via stdin redirect**, never as a long command argument. `codex exec ... - < /tmp/brief.md` works; `codex exec ... "$(cat …)"` deadlocks.
2. **Network-requiring commands run on Claude side** before `codex exec`. The `--full-auto` sandbox has `network_access: false`; `npm install` / `pip install` will fail with `EAI_AGAIN`. The brief must say "dependencies already installed, do not run install commands."

## Artifacts

- Plan: `.agent/current-plan.md`
- Status: `.agent/STATUS.md`
- Codex logs: `.work/codex-<pkg-id>.log`
- Codex briefs: `/tmp/codex-brief-<pkg-id>.md`

## Invoking

```
/codex-kickoff     <request>
/codex-delivery
/codex-acceptance
/codex-handoff
```

Each skill says when to use / when not to use in its SKILL.md frontmatter.
