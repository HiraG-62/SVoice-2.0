# phase4-sea-release: Node SEA ＋ WinSW 2.x による本番配布の仕上げ

大改修フェーズ 4 の 3 本目。配布方式は **Node SEA ＋ WinSW 2.x に決定**（2026-11-04、ユーザー。`docs/OVERHAUL.md` Q13）。試作（`tools/package/`、結果は `docs/PACKAGING.md`）を、本番で使える形に仕上げる。
不変条件 I1〜I6、特に I2（本番のポート 30000 / 3000 / 3001 / 5000 / 1234）を守る。前提知識は `AGENTS.md`、`docs/DESIGN.md`、`docs/PACKAGING.md`。

## Fixed

### 1. ビルド
- ルートに `pnpm package` を追加する。`pnpm build` の後に SEA を作り、`release/svoice/` に配布物をまとめる。Bun とフォルダー版の試作スクリプトは削除する（比較の記録は `docs/PACKAGING.md` に残っている）。
- 配布物（`release/svoice/`）:
  - `svoice.exe`（frontend と backend を 1 プロセスにまとめた SEA。静的ファイル・`settings/default.json`・`@discordjs/voice` の native addon を埋め込む。試作と同じ方式）
  - `svoice-service.xml`（WinSW 2.x の設定）
  - `app.env.example`（本番用の設定の例。値は空）
  - `VERSION.txt`（アプリのバージョン、git のコミット、ビルド日時、`svoice.exe` の SHA-256）
- WinSW 本体（`svoice-service.exe`）は同梱しない。手順書でダウンロード先（公式の GitHub Releases の 2.x の最新版。`WinSW-x64.exe` / .NET Framework 版の `WinSW.NET461.exe` のどちらを使うか）を示す。理由: 外部のバイナリを再配布しないため。
- `postject` は、毎回のダウンロードではなく devDependency として固定する。

### 2. 実行時の動き（SEA）
- 設定: `ENV_FILE` が未設定なら、**exe と同じフォルダーの `app.env`** を読む。相対パス（`DATA_DIR`、証明書、`tokens.json`、距離設定のデータ）は exe のフォルダーから解決する。起動したフォルダー（cwd）に依存しない。
- 既定値は本番と同じ（ポート、`NODE_ENV=production`）。
- **終了処理**: SIGINT / SIGTERM / SIGBREAK（WinSW の停止）を受けたら、frontend・Socket.IO・受信・内部 API のサーバーを閉じ、Discord の Bot を切断してから終了する。15 秒以内に終わらなければ強制終了する（WinSW の `stoptimeout` と合わせる）。
- **片方の異常**: frontend か backend のどちらかが起動に失敗した、または致命的なエラーで止まったら、プロセス全体を 0 以外で終了する（WinSW の `onfailure` で再起動させるため。片方だけが止まったまま動き続けない）。
- 起動時に、バージョン・読み込んだ設定ファイルの場所・主要なパス・待ち受けるポートを 1 行ずつログに出す（秘密の値は出さない）。

### 3. WinSW の設定（`svoice-service.xml`）
- 試作の内容（自動起動・失敗時の再起動・ログ・`ENV_FILE`）を基に、WinSW 2.x の設定として正しいことを公式の資料で確かめる。停止は Ctrl+C の送信（`stopparentprocessfirst` などの 2.x の項目）で、上の終了処理が動くようにする。
- サービスの実際の登録はしない（管理者権限が必要で、ユーザーの環境を変えるため）。

### 4. 手順書 `docs/DEPLOY.md`（ユーザー向け。簡潔な日本語。コマンドは PowerShell）
- 初回の配置: 配布物の置き場所の例（`C:\svoice\`）、`app.env` の作り方（必須の項目、`API_SECRET` と `NUXT_API_SECRET` を同じにする、`GAME_ALLOWED_IPS`・`INTERNAL_API_ALLOWED_IPS`、`DISCORD_ENABLED=true`、Discord の Redirect URL）、`tokens.json` と証明書の置き場所、WinSW の入手と名前の変更、サービスの登録・開始。
- 更新: サービスの停止 → 今の `svoice.exe` を退避 → 新しい `svoice.exe` に置き換え → 開始。失敗したときの戻し方。`VERSION.txt` の SHA-256 での確認。
- 証明書: win-acme の PemFiles での出力先と、`TLS_KEY_PATH` / `TLS_CERT_PATH` の指定。自動で読み直されるため再起動は不要。
- Windows ファイアウォール: 外部に開けるポート（3000・3001、必要なら証明書の取得用の 80）と、開けないポート（30000・5000・1234）。
- 旧本番（Ubuntu・pm2）からの移行: 距離設定（`setting.json`）と `join-locks.json` の移し方。
- 確認の手順: サービスの状態、ログの場所、トップページと `/api/getSetting` の応答。
- ビルドする側の手順（開発機で `pnpm package`）。

### 5. 確認用スクリプト
- 試作の `smoke.mjs` を、配布物（`release/svoice/svoice.exe`）を確かめるものとして残し、`pnpm package:smoke` で実行できるようにする。確認する内容は試作と同じ（トップページ・静的ファイル・設定 API・401・開発用ログインの 404・Socket.IO の拒否・受信・Discord の読み込み・証明書の読み直し・不正な証明書のときに古いものを保つこと）に、次を加える:
  - **exe と別のフォルダーから起動しても、exe の隣の `app.env` を読む**こと
  - **SIGINT で 15 秒以内に終了し、ポートが空く**こと
  - **frontend か backend のどちらかを起動できない設定（ポートを先に使っておく）で、プロセスが 0 以外で終了する**こと
- 確認では、開発用のポート（3100 / 3101 / 30100 / 5100 / 1334）とダミーの設定を使う（試作と同じ）。`pnpm dev` と同時には動かさない。

### 変更してよいファイル
- `tools/package/`、ルートの `package.json`・`pnpm-lock.yaml`、`.gitignore`、`docs/DEPLOY.md`（新規）、`docs/PACKAGING.md`（推奨案が採用されたことの追記に限る）
- SEA の中で使う統合の処理のために必要なら `frontend/scripts/`・`backend/src/index.ts`（既存の `pnpm dev` / `pnpm start` の動きを変えない範囲）

### 完了条件（RESULT は箇条書き 10 行程度）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` / `pnpm package` / `pnpm package:smoke` が通る。
- `pnpm dev:e2e` ＋ `pnpm e2e` が通る（既存の開発の動きを壊していない）。開発サーバーは、このリポジトリでそのまま起動し、終わったら止めて、開発用ポートが空いたことを確かめる。
- `release/` はコミットしない。

## Discretion
- 統合の処理の置き場所と構成、終了処理の実装。
- WinSW の設定の細部（公式の 2.x の資料に沿うこと）。
- 手順書の構成。
