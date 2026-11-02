# phase4-packaging-spike: 1 つの実行ファイルへのまとめ方の試作と比較

大改修フェーズ 4（`docs/OVERHAUL.md` §6）の 2 本目。`phase4-runtime` の完了後に行う。対象は D10 の配布方式（未決事項 Q13）。
**このタスクは試作と提案まで。** 本番の配布方式は、ユーザーが提案書を読んで決める。

## 背景（ユーザーの要望、`docs/review/OVERHAUL.review.md` の Mark 56）
- 本番機にソースコードを置かず、余計なファイルのない綺麗な状態に保ちたい。
- 起動と更新を、ファイル 1 つの置き換えで済ませたい。
- pm2 は「スタイリッシュではない」。最適なら仕方ない。
- 本番は Windows 機。frontend（Nuxt の Nitro サーバー）と backend（Node）を同じ機械で動かす。

## Fixed

### 1. 試作する方式（それぞれ実際に動く実行ファイルを作る）
- **A. Node の Single Executable Applications（SEA）**: Node 24 の SEA で、backend と frontend をそれぞれ（または 1 つに統合して）`.exe` にする。依存はバンドラー（esbuild など）で 1 つのファイルにまとめる。frontend の静的ファイル（`.output/public`）は SEA の assets に入れて配信できるか試す。
- **B. Bun の `bun build --compile`**: 同じものを Bun で作る。discord.js・socket.io・Nitro が Bun で動くかを確かめる。Bun が入っていなければ、ユーザーの環境を変えないよう、プロジェクト内の依存（`bun` の npm パッケージ）として一時的に使う（試作が終わったら依存から外し、ロックファイルも元に戻す）。
- **C. 比較の基準として、ビルド済みのフォルダー＋ Node 本体（pm2 または Windows サービス）**: 実行ファイルにはしないが、ソースを置かずに成果物だけを配る形。
- 統合案（backend と frontend を 1 つのプロセスにする）も、A か B の中で試してよい。

### 2. 確かめること（方式ごと）
- ビルドできるか、手順、所要時間、成果物の大きさ。
- 起動して、トップページ・API・Socket.IO・プレイヤーデータの受信が動くか（`DISCORD_ENABLED=false` の HTTP で、開発用の値。ポートは `.env.development` と同じでよいが、`pnpm dev` と同時には動かさない）。
- 開発用ログインは本番ビルドでは使えないため、E2E は使わない。代わりに、トップページ・`/api/getSetting`・未ログインの 401・Socket.IO の接続拒否（トークンなし）・受信の 200 を確かめる。
- discord.js（Bot のログインまで。トークンはダミーでよく、ログイン失敗のログが出れば足りる）と `@discordjs/voice` が読み込めるか。
- 証明書の読み直し（`phase4-runtime` の仕組み）が動くか。
- 設定ファイル（`ENV_FILE`）と `DATA_DIR` を、実行ファイルの隣に置いて動くか。
- Windows サービスとして常駐させる方法（NSSM、WinSW、`node-windows`、`sc.exe` など）の候補と、その方式との相性。**サービスの実際の登録やシステムへのインストールはしない**（管理者権限が必要で、ユーザーの環境を変えるため）。

### 3. 成果物
- 試作のビルドスクリプトを `tools/package/` に置く（方式ごと）。生成物は `release/`（git 管理外。`.gitignore` に追加）に出す。
- **提案書** `docs/PACKAGING.md`: 方式ごとの結果（上の確かめることの表）、推奨案 1 つとその理由、推奨案での配布・更新・常駐・証明書更新（win-acme）の手順案、未解決の課題。ユーザー向けなので、簡潔に日本語で書く。

### 変更してよいファイル
- `tools/package/`（新規）、`docs/PACKAGING.md`（新規）、`.gitignore`
- 試作に必要な範囲で `frontend/nuxt.config.ts`・`backend/tsup.config.ts`・各 `package.json`・`pnpm-lock.yaml`（試作で一時的に入れた依存は、終わったら外す。採用候補で必要な依存だけ残してよい）

### 完了条件（RESULT は箇条書き 10 行程度）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` が通る（試作が既存の開発・ビルドを壊していない）。
- 各方式の実行ファイル（または成果物）を実際に起動し、上の項目を確かめた結果が `docs/PACKAGING.md` にある。起動したものはすべて止める。
- `release/` の生成物はコミットしない。

## Discretion
- バンドラーの選択と設定、統合案の構成、Windows サービス化の候補の比較方法。
