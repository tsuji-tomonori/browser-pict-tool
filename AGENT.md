# Agent Guide

This repository defaults to test-driven development.

Before changing behavior, read [skills/browser-pict-tool-tdd/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/browser-pict-tool-tdd/SKILL.md:1) and follow that workflow.

For complex multi-step work, PM-style orchestration is also available.
Read [AGENTS.md](/home/t-tsuji/project/browser-pict-tool/AGENTS.md:1), [PLANS.md](/home/t-tsuji/project/browser-pict-tool/PLANS.md:1), and [IMPLEMENT.md](/home/t-tsuji/project/browser-pict-tool/IMPLEMENT.md:1), then use:

- [skills/pm-factory-kickoff/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/pm-factory-kickoff/SKILL.md:1)
- [skills/pm-parallel-delivery/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/pm-parallel-delivery/SKILL.md:1)
- [skills/acceptance-gate/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/acceptance-gate/SKILL.md:1)
- [skills/release-handoff/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/release-handoff/SKILL.md:1)

## Core Rules

- Start from the smallest affected layer: `core` first, `worker` second, `web` last.
- Add or tighten a failing test before changing production code.
- Run the narrowest relevant check first, then the broader suite for the touched layer.
- Treat `.work/pict` as upstream reference input only, not production runtime input.
- Treat `tests/generated` as generated output only. Regenerate it with scripts instead of editing it by hand.

## Commit Messages

- Use Conventional Commits style and write the subject in Japanese.
- Use the format: `<type>(<scope>): <要約>`
- Use one of these `type` values unless there is a strong reason not to: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Use `scope` for the affected area when it improves clarity: `core`, `worker`, `web`, `tests`, `scripts`, `repo`.
- Keep the subject to one line and state the user-visible or engineering outcome, not just the file operation.
- Add a body for non-trivial commits and describe the intent and requirement coverage explicitly.
- Prefer the following body sections in Japanese:
  - `背景:` why the change was needed
  - `変更内容:` what changed
  - `要件:` which requirement, RFC, bug, or acceptance condition is being satisfied
  - `テスト:` which checks were run
- Use `BREAKING CHANGE:` only when the change is intentionally incompatible.

Example:

```text
feat(core): 制約付きモデルの検証エラーを追加

背景:
- upstream 互換ケースで未知パラメータの診断が不足していた

変更内容:
- validator に未知パラメータ検出を追加
- 回帰テストを tests/core に追加

要件:
- docs/testing-architecture-ja.md の core validator 責務を満たす
- upstream fixture の semantic 検証方針を維持する

テスト:
- task lint
- task format-check
- task test
```

## Common Commands

- Lint: `task lint`
- Format check: `task format-check`
- Format write: `task format`
- Default repo test suite: `task test`
- Git commit template enable: `git config commit.template .gitmessage.txt`
- Focused core test: `node --experimental-strip-types --test tests/core/<name>.test.ts`
- Current core suite: `node --experimental-strip-types --test tests/core/*.test.ts`
- Web typecheck: `npm --prefix packages/web run check`
- Upstream index regeneration: `node --experimental-strip-types scripts/import-upstream-pict-tests.ts`
- Upstream fixture regeneration: `node --experimental-strip-types scripts/materialize-upstream-fixtures.ts`
- Fixture integrity check: `node --experimental-strip-types scripts/check-fixture-integrity.ts`
