# AGENTS.md

しゃかさばボイス: ゲームサーバー向けの近接ボイスチャット（Nuxt 4 + SkyWay SFU + Socket.IO + Discord Bot）。
構成・データの流れ・音量計算・環境変数は `docs/DESIGN.md` にある。作業の前に読むこと。
大改修の進行中。不変条件（I1〜I6）・不具合の一覧（ID 付き）・フェーズ・決定事項は `docs/OVERHAUL.md` にある。設計書では、この ID で項目を参照する。不変条件に反する変更をしてはいけない。
本番・開発とも Windows 機で動かす。

## リポジトリ構成
- `frontend/`: Nuxt 4 アプリ（UI、音声処理 `composables/`、Nuxt server API `server/`、距離設定 `settings/`）
- `backend/`: Node.js（CommonJS）。`external/express.js`（プレイヤーデータ受信 :30000）、`external/socket.js`（Socket.IO :3001）、`external/discordBot.js`（Bot・内部 API :5000/:1234）
- `docs/specs/<taskId>.md`: タスクごとの設計書

## コマンド
- パッケージ管理は今は **npm**（frontend と backend にそれぞれ `package-lock.json`）。大改修のフェーズ 0 で pnpm workspace に移行する予定。移行が終わるまでは npm を使う。
- `test` / `typecheck` の npm スクリプトはない。`pnpm test` / `pnpm typecheck` の代わりに次を実行する:
  - `node backend/test/express.test.js`
  - `cd frontend; npm run build`
  - 型チェック（任意。既存のエラーが app 15 件・server 6 件ある。増やさないこと）: `cd frontend; npx -y -p typescript@5.9 -p vue-tsc@3 vue-tsc --noEmit -p .nuxt/tsconfig.app.json`
- `frontend/node_modules/.bin/tsc` は古く、Nuxt 4 の tsconfig を読めないため使わない。
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
