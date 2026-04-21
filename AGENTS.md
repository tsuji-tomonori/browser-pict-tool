# AGENTS.md

This repository supports two working modes:

- default implementation mode via [AGENT.md](/home/t-tsuji/project/browser-pict-tool/AGENT.md:1)
- PM / Tech Lead orchestration mode via this file

Use PM mode when the request is multi-step, ambiguous, risky, or benefits from explicit planning, delegation, acceptance, and fix loops.
The main Codex session owns the plan, integration, acceptance decision, and final user response.

## PM Skills To Prefer

- `eq-pm`
  - turn a vague or high-context ask into an execution-ready PM brief before kickoff
- `pm-factory-kickoff`
  - turn a fuzzy request into a scoped delivery plan
- `pm-parallel-delivery`
  - execute the plan with bounded delegation and validation
- `acceptance-gate`
  - make a hard go / no-go decision against AC and DoD
- `release-handoff`
  - prepare the final concise user-facing summary
- `browser-pict-tool-tdd`
  - use for any implementation work in this repo

## Main Session Responsibilities

1. Define the user-visible goal.
2. Separate goals, non-goals, constraints, assumptions, risks, and dependencies.
3. Decompose the work into verifiable work packages.
4. Decide what can be delegated and what must stay local.
5. Keep `.agent/current-plan.md` and `.agent/STATUS.md` current for non-trivial work.
6. Integrate results, run repo-wide validation, and resolve blockers.
7. Do not report completion until acceptance evidence is real.

## Repo Layout

- `packages/core/`
  - parser, constraints, generator, coverage, exporter, oracle, diagnostics
  - pure TypeScript, no DOM dependency
- `packages/worker/`
  - protocol, progress, cancellation, serialization boundary between UI and core
- `packages/web/`
  - Vite + TypeScript + standard Web API + Web Worker
  - keep UI thin; do not move core behavior here
- `tests/core/`
  - primary regression and acceptance coverage for repo behavior
- `tests/generated/`
  - generated artifacts only; regenerate instead of hand-editing
- `scripts/`
  - repo maintenance and generated artifact checks
- `docs/`
  - RFCs, implementation notes, workstream docs
- `skills/`
  - repo-local Codex skills
- `.agent/`
  - living delivery plan and status notes for long-running work

## Commands

- install: `npm install`
- lint: `task lint`
- typecheck: `task typecheck`
- format check: `task format-check`
- format write: `task format`
- core test suite: `task test`
- repo gate: `task check`
- focused core test: `node --experimental-strip-types --test tests/core/<name>.test.ts`
- current core suite: `node --experimental-strip-types --test tests/core/*.test.ts`
- web typecheck: `npm --prefix packages/web run check`
- web build: `npm --prefix packages/web run build`
- web dev smoke: `task web:dev`
- upstream fixture import regeneration: `node --experimental-strip-types scripts/import-upstream-pict-tests.ts`
- upstream materialization regeneration: `node --experimental-strip-types scripts/materialize-upstream-fixtures.ts`
- generated fixture integrity: `node --experimental-strip-types scripts/check-fixture-integrity.ts`

## Engineering Constraints

- Follow red-green-refactor. Read [skills/browser-pict-tool-tdd/SKILL.md](/home/t-tsuji/project/browser-pict-tool/skills/browser-pict-tool-tdd/SKILL.md:1) before changing behavior.
- Start from the smallest affected layer: `packages/core` first, `packages/worker` second, `packages/web` last.
- Keep stable import surfaces under `@browser-pict-tool/core` and documented subpath exports.
- Treat `.work/pict` as upstream reference input only, never production runtime input.
- Treat `tests/generated` as generated output only.
- Keep `packages/web` framework-free unless the user explicitly asks for a design change that justifies a new dependency.
- Preserve browser-local execution. Do not introduce telemetry, CDN dependencies, or network calls without explicit product direction.
- Node 22 and `node --experimental-strip-types` are part of the supported toolchain; use them consistently for TypeScript execution in scripts and tests.

## Parallelism Policy

- Parallelize read-only exploration and review aggressively when the questions are independent.
- Parallelize write work only when file scopes are materially disjoint and there is no shared config, lockfile, schema, or generated artifact collision.
- If overlap is unclear, switch back to sequential writes.
- The main session remains responsible for combined validation even when implementation work is delegated.

## Acceptance Standard

Separate package-level Acceptance Criteria from repo-wide Definition of Done.

Minimum DoD for non-trivial work:

- relevant focused validations pass
- repo-wide validation passes for touched layers
- no unexplained scope drift
- required tests or docs were updated
- blocking review issues are resolved
- residual risk and follow-up are explicitly recorded

## Status Files

For non-trivial work, treat these as living documents:

- `.agent/current-plan.md`
  - source of truth for scope, work packages, AC, validation, and exit criteria
- `.agent/STATUS.md`
  - current phase, active package, commands run, decisions, blockers, acceptance state

If they already contain an active delivery, do not overwrite them with starter templates.
Update them incrementally.

## Review Focus

Prioritize these risks in review and acceptance:

- generator and coverage correctness
- constraint and oracle regressions
- cancellation and streaming behavior
- stable public exports from `packages/core`
- browser memory / performance regressions when web or streaming paths change
- missing regression tests for bug fixes

## Final Response Rule

Do not answer with a vague "done".
Return:

- what changed
- what was verified
- what remains risky or deferred
