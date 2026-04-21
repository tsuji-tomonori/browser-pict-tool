# Acceptance checklist

## Independent verification (Claude side — do not skip)

- [ ] `git diff --stat` read; all changed files match declared scopes
- [ ] No stray debug / commented-out code in the diff
- [ ] Lockfile / config changes only where plan said so
- [ ] Package-level validation commands re-run by Claude (not trusting codex log)
- [ ] Repo-wide lint command green
- [ ] Repo-wide test command green
- [ ] Repo-wide format-check green
- [ ] UI typecheck green (if UI touched)
- [ ] Every acceptance criterion marked pass only with Claude-observed evidence

## Quality gates

- [ ] No blocker from reviewer-style inspection (correctness, regression, security, data integrity)
- [ ] Tests were added or tightened for behavior changes
- [ ] Commit convention in AGENT.md honored (if commits were made)
- [ ] Residual risk listed honestly

## Verdict

- [ ] ACCEPTED — all above pass
- [ ] REJECTED — at least one blocker; produced minimum blocker set
- [ ] Status file updated with verdict, evidence, fixes needed
