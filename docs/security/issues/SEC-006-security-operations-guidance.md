# SEC-006: セキュリティ運用ガイドを整備する

- Severity: Medium
- Area: docs
- Goal: ローカル利用とサーバ組み込み利用で必要な防御策を明文化する。

## Scope

- Threat model の前提・対象外・残リスクの記載。
- Integrator 向け推奨設定（input size limit, timeout, rate limit, sandbox）。
- 脆弱性報告と triage フロー案。

## Tasks

1. Security guide 文書を新規作成/更新。
2. 「導入時チェックリスト」を追加。
3. 各セキュリティ Issue とのトレーサビリティを記載。

## Acceptance Criteria

- 開発者・運用者双方が実装前提と残リスクを判断できる。
- High/Critical リスクの暫定回避策が明記される。

## Validation

- ドキュメントレビュー（maintainer 1名以上）
- `task check`
