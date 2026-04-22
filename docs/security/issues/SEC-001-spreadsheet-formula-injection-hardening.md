# SEC-001: Spreadsheet Formula Injection を無害化する

- Severity: High
- Area: `packages/core/exporters/*`, `packages/web/src/lib/excel-export.ts`
- Goal: CSV/TSV/Excel における `=`, `+`, `-`, `@` 先頭セル値の式評価を防止する。

## Background

エクスポートされたファイルが表計算ソフトで開かれる場合、先頭文字が式トリガー文字だと意図しない計算・外部参照が実行されるリスクがある。

## Scope

- CSV/TSV/Excel エクスポートのセル値変換ポリシーを統一する。
- デフォルトを安全側（neutralize）に設定する。
- 既存の quoting/escaping 仕様との競合を回避する。

## Out of Scope

- Markdown の HTML sanitize（SEC-004/006 で扱う）。

## Tasks

1. neutralization ユーティリティを core exporters に追加。
2. Excel exporter 側で同一ポリシー適用。
3. 単体テストを追加（各トリガー文字 + 通常値 + 既存エスケープ併用ケース）。
4. 互換性影響を docs に記載。

## Acceptance Criteria

- トリガー文字で始まる全セル値が式として評価されない形式で出力される。
- 既存フォーマット回帰（CSV quote 破壊等）がない。
- 関連テストが追加される。

## Validation

- `node --experimental-strip-types --test tests/core/*.test.ts`
- `task check`
