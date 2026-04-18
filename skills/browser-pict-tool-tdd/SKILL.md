---
name: browser-pict-tool-tdd
description: Apply the browser-pict-tool repository's test-driven workflow. Use when Codex needs to implement or change parser, constraints, generator, worker, web, fixture generation, or test-related documentation in this repo; especially when it should choose the correct test layer, add a failing regression first, run focused TypeScript tests with `node --experimental-strip-types`, and keep generated fixture artifacts consistent.
---

# Browser Pict Tool TDD

## Overview

Follow red-green-refactor for every behavioral change in this repository.
Start at the smallest affected layer, add or tighten a failing test first, then change production code only enough to make that test pass.

## Choose The Test Layer

- Put parser, validator, constraint, generator, coverage, and exporter work in `packages/core` and test it from `tests/core`.
- Put request/response protocol, progress reporting, cancellation, and serialization work in `packages/worker` and test it from `tests/worker` once those tests exist.
- Keep `packages/web` coverage as thin smoke coverage. Do not move core behavior checks into UI tests when a `core` or `worker` test can cover them.

## Run The Narrowest Check First

- Run lint after touching TypeScript or repo tooling: `task lint`
- Run formatting checks before finishing shared config changes: `task format-check`
- Run the default repo gate before finishing work that spans layers: `task test`
- Run one focused core file while iterating: `node --experimental-strip-types --test tests/core/<name>.test.ts`
- Run the current core suite before finishing a core change: `node --experimental-strip-types --test tests/core/*.test.ts`
- Run web type checking after UI changes: `npm --prefix packages/web run check`
- Regenerate upstream inventory when fixture import logic changes: `node --experimental-strip-types scripts/import-upstream-pict-tests.ts`
- Regenerate materialized upstream fixtures when fixture shaping changes: `node --experimental-strip-types scripts/materialize-upstream-fixtures.ts`
- Verify generated fixture consistency after regeneration: `node --experimental-strip-types scripts/check-fixture-integrity.ts`

## Follow The TDD Loop

1. Decide the smallest layer that can expose the behavior.
2. Add or update a failing test before touching production code.
3. Run only that test until it fails for the expected reason.
4. Implement the minimum production change.
5. Re-run the focused test until it turns green.
6. Run the broader relevant suite.
7. Refactor only while the suite stays green.

## Protect Repo Conventions

- Treat `.work/pict` as upstream reference input only. Do not import it from production code.
- Treat `tests/generated` as generated output only. Regenerate it with scripts instead of editing it by hand.
- Keep upstream fixture assertions semantic unless the case is intentionally a small exact golden fixture.
- Add a regression test for every bug fix.
- Prefer test data that stays close to upstream PICT syntax and documented compatibility factors.

## Use The Commit Convention

- When asked to commit, use Japanese Conventional Commits in the form `<type>(<scope>): <要約>`.
- Use `type` from `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Use `scope` when it helps the reader identify the layer: `core`, `worker`, `web`, `tests`, `scripts`, `repo`.
- Write the subject as an outcome, not as file manipulation.
- For non-trivial commits, add a Japanese body with these sections:
  - `背景:`
  - `変更内容:`
  - `要件:`
  - `テスト:`
- In `要件:`, mention the requirement source or acceptance condition, such as RFC sections, testing architecture rules, bug reports, or user-requested behavior.
- In `テスト:`, list the commands that were actually run.
- Use `BREAKING CHANGE:` only for intentional incompatible changes.

## Read These Files When Needed

- Read `docs/testing-architecture-ja.md` for layer boundaries and fixture policy.
- Read `scripts/README.md` before changing generated inventories or integrity checks.
- Read `tests/fixtures/upstream/README.md` before changing upstream materialization.
- Read `.gitmessage.txt` when preparing a commit message.
