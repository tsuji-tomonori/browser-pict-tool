# RFC-0001: ブラウザ実行型 PICT 互換テスト組み合わせツール

- Status: Draft
- Author: OpenAI / ChatGPT
- Date: 2026-04-17
- Target Version: v0.1
- Audience: Product / Frontend / QA / Security

---

## 1. 概要

本RFCは、**Webサーバー上で一切の業務処理を行わず**、ブラウザだけで PICT 互換の組み合わせテストケースを生成・表示・エクスポートするツールの設計方針を定義する。

本ツールの前提は以下の通りである。

1. 実行時の計算はすべてブラウザ内で完結する。
2. 実装はエンドツーエンドで TypeScript を採用する。
3. 入力は PICT 互換のテキストモデルをベースにする。
4. 結果はブラウザ上で表形式に表示する。
5. 結果は CSV / TSV / Markdown の各形式でダウンロードできる。
6. 配備形態は静的ホスティングを前提とし、アプリ配信後のサーバー計算・保存・変換を行わない。

本RFCは、**初期版 (v0.1) で実装する機能範囲**、**PICT 互換性の考え方**、**アーキテクチャ**、**性能要件**、**セキュリティ要件**、**段階的な実装計画**を定義する。

---

## 2. 背景

現状の PICT はコマンドラインツールであり、プレーンテキストのモデルを入力としてテストケースを生成する。既定では pairwise (2-wise) 生成であり、`/o` オプションで n-wise に拡張できる。また、パラメータ定義、制約、サブモデル、エイリアス、負値(negative testing)、重み付け、シード入力などの機能を持つ。
本件では、これらを参考にしつつ、**ブラウザ実行・TypeScript 実装・サーバー非依存**という別の制約条件を満たす必要がある。

さらに、入力モデルには機密性の高い業務条件や構成条件が含まれる可能性があるため、**モデル内容をサーバーへ送信しないこと**が重要である。したがって、静的ファイルを配るだけで運用可能なアーキテクチャが望ましい。

---

## 3. 目的

### 3.1 ゴール

本RFCのゴールは以下である。

- G1. ブラウザ単体で PICT ベースの組み合わせテストケースを生成できること
- G2. 実行時にサーバー計算・保存・変換を行わないこと
- G3. コアロジックを純粋 TypeScript で実装すること
- G4. 生成結果を表形式で閲覧できること
- G5. 生成結果を CSV / TSV / Markdown でエクスポートできること
- G6. 将来の PICT 互換拡張に耐える構造にすること
- G7. UI が固まらないこと（長時間計算をメインスレッドで実行しないこと）

### 3.2 非ゴール

本RFCの非ゴールは以下である。

- NG1. `pict.exe` のバイナリ互換移植
- NG2. PICT と**完全に同一の行数・同一の行順・同一の選択結果**を常に再現すること
- NG3. サーバー上の永続化、ログイン、共有URL、履歴同期
- NG4. チームコラボレーション機能（コメント、レビュー、共同編集）
- NG5. 初期版で PICT の全機能を網羅すること

---

## 4. 設計原則

1. **Runtime local-first**
   実行時の処理はブラウザ内に閉じる。サーバーは静的アセット配信のみ担当する。

2. **PICT-inspired, not pict.exe-clone**
   PICT のモデル表現と利用感に寄せるが、出力の完全一致ではなく、**構文互換と意味互換**を優先する。

3. **Deterministic by default**
   同一入力・同一オプションに対しては、初期版では再現性の高い決定的出力を採用する。

4. **Responsive UX**
   計算は Web Worker に隔離し、UI の応答性を維持する。

5. **Streaming-friendly**
   進捗、警告、暫定結果を段階的に UI に返せる構造にする。

6. **Strict privacy posture**
   データ送信・外部テレメトリ・第三者CDN依存を避ける。

---

## 5. ユーザーストーリー

### 5.1 テスト設計者

- PICT 風のモデルを貼り付け、pairwise ないし 3-wise のケースを即座に生成したい
- 制約を含むモデルでも、矛盾や構文エラーの場所を行番号付きで知りたい
- 出力結果をそのまま TSV/CSV/Markdown で持ち帰りたい

### 5.2 セキュリティ重視の利用者

- モデル内容を外部サーバーに送信したくない
- オフライン環境に近い閉域用途でも使いたい
- ログや解析ビーコンなしで使いたい

### 5.3 QAリーダー

- 同じモデルから再現可能な結果を得たい
- 生成件数、パラメータ数、制約数、カバレッジ達成状況を確認したい
- 将来的にシードや重み付けにも対応できる土台が欲しい

---

## 6. 要件

## 6.1 機能要件

### FR-1 入力

- ユーザーはモデルテキストを直接エディタに貼り付けられる
- ローカルファイルを開いて読み込める
- サンプルモデルをワンクリックで読み込める

### FR-2 モデル構文解析

初期版は次をサポートする。

- コメント行 (`#`)
- 空行
- パラメータ定義
- 制約定義
- `IF / THEN / ELSE`
- `AND / OR / NOT`
- `IN`
- `LIKE`
- パラメータ同士の比較
- `o`（生成強度。UI上では “strength/order” として指定）
- 大文字小文字の厳密評価切替
- 負値 prefix（negative testing）

### FR-3 テストケース生成

- 既定は 2-wise
- 任意の n-wise を指定可能
- 制約を満たす行のみ生成
- negative testing では、1行内に複数の invalid 値が同居しない方針を採用する
- 同一入力に対して決定的な出力を返す

### FR-4 結果表示

- 結果を表形式で表示する
- ヘッダー固定
- 行数表示
- パラメータ数、制約数、生成時間、強度(order) を表示する
- 並べ替え、簡易フィルタ、列幅調整は v0.1 に含める
- 大規模結果に備え、仮想スクロールに対応できる構造にする

### FR-5 ダウンロード

- CSV でダウンロードできる
- TSV でダウンロードできる
- Markdown テーブルでダウンロードできる
- ダウンロードはブラウザ内で完結する

### FR-6 バリデーション

- 構文エラーを行/列つきで表示する
- 未定義パラメータ参照を検出する
- 矛盾制約による解なしを検出する
- カバレッジ未達が残る場合、その理由を表示する

### FR-7 進捗とキャンセル

- 生成中に進捗バーを表示する
- ユーザーが生成をキャンセルできる
- Worker から進捗・警告・結果を段階送信できる

## 6.2 非機能要件

### NFR-1 プライバシー

- 初期アセット読込後、モデル内容や生成結果をネットワーク送信しない
- デフォルトで外部分析タグを含めない
- CSP により外部送信先を制限する

### NFR-2 性能

- 中規模モデル（例: 10〜20 パラメータ、各 3〜10 値、2-wise〜3-wise）を実用時間で生成できること
- UI スレッドをブロックしないこと
- 結果表示は 1,000 行超でも操作可能であること

### NFR-3 保守性

- コアロジックと UI を分離する
- 生成エンジンは Node 依存ゼロの pure TS とする
- UI フレームワーク差し替えが比較的容易であること

### NFR-4 再現性

- 既定動作は deterministic
- 将来ランダマイズを実装しても seed 指定で再現可能にする

### NFR-5 アクセシビリティ

- キーボード操作で主要操作が完結する
- エラーメッセージをテキストで提示する
- 色だけに依存しない状態表示を行う

---

## 7. PICT 互換性方針

## 7.1 互換対象の考え方

本ツールは、**PICT のモデル構文・制約表現・利用フローに互換性を持たせる**ことを目標にする。ただし、生成アルゴリズムは TypeScript で独自再実装するため、以下を明示する。

- **保証するもの**
  - サポート対象構文に対する意味解釈
  - 制約評価の整合性
  - 指定 strength に応じた組み合わせカバレッジ
  - 出力の再現性（初期版）

- **保証しないもの**
  - `pict.exe` と同一の出力行数
  - `pict.exe` と同一の行順
  - `pict.exe` と同一の内部ヒューリスティクス

## 7.2 フェーズ別互換範囲

| 項目             | PICT 由来機能                | v0.1 | v0.2 | v0.3 |
| ---------------- | ---------------------------- | ---: | ---: | ---: |
| パラメータ定義   | `Param: A, B, C`             |   ✅ |   ✅ |   ✅ |
| コメント/空行    | `#`                          |   ✅ |   ✅ |   ✅ |
| 基本制約         | `IF/THEN/ELSE`, `AND/OR/NOT` |   ✅ |   ✅ |   ✅ |
| `IN`, `LIKE`     | 条件演算子                   |   ✅ |   ✅ |   ✅ |
| パラメータ比較   | `[A] = [B]`                  |   ✅ |   ✅ |   ✅ |
| n-wise           | `/o` 相当                    |   ✅ |   ✅ |   ✅ |
| case-sensitive   | `/c` 相当                    |   ✅ |   ✅ |   ✅ |
| negative testing | `/n` 相当                    |   ✅ |   ✅ |   ✅ |
| aliases          | `/a` 相当                    |    - |   ✅ |   ✅ |
| parameter reuse  | `<OS_1>` 形式                |    - |   ✅ |   ✅ |
| sub-models       | `{ A, B } @ 2`               |    - |   ✅ |   ✅ |
| weighting        | `(10)`                       |    - |    - |   ✅ |
| seeding          | `/e`                         |    - |    - |   ✅ |
| randomize/seed   | `/r`                         |    - |    - |   ✅ |
| 統計出力         | `/s` 相当                    |   ✅ |   ✅ |   ✅ |

### 判断理由

- v0.1 は、**実用上の核**である「制約つき n-wise 生成 + 表示 + エクスポート」に絞る
- aliases / sub-models / seeding / weights は互換性として重要だが、初回実装コストが高いため段階導入とする
- 将来の差分検証を容易にするため、AST と内部データモデルは v0.3 を見据えて設計する

---

## 8. アーキテクチャ

## 8.1 配備方針

### 原則

- 配備物は静的ファイルのみ（HTML / CSS / JS / assets）
- 配備先は GitHub Pages, Cloudflare Pages, S3 static website, nginx 静的配信などを想定
- Web サーバーはアセット配信のみ行い、モデル評価・生成・変換は行わない

### 実行時ネットワーク方針

- アプリ本体のロード後、モデル入力・生成・エクスポートに伴う追加 API リクエストを発生させない
- 解析タグ、広告タグ、外部フォント CDN は初期版では不採用
- 必要なライブラリはビルド時にバンドルする

## 8.2 論理構成

```text
[UI App]
  ├─ Model Editor
  ├─ Option Panel
  ├─ Result Table
  ├─ Export Panel
  └─ Diagnostics Panel
        │
        ▼
[Worker Bridge]
        │ postMessage
        ▼
[Generation Worker]
  ├─ Lexer / Parser
  ├─ AST / Validator
  ├─ Normalizer
  ├─ Constraint Compiler
  ├─ Tuple Space Builder
  ├─ Generator Engine
  ├─ Coverage Analyzer
  └─ Export Formatter
```

## 8.3 パッケージ構成（推奨）

```text
/packages
  /core
    /parser
    /model
    /constraints
    /generator
    /coverage
    /exporters
    /diagnostics
  /worker
    /protocol
    /entry
  /web
    /components
    /pages
    /hooks
    /state
```

### 各パッケージの責務

- `core`
  - pure TypeScript
  - DOM 依存なし
  - ブラウザ/Node どちらでも動く単体テスト可能な領域

- `worker`
  - UI と core の橋渡し
  - 進捗通知・キャンセル制御
  - エラーをシリアライズして返す

- `web`
  - エディタ、表、ボタン、通知、設定UI
  - Worker の起動・結果受信・ダウンロードUI

## 8.4 テスト構成（推奨）

責務分離はテスト構成にもそのまま反映する。
テストの主戦場は `core` と `worker` に置き、`web` は薄いスモークに留める。

```text
/packages
  /core
    /parser
    /model
    /constraints
    /generator
    /coverage
    /exporters
    /diagnostics
  /worker
  /web

/tests
  /fixtures
    /unit
    /golden
    /upstream
    /perf
  /helpers
  /generated

/scripts
  import-upstream-pict-tests.ts
  check-feature-coverage.ts
  check-fixture-integrity.ts
```

- `core`
  - Node 上のテストから直接呼び出す pure TS 領域
  - parser, validator, constraint evaluator, generator, coverage, exporters を機械的に検証する

- `worker`
  - protocol, 進捗通知, キャンセル, エラー直列化の統合テストを担う

- `web`
  - E2E は主要フローのスモークに絞る
  - 入力、生成開始、結果表示、エクスポートの最低限のみ検証する

- `tests/fixtures/upstream`
  - `.work/pict/test` の upstream コーパスを正規化して保持する
  - 行順や行数の完全一致ではなく、意味互換を中心に検証する

- `tests/generated`
  - upstream 索引、feature coverage レポートなどの再生成可能な成果物を置く

- `docs/pict-compatibility-factors.pict`
  - fixture のタグ付けと feature coverage 検査の母表として扱う

詳細は `docs/testing-architecture-ja.md` を参照。

---

## 9. コアデータモデル

## 9.1 正規化後モデル

```ts
type CanonicalModel = {
  parameters: Parameter[];
  constraints: ConstraintNode[];
  options: {
    strength: number;
    caseSensitive: boolean;
    negativePrefix: string;
  };
};

type Parameter = {
  id: string;
  displayName: string;
  values: Value[];
};

type Value = {
  id: string;
  raw: string;
  normalized: string | number;
  isNegative: boolean;
  aliases?: string[];
  weight?: number;
};
```

## 9.2 結果モデル

```ts
type GeneratedSuite = {
  header: string[];
  rows: string[][];
  stats: {
    strength: number;
    parameterCount: number;
    constraintCount: number;
    generatedRowCount: number;
    generationTimeMs: number;
    uncoveredTupleCount: number;
  };
  warnings: Diagnostic[];
};
```

## 9.3 診断モデル

```ts
type Diagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  line?: number;
  column?: number;
  detail?: string;
};
```

---

## 10. 解析とバリデーション

## 10.1 Lexer/Parser

初期版では手書きパーサーを採用する。理由は以下。

- PICT 互換の行指向構文に合わせやすい
- 行/列付きエラーを出しやすい
- 段階的に文法追加しやすい
- 依存削減につながる

### パース対象

- パラメータ定義部
- 制約定義部
- コメント、空行
- 角括弧のパラメータ参照
- 文字列/数値/集合/比較演算子

## 10.2 セマンティック検査

- パラメータ名の重複
- 値集合の空定義
- 未定義パラメータ参照
- 制約内の型不整合
- 生成 strength がパラメータ数を超える場合のエラー
- negative 値の不正指定
- 矛盾制約による satisfiable row 不存在の検出

## 10.3 制約評価方式

制約は AST から評価関数へコンパイルする。
評価は **3値論理**（true / false / unknown）で扱う。

### 3値論理を採用する理由

生成途中の部分割当てに対して、

- すでに不可能な候補は早期 prune できる
- まだ未確定の候補は保持できる
- 深いバックトラックを減らしやすい

---

## 11. 生成アルゴリズム

## 11.1 方針

アルゴリズムは **IPOG 系に近い coverage-driven greedy 方式**を採用する。
ただし、初期版では PICT の内部実装を逐語再現せず、以下の目的を優先する。

1. 制約対応
2. ブラウザ内での計算可能性
3. 決定性
4. 実装見通し
5. 将来の機能拡張性

## 11.2 概略手順

1. モデルを正規化する
2. 指定 strength に応じて、必要な t-wise tuple 空間を定義する
3. 制約に違反しない tuple のみ対象にする
4. まだ未カバーの tuple を最大限多く覆うように行を貪欲生成する
5. 各行の構築中は部分割当てに対して制約 prune を行う
6. 行が完成したら、被覆済み tuple を差し引く
7. 未カバーが 0 になるまで反復する

## 11.3 実装詳細

### tuple の表現

- パラメータ組の組み合わせごとに index を付与
- 値選択を mixed-radix で整数キー化
- 巨大モデルでは全 tuple を事前展開せず、必要に応じて遅延展開する

### 行生成

- 候補行を複数作り、最もカバレッジ得点が高いものを採用
- 候補値のスコアは
  - 新規カバー tuple 数
  - 制約余裕度
  - negative 値の隔離条件
  - 決定的 tie-breaker
    で評価する

### バックトラック

- 制約が厳しい場合は深さ制限付きバックトラックを許可する
- 一定回数失敗時は新しい anchor tuple から再始動する

## 11.4 negative testing の扱い

PICT に倣い、negative 値は「その値単体の異常系」を検証する用途として扱う。
初期版では以下を保証する。

- 1行に複数の negative 値を同居させない
- negative 値を含む行では、他列は valid 値のみから選ぶ
- valid 値同士の通常カバレッジは別途維持する

## 11.5 決定性

初期版ではランダマイズを実装しない。
ソート順、候補評価順、tie-breaker を固定することで、同じモデルから同じ結果を返す。

---

## 12. Web Worker 方針

生成処理は Web Worker で実行する。
UI スレッドではテキスト編集・進捗更新・結果描画のみを行う。

### Worker を使う理由

- n-wise 生成は計算量が大きく、メインスレッド実行ではUIが固まりやすい
- 解析・生成・エクスポートを分離しやすい
- キャンセル、進捗通知、暫定統計の伝播がやりやすい

### Worker プロトコル例

```ts
type WorkerRequest =
  | { type: "PARSE"; modelText: string; options: UiOptions }
  | { type: "GENERATE"; modelText: string; options: UiOptions }
  | { type: "CANCEL"; jobId: string }
  | { type: "EXPORT"; format: "csv" | "tsv" | "md"; suite: GeneratedSuite };

type WorkerResponse =
  | { type: "PROGRESS"; jobId: string; progress: number; stage: string }
  | { type: "PARSE_OK"; jobId: string; diagnostics: Diagnostic[] }
  | { type: "GENERATE_OK"; jobId: string; suite: GeneratedSuite }
  | { type: "ERROR"; jobId: string; diagnostics: Diagnostic[] };
```

---

## 13. UI/UX 仕様

## 13.1 画面構成

1. **モデル入力エリア**
   - テキストエディタ
   - ファイル読込
   - サンプル挿入
   - 構文ハイライト（v0.2 以降でも可）

2. **オプションエリア**
   - strength/order
   - case sensitive
   - negative prefix
   - advanced options（段階導入）
   - 生成開始
   - キャンセル

3. **診断エリア**
   - 構文エラー
   - 警告
   - 未達カバレッジ
   - 実行統計

4. **結果エリア**
   - テーブル表示
   - 行数、列数
   - ソート/フィルタ
   - CSV/TSV/Markdown ダウンロード

### 13.1.1 PICT オプションと UI 対応

`.work/pict/doc/pict.md` と `.work/pict/cli/cmdline.cpp` を基準にすると、現行の PICT 系オプション面は次のとおり。

| オプション | 意味                                                     | upstream 上の位置づけ                                          | UI 方針                                                                               |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/o:N      | max`                                                     | 生成強度。`2` が pairwise、`3` 以上が n-wise、`max` は最大強度 | 公開 usage                                                                            | v0.1 で表示。`strength/order` 入力として出す                       |
| `/c`       | case-sensitive 評価                                      | 公開 usage                                                     | v0.1 で表示。toggle で出す                                                            |
| `/n:C`     | negative prefix の変更                                   | 公開 usage                                                     | v0.1 で表示。1 文字入力で出す                                                         |
| `/s`       | 統計表示                                                 | 公開 usage                                                     | 専用トグルは必須ではない。Web では診断エリア/結果メタに常時表示して `/s` 相当を満たす |
| `/d:C`     | 値区切り文字の変更                                       | 公開 usage                                                     | 初期 UI の主導線には出さない。必要なら parser/import の advanced setting として出す   |
| `/a:C`     | alias 区切り文字の変更                                   | 公開 usage                                                     | alias 対応の v0.2 で advanced setting として出す                                      |
| `/e:file`  | seeding 行ファイル                                       | 公開 usage                                                     | v0.3 で file upload として出す                                                        |
| `/r[:N]`   | ランダマイズ。`/r` は乱数 seed 自動、`/r:N` は seed 固定 | 公開 usage                                                     | v0.3 で `randomize` toggle + `seed` 入力として出す                                    |
| `/f:text   | json`                                                    | 出力形式切替                                                   | repo 実装拡張                                                                         | UI には出さない。Web では内部データから独自に表示/エクスポートする |
| `/p`       | preview generation                                       | repo 実装拡張かつ hidden                                       | UI には出さない。開発用フラグ扱い                                                     |
| `/x[:N]`   | approximate generation                                   | repo 実装拡張かつ hidden                                       | UI には出さない。将来の performance mode 候補                                         |
| `/v`       | verbose mode                                             | repo 実装拡張かつ hidden                                       | UI には出さない。デバッグ専用                                                         |

UI 設計上の整理:

- 初期表示するのは `strength/order`、`case sensitive`、`negative prefix`
- 折りたたみの advanced options 候補は `value delimiter`、`alias delimiter`、`randomize`、`seed`、`seed file`
- `/s` は CLI では「統計だけ出す」スイッチだが、Web では統計を常時見せる方が自然なので専用オプション化しない
- `/f` は CLI の出力経路の都合によるオプションであり、ブラウザ UI のオプションではなく export 機能側で吸収する
- `/p` `/x` `/v` は互換資料上は把握しておくが、利用者向け UI には出さない

## 13.2 結果テーブル

最低限の機能:

- sticky header
- 横スクロール
- 列ソート
- 文字列フィルタ
- セル内容コピー
- 行番号表示

### 大規模結果

- 1,000 行超では仮想スクロールを推奨
- Markdown エクスポートが巨大になる場合は警告表示

---

## 14. エクスポート仕様

## 14.1 TSV

- PICT 出力との親和性を最優先
- 区切りは `\t`
- ヘッダー1行 + データ行
- 改行は `\n`

## 14.2 CSV

- Excel 利用を考慮し UTF-8 with BOM を既定にする
- ダブルクォートによるエスケープを行う
- セル内改行、カンマ、ダブルクォートを正しく処理する

## 14.3 Markdown

- GitHub 互換の表形式を出力する
- `|` はエスケープする
- セル内改行は `<br>` に変換する
- 行数が極端に多い場合はサイズ警告を出す

## 14.4 ダウンロード実装方針

**標準経路**

- `Blob` + `URL.createObjectURL()` + 一時 `a[download]` を使って保存する

**拡張経路**

- `showSaveFilePicker()` が利用可能な環境では、明示的な “名前を付けて保存” UX を提供してもよい
- ただし、この API への依存は必須にしない

### 理由

- 標準経路の方がブラウザ差異に強い
- File System Access API は secure context とユーザー操作が必要で、実装差もある
- サーバーを介さずに保存できる点はどちらも同じだが、互換性の観点では Blob ダウンロードを主経路にする方が安全である

---

## 15. セキュリティ・プライバシー

## 15.1 データ取り扱い

- モデルテキストはメモリ上のみで扱う
- 明示設定がない限り永続保存しない
- “前回のモデルを復元” を実装する場合も localStorage/IndexedDB に限定し、デフォルトは無効にする

## 15.2 CSP 推奨設定

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'none';
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
```

## 15.3 セキュリティ要件

- 外部テレメトリ禁止
- 外部 CDN 禁止
- 動的 `eval` 禁止
- 依存ライブラリは定期的に監査
- サンプルモデルには機密値を含めない

---

## 16. 技術選定

## 16.1 コア

- TypeScript
- ESM
- pure TS 実装
- 単体テスト可能な関数群

## 16.2 UI

- v0.1 ではフロントエンドフレームワークを導入しない
- UI は TypeScript + 標準 Web API で実装する
- 理由:
  - 要件の中心は「ブラウザ内完結」「静的配信」「Worker 分離」「UI と core の疎結合」であり、SPA フレームワーク固有の機能を前提としない
  - v0.1 で必要なのはエディタ、進捗、診断、テーブル、エクスポートであり、標準 API で十分に構成できる
  - ルーティング、SSR、高度なクライアント状態管理を持ち込まない方が、初期実装と保守のコストを抑えやすい
- `core` は UI 非依存に保ち、UI 層は差し替え可能にする
- 将来、コンポーネント分割や再利用単位の整理が強く必要になった場合のみ、軽量な選択肢を追加検討する

## 16.3 ビルド

- `Vite + TypeScript` を第一候補とする
- `Vite` はビルド基盤として使い、UI ランタイムは vanilla TypeScript とする
- 静的出力可能なフロントエンドビルドツールを使う
- ビルド時に Node/CI を使うことは許容する
- **ただし本番実行時には Node サーバーや API サーバーを必要としない**

## 16.4 テーブル表示

- v0.1 は軽量テーブル実装でよい
- 行数増加時に仮想スクロールへ差し替え可能な設計にする

---

## 17. テスト戦略

## 17.1 単体テスト

- Lexer/Parser
- Constraint evaluator
- Tuple enumerator
- Exporters
- Diagnostics

## 17.2 性質ベーステスト

- 生成結果の各行が制約を満たす
- strength=2 なら valid tuple の pairwise 被覆が達成される
- negative 行に複数 invalid 値が混在しない
- export → parse（可能な範囲）の整合性が保たれる

## 17.3 差分テスト

- PICT の公式サンプル/仕様例に対し、サポート範囲内で比較する
- 比較対象:
  - 生成成功/失敗
  - 制約満足性
  - strength 達成
  - negative ルール
- **行数・並び順の完全一致は合格条件にしない**

## 17.4 E2E テスト

- ブラウザ上でモデル入力→生成→テーブル表示→3形式ダウンロードを自動検証する
- DevTools ネットワーク監視または同等手段で「生成時に追加通信がない」ことを検証する

---

## 18. ライセンスと参照方針

PICT リポジトリは MIT License で公開されている。
そのため、以下は適切なライセンス表示を前提に実施可能である。

- 仕様理解のための参照
- テストケース・サンプルの参考利用
- 差分検証のための fixture 利用
- 仕様互換確認

ただし、実装は TypeScript で新規作成し、C++ 実装の逐語移植は前提にしない。

---

## 19. 代替案

## 19.1 元の PICT を WebAssembly 化する

### 利点

- 既存実装を比較的そのまま利用できる可能性
- 出力互換性が高くなる可能性

### 欠点

- 「すべて TS」という要件から外れる
- C++/WASM のビルド保守が増える
- ブラウザとの境界（文字列、FS、Worker）調整が必要
- デバッグ性が落ちやすい

### 結論

採用しない。

## 19.2 サーバーサイド生成

### 利点

- 重い計算をサーバーへ逃がせる
- ブラウザ差異を減らせる

### 欠点

- 要件違反（Webサーバーで一切処理をしない）
- モデル機密性を損なう
- 運用コストが上がる

### 結論

採用しない。

## 19.3 Electron デスクトップアプリ

### 利点

- ファイルアクセスが扱いやすい
- ローカル完結がしやすい

### 欠点

- ブラウザ実行要件から外れる
- 配布サイズが大きい
- 導入ハードルが上がる

### 結論

採用しない。

---

## 20. リスク

| リスク | 内容                                    | 影響 | 緩和策                                         |
| ------ | --------------------------------------- | ---- | ---------------------------------------------- |
| R1     | 制約が厳しいモデルで生成性能が悪化      | 高   | prune 強化、候補探索制限、進捗表示、キャンセル |
| R2     | PICT と出力差異が出る                   | 中   | 互換方針を明示し、意味互換を優先               |
| R3     | 大規模結果でテーブル描画が重い          | 中   | 仮想スクロール、分割レンダリング               |
| R4     | ブラウザ差異で保存 UX がばらつく        | 中   | Blob ダウンロードを主経路にする                |
| R5     | モデルが unsat のとき原因が分かりにくい | 中   | 診断強化、最初に満たせない制約候補を提示       |
| R6     | v0.1 に機能を詰め込みすぎる             | 高   | フェーズ分割を厳守                             |

---

## 21. マイルストーン

## M1: v0.1 MVP

- モデル入力
- Parser / Validator
- 制約つき 2-wise / n-wise 生成
- negative testing
- Worker 実行
- テーブル表示
- CSV / TSV / Markdown ダウンロード
- 統計表示
- エラー表示

## M2: v0.2 互換拡張

- aliases
- parameter reuse
- sub-models
- エディタ改善
- 仮想スクロール強化

## M3: v0.3 上位互換

- weights
- seeding
- randomize / seed
- 高度な統計
- オフライン/PWA 検討

---

## 22. 受け入れ基準

以下を満たせば v0.1 を受け入れ可能とする。

1. ユーザーが PICT 風モデルを貼り付けて生成できる
2. 制約違反行が結果に含まれない
3. 指定 strength の valid カバレッジが達成される
4. negative 行で invalid 値が複数同居しない
5. 結果を表で確認できる
6. CSV / TSV / Markdown のダウンロードができる
7. 生成中も UI 操作が継続できる
8. 生成・表示・エクスポート時にサーバー API 通信が発生しない
9. 同じ入力から同じ結果を再現できる
10. 構文エラーが行/列つきで表示される

---

## 23. 実装開始時の推奨タスク分解

1. `core/parser` の最小実装
2. `core/constraints` の AST と evaluator
3. `core/generator` の pairwise 最小版
4. `worker` のプロトコル実装
5. `web` のエディタ + Generate ボタン
6. `web` のテーブル描画
7. `core/exporters` の csv/tsv/md
8. 診断・テスト・E2E 整備
9. 公式サンプルとの互換比較
10. CSP / ネットワーク遮断確認

---

## 24. 参考モデル（MVP用）

```text
Browser: Chrome, Firefox, Safari
OS: Windows, macOS, Linux
Login: Email, SSO
Network: Online, Offline
Locale: ja-JP, en-US

IF [Browser] = "Safari" THEN [OS] <> "Linux";
IF [Network] = "Offline" THEN [Login] <> "SSO";
```

---

## 25. 結論

本RFCでは、**PICT ベースの組み合わせテスト生成をブラウザだけで完結させる**ための初期設計を定義した。
重要な意思決定は次の4点である。

1. 実行時処理は完全クライアントサイド
2. コアは pure TypeScript で新規実装
3. 生成処理は Web Worker へ隔離
4. PICT 互換は「構文/意味互換を優先し、出力完全一致は求めない」

この方針により、**機密性・導入容易性・保守性**を両立しつつ、将来の PICT 互換拡張に耐える基盤を構築できる。

---

## 26. 参考資料

- [R1] [microsoft/pict README](https://github.com/microsoft/pict)
- [R2] [PICT User Guide (`doc/pict.md`)](https://github.com/microsoft/pict/blob/main/doc/pict.md)
- [R3] [PICT LICENSE.TXT](https://github.com/microsoft/pict/blob/main/LICENSE.TXT)
- [R4] [MDN Web Docs: Web Workers API](https://developer.mozilla.org/ja/docs/Web/API/Web_Workers_API)
- [R5] [MDN Web Docs: File System API](https://developer.mozilla.org/ja/docs/Web/API/File_System_API)
- [R6] [Chrome Developers: File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
