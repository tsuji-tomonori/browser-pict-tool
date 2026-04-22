# Security Hardening Issue Register (2026-04-21)

このレジスタは、`browser-pict-tool` のセキュリティ改善を実行可能な Issue に分割し、着手順と受け入れ条件を固定化するための管理台帳です。

## Priority and Execution Order

1. SEC-001: Spreadsheet Formula Injection を無害化する（High）
2. SEC-002: 計算量 DoS ガードレールを強化する（High）
3. SEC-003: XSS 回帰防止ルールを導入する（Critical/High）
4. SEC-004: LIKE/再帰ストレス耐性を強化する（Medium）
5. SEC-005: Worker protocol の入力検証を厳格化する（Medium）
6. SEC-006: セキュリティ運用ガイドを整備する（Medium）

## Issue Index

- [SEC-001](./issues/SEC-001-spreadsheet-formula-injection-hardening.md)
- [SEC-002](./issues/SEC-002-computational-dos-guardrails.md)
- [SEC-003](./issues/SEC-003-xss-regression-rails.md)
- [SEC-004](./issues/SEC-004-like-recursion-stress-hardening.md)
- [SEC-005](./issues/SEC-005-worker-protocol-input-validation.md)
- [SEC-006](./issues/SEC-006-security-operations-guidance.md)

## Milestone Definition

- M1 (blocking release hardening): SEC-001, SEC-002, SEC-003
- M2 (resilience and protocol hardening): SEC-004, SEC-005
- M3 (operator rollout): SEC-006

## Acceptance Gate

- M1 完了時に `task check` で repo gate を実施し、影響範囲に未解決の回帰がないこと。
- M2/M3 完了時に残リスクと deferred 項目を明文化した上で Go/No-Go 判定を行うこと。
