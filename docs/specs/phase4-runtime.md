# phase4-runtime: 実行時設定・TLS・本番起動の整備

大改修フェーズ 4（`docs/OVERHAUL.md` §6）の 1 本目。対象は D10 のうち配布方式に依らない部分と D11。`phase3-voice-rewrite` の完了後に行う。
不変条件 I1〜I6、特に I2（本番のポートは変えない）を守る。前提知識は `AGENTS.md` と `docs/DESIGN.md`。
ユーザーは不在のため、設計担当（claude）が計画書の決定事項（Q10: TLS はアプリが持ち、win-acme で更新し、アプリが読み直す）に沿って判断した。1 つの実行ファイルへのまとめ方（Q13）は、次の `phase4-packaging-spike` で比較・提案し、このタスクでは決めない。

## Fixed

### 1. ビルドの成果物に秘密情報を埋め込まない（D10 の注意）
- `frontend/nuxt.config.ts` の `runtimeConfig` から `process.env.X || ''` の形をなくし、既定値は空文字（または今の既定値）にする。値は実行時の環境変数（`NUXT_*` / `NUXT_PUBLIC_*`）で与える。開発（`nuxt dev`）では今どおり `.env.development` から入る。
- `devServer.port` の `NUXT_PORT` など、開発サーバーにしか効かない値は今のままでよい。
- **検証用スクリプト** `frontend/scripts/check-secrets.mjs`: ダミーの目印の値（例: `SVOICE_SECRET_MARKER_xxx`）を環境変数に入れてビルドし、`.output/` の中に目印が含まれないことを確かめる。ルートの `pnpm check:secrets` で実行できるようにする（通常の `pnpm test` には含めない）。

### 2. 本番の起動スクリプト（frontend）
- Nitro の preset を、自前の HTTP(S) サーバーにハンドラーを渡せるもの（`node-middleware` など。Discretion）に変える。`frontend/scripts/start.mjs`（`pnpm start`）が、次の順に処理する:
  1. `ENV_FILE`（なければ `frontend/.env.production`、それもなければ読まない）を `process.loadEnvFile` で読み込む
  2. `TLS_KEY_PATH` / `TLS_CERT_PATH` が設定されていれば HTTPS、なければ HTTP で、`PORT`（既定 3000。I2）で待ち受ける
  3. 証明書ファイルの変更を検知したら `server.setSecureContext` で読み直す（再起動しない）
- `nuxt dev`（開発）の動きは変えない。

### 3. backend の証明書の読み直し（D11）
- Socket.IO（3001）と内部 API（1234）の HTTPS サーバーで、`TLS_KEY_PATH` / `TLS_CERT_PATH` の変更を検知したら `setSecureContext` で読み直す。読み直しに失敗したら、古い証明書のまま動き続け、エラーを 1 行ログに出す。
- 検知は `fs.watch`（または一定間隔での更新時刻の確認）。win-acme は証明書ファイルを置き換える形で更新するため、置き換え（rename）にも反応すること。

### 4. 本番用の設定ファイルの例
- `frontend/.env.production.example` と `backend/.env.production.example` を作る。本番の既定ポート、TLS のパス、`GAME_ALLOWED_IPS`、`INTERNAL_API_ALLOWED_IPS`、`DISCORD_ENABLED=true` などを、説明付きで書く（値は空）。

### テスト
- 証明書の読み直し: 一時フォルダーに自己署名の証明書を 2 組作り、ファイルを置き換えると新しい証明書で応答すること（frontend の起動スクリプトと backend の両方）。読み直しに失敗しても動き続けること。
- 起動スクリプトの `ENV_FILE` の読み込み順。
- `pnpm check:secrets` が通ること。

### 変更してよいファイル
- `frontend/nuxt.config.ts`、`frontend/scripts/`、`frontend/package.json`、`frontend/server/`（実行時設定の読み方の変更に限る）、`frontend/test/`、`frontend/.env.production.example`（新規）
- `backend/src/`、`backend/test/`、`backend/.env.production.example`（新規）、`backend/.env.example`
- ルートの `package.json`、`pnpm-lock.yaml`
- `docs/DESIGN.md` の環境変数の節（設計担当が最終確認する）

### 完了条件（RESULT は箇条書き 10 行程度）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` / `pnpm check:secrets` が通る。
- `pnpm dev` での開発の動き（開発用ログイン・通話）が変わらないこと。`pnpm dev` と `pnpm e2e`（`pnpm dev:e2e` の起動中）で確認する。開発サーバーは、このリポジトリでそのまま起動し、終わったら止める。
- 本番の起動スクリプトを、HTTP（TLS なし）で一時的に起動し、トップページと API が応答すること。起動したものは止める。

## Discretion
- Nitro の preset の選択と、起動スクリプトの構成。
- 証明書の変更検知の方法。
- 自己署名証明書の作り方（node の標準機能か、テスト用の小さな依存か）。
