# `packages/web`

RFC-0001 をもとにした Web UI です。
構成は `Vite + TypeScript + 標準 Web API + Web Worker` で、フロントフレームワークは入れていません。

## 方針

最もシンプルに要件へ沿うなら、フロントフレームワークは入れません。
この領域で必要なのは、ブラウザ内完結、静的配信、Worker 分離、`core` との疎結合であり、ルーティングや SSR ではありません。

そのため、設計方針としては `Vite + TypeScript + 標準 Web API + Web Worker` を採ります。
`Vite` はビルド基盤であり、UI ランタイムは vanilla TypeScript を前提にします。
将来、コンポーネント分割の必要性が明確になった場合のみ、軽量な拡張を追加で検討します。

## 含むもの

- モデル入力エディタ
- strength / case sensitive / negative prefix の設定
- Worker 経由のローカル生成
- 進捗表示とキャンセル
- 診断表示
- ソート / フィルタ / 列幅調整付きの結果テーブル
- CSV / TSV / Markdown エクスポート

## 起動

`packages/web` は単体の Vite アプリとして起動できます。

初回:

```bash
cd /home/t-tsuji/project/browser-pict-tool/packages/web
npm install
```

開発:

```bash
cd /home/t-tsuji/project/browser-pict-tool/packages/web
npm run dev
```

ビルド:

```bash
cd /home/t-tsuji/project/browser-pict-tool/packages/web
npm run build
```

型チェック:

```bash
cd /home/t-tsuji/project/browser-pict-tool/packages/web
npm run check
```

## 注意

- 現在の Worker 内生成ロジックは UI 実証向けの軽量版です
- 小〜中規模モデル向けで、探索空間が大きい場合はエラーにします
- 本命の `packages/core` / `packages/worker` 実装に置き換えやすいよう、通信境界は分けています
- `index.html` の CSP は Vite 開発サーバーの HMR を許可するため `connect-src 'self' ws: wss:` にしています
- 本番配信では、ホスティング側の HTTP ヘッダーでより厳しい CSP を設定する前提です

## E2E テスト

Playwright によるスモーク E2E を追加しています。

```bash
cd /home/t-tsuji/project/browser-pict-tool/packages/web
npx playwright install chromium
npm run e2e
```

CI やネットワーク制限環境ではブラウザバイナリ取得が失敗する場合があります。
