# AGENTS.md

しゃかさばボイス: ゲームサーバー向けの近接ボイスチャット（Nuxt 4 + SkyWay SFU + Socket.IO + Discord Bot）。
構成・データの流れ・音量計算・環境変数は `docs/DESIGN.md` にある。作業の前に読むこと。
大改修の進行中。不変条件（I1〜I6）・不具合の一覧（ID 付き）・フェーズ・決定事項は `docs/OVERHAUL.md` にある。設計書では、この ID で項目を参照する。不変条件に反する変更をしてはいけない。
本番・開発とも Windows 機で動かす。

## リポジトリ構成
- `frontend/`: Nuxt 4 アプリ。状態は Pinia（`stores/`）、音声の実体は `services/`（`mic`・`voiceRoom`・`subscription`・`volume`・`diagnostics`）、参加と退出の流れは `composables/useVoice.ts`、Nuxt server API は `server/`、距離設定の初期値は `settings/`
- `e2e/`: Playwright の E2E（実際の SkyWay と合成音声で 2 人の通話を確かめる）
- `backend/`: Node.js + TypeScript（`src/`）。`gameReceiver.ts`（プレイヤーデータ受信 :30000）、`socketServer.ts`（Socket.IO :3001）、`discordBot.ts`（Bot・内部 API :5000/:1234）、`config.ts`（環境変数）、エントリ `index.ts`。tsup で `dist/index.cjs` にビルドする
- `packages/shared/`: `@svoice/shared`。frontend と backend で共有する型（`PlayerData`、`IngameSettings`、Socket.IO のイベント型）と zod スキーマ
- `tools/`: workspace 外の単体スクリプト（`capture-player-data.mjs`: Minecraft からの生データの取得、`package/`: 1 つの実行ファイルへのまとめ方の試作。結果は `docs/PACKAGING.md`）
- `docs/specs/<taskId>.md`: タスクごとの設計書

## コマンド
- **pnpm workspace**（ルートの `pnpm-lock.yaml`）。Node 24（`.node-version`）。npm は使わない。
- 検証はルートで `pnpm test` / `pnpm typecheck` / `pnpm build`（各パッケージの同名スクリプトを再帰実行）。音声・接続に触れたら `pnpm dev:e2e` を起動して `pnpm e2e` も通す（`pnpm dev` の偽ゲームサーバーと同時に動かさない）
- 音量計算と受信判定（`frontend/services/volume.ts`）の固定テストの期待値は、I1 に関わるため変えない
  - frontend の `typecheck` は `nuxi typecheck`（vue-router の Volar プラグインの解決失敗の警告が出るが、結果には影響しない）。frontend の `build` / `typecheck` は `frontend/.env` を読み込むので、値を出力しない
- backend は `backend/` を基準に `.env`・`env/tokens.json`（実際の Bot トークン）・`key/` を読む（cwd には依存しない）。動作確認は、ルートの `pnpm dev`（`backend/.env.development`・`frontend/.env.development` を自動で使う）でそのまま起動して行う（下の「制約」を参照）
- ローカルでの手動確認手順は `docs/MANUAL_TEST.md`。ゲームサーバーの代わりに `pnpm --filter @svoice/backend fake-game <タグ...>`（`--scenario` / `--replay` あり）を使う。

## 制約
- **ユーザーの許可なく、作業用のフォルダー（git worktree、リポジトリのコピーなど）を作らない。** 作業と動作確認は `E:\dev\SyakasabaVC` の作業ツリーで行う。動作確認は、プロジェクトをそのまま（ルートで `pnpm dev`、`.env.development` の値のまま）起動して使う。ポートや設定を上書きして別に起動しない。すでに開発サーバーが動いていれば、それを使ってよい
- 秘密情報（`backend/.env`、`backend/env/tokens.json`、`backend/key/`、`frontend/.env`）は git 管理外。値を読んだりログやコミットに出したりしない。
- ログイン後のフロー（Discord OAuth・Bot・SkyWay・ゲームサーバー）は本物の認証情報がないとローカルで再現できない。変更したら、どこまで検証したかを報告に書く。
- 距離設定の実データは `frontend/<NUXT_DATA_DIR>/setting.json`（既定 `frontend/data/`、git 管理外）。本番の運営が UI から書き換えるデータなので、コードの変更ついでに値を変えない。`frontend/settings/default.json` は「デフォルトに戻す」の値で、`settings/setting.json` は初回移行の元（git 管理外）
- 開発は、ルートの `pnpm dev`（backend・frontend・偽ゲームサーバーの一括起動）と開発用ログイン（`nuxt dev` かつ `NUXT_DEV_LOGIN_ENABLED=true` のときだけ使える）で行う。手順は `docs/MANUAL_TEST.md`。frontend は `FRONTEND_ENV_FILE`、backend は `ENV_FILE` で `.env` を差し替えられる
- ゲームサーバーとの契約（`POST /` のプレイヤー配列の形）と Socket.IO のイベント名は、ゲームや運用と結びついている。変える場合は設計書に明記する。
- UI の文言は日本語。

## エージェントの分担（Clodex）
- claude: 設計・レビュー・コミット。`docs/DESIGN.md` と `docs/specs/` を更新する。
- codex: 設計書に従って実装する。コミット・ブランチ操作はしない。
- gemini: アイデア出しと文章の改善。ファイルは編集しない。
