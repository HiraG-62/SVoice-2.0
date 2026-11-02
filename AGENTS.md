# AGENTS.md

しゃかさばボイス: ゲームサーバー向けの近接ボイスチャット（Nuxt 4 + SkyWay SFU + Socket.IO + Discord Bot）。
構成・データの流れ・音量計算・環境変数は `docs/DESIGN.md` にある。作業の前に読むこと。
大改修の進行中。不変条件（I1〜I6）・不具合の一覧（ID 付き）・フェーズ・決定事項は `docs/OVERHAUL.md` にある。設計書では、この ID で項目を参照する。不変条件に反する変更をしてはいけない。
本番・開発とも Windows 機で動かす。

## リポジトリ構成
- `frontend/`: Nuxt 4 アプリ（UI、音声処理 `composables/`、Nuxt server API `server/`、距離設定 `settings/`）
- `backend/`: Node.js + TypeScript（`src/`）。`gameReceiver.ts`（プレイヤーデータ受信 :30000）、`socketServer.ts`（Socket.IO :3001）、`discordBot.ts`（Bot・内部 API :5000/:1234）、`config.ts`（環境変数）、エントリ `index.ts`。tsup で `dist/index.cjs` にビルドする
- `packages/shared/`: `@svoice/shared`。frontend と backend で共有する型（`PlayerData`、`IngameSettings`、Socket.IO のイベント型）と zod スキーマ
- `tools/`: workspace 外の単体スクリプト（`capture-player-data.mjs`: Minecraft からの生データの取得）
- `docs/specs/<taskId>.md`: タスクごとの設計書

## コマンド
- **pnpm workspace**（ルートの `pnpm-lock.yaml`）。Node 24（`.node-version`）。npm は使わない。
- 検証はルートで `pnpm test` / `pnpm typecheck` / `pnpm build`（各パッケージの同名スクリプトを再帰実行）。
  - frontend の `typecheck` / `test` は `phase0-frontend` で追加予定。それまでは frontend の型チェックは任意で `cd frontend; npx -y -p typescript@5.9 -p vue-tsc@3 vue-tsc --noEmit -p .nuxt/tsconfig.app.json`（既存のエラーが app 15 件・server 6 件。増やさないこと）
- backend を起動すると、cwd の `.env`・`env/tokens.json`（実際の Bot トークン）・`key/` を読む。**検証で backend を起動するときは、リポジトリ外の一時フォルダーを cwd にし、ダミーの値を使う**
- ローカルでの手動確認手順は `docs/MANUAL_TEST.md`。ゲームサーバーの代わりに `node backend/scripts/fake-game-server.js <タグ...>` を使う。

## 制約
- 秘密情報（`backend/.env`、`backend/env/tokens.json`、`backend/key/`、`frontend/.env`）は git 管理外。値を読んだりログやコミットに出したりしない。
- ログイン後のフロー（Discord OAuth・Bot・SkyWay・ゲームサーバー）は本物の認証情報がないとローカルで再現できない。変更したら、どこまで検証したかを報告に書く。
- `frontend/settings/setting.json` は本番の運営が UI から書き換えるデータ。コードの変更ついでに値を変えない。
- ゲームサーバーとの契約（`POST /` のプレイヤー配列の形）と Socket.IO のイベント名は、ゲームや運用と結びついている。変える場合は設計書に明記する。
- UI の文言は日本語。

## エージェントの分担（Clodex）
- claude: 設計・レビュー・コミット。`docs/DESIGN.md` と `docs/specs/` を更新する。
- codex: 設計書に従って実装する。コミット・ブランチ操作はしない。
- gemini: アイデア出しと文章の改善。ファイルは編集しない。
