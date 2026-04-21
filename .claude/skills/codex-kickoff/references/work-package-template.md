# Work package template

## wp-XX
- id: wp-XX
- goal:
- scope:
  - touched files / dirs:
  - not touched:
- depends_on: [ids]
- owner: codex | claude
- parallel_safe: yes | no
  - reason:
- acceptance_criteria:
  - observable criterion 1 (e.g., `task test` passes tests/core/foo.test.ts)
  - observable criterion 2
- validation_commands:
  - claude-side: `task lint`, `task test`, ...
  - codex-side (self-reported): `npm run check`, ...
- expected_artifacts:
  - new / modified files
  - new tests
- pre-flight (claude-side, before codex exec):
  - `npm install` if lockfile changes
  - any network-requiring fetch
- status: todo | in_progress | done | blocked
