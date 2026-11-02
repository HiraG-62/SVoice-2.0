# phase1-frontend-dev: ルーム名・開発用ログイン・設定データの分離・一括起動

大改修フェーズ 1（`docs/OVERHAUL.md` §6）の 2 本目。対象は D3・D5・D6・D7・D8（frontend 側とルート）。`phase0-frontend` と `phase1-backend-env` の完了後に行う。不変条件 I1〜I6（`docs/OVERHAUL.md` §1）を守る。
前提知識は `AGENTS.md` と `docs/DESIGN.md` にある。

## 背景
- SkyWay のルーム名が `test` に固定されており、開発の参加者が本番のルームに入ってしまう（D3）。
- 開発でも Discord OAuth とニックネームの設定が必須で、複数ユーザーを試すには Discord アカウントが複数必要（D5、決定事項 Q4）。
- 距離設定 `frontend/settings/setting.json` は git 管理下のファイルで、実行中に上書きされる（D6）。今の内容は `default.json` と同じ値。
- `phase1-backend-env` で、backend は `DISCORD_ENABLED=false`（Discord なし）と開発用のポート（本番 + 100）で動かせるようになっている。偽ゲームサーバーには `fake-game --scenario` がある。

## Fixed

### 1. SkyWay のルーム名（D3）
- `runtimeConfig.public.skywayRoomName`（環境変数 `NUXT_PUBLIC_SKYWAY_ROOM_NAME`）を追加する。既定値は `test`（本番の挙動は変わらない）。
- `useSkyway.client.ts` の `name: 'test'` をこの設定に置き換える。それ以外の SkyWay の処理は変えない。

### 2. 開発用ログイン（D5）
- **使える条件**: `nuxt dev` で動いている（`import.meta.dev`）**かつ** `NUXT_DEV_LOGIN_ENABLED=true`。判定は純粋な関数にし、本番ビルドでは常に使えないことをテストで確かめる。
- **サーバー**: `POST /auth/dev`（本文 `{ gamerTag: string, admin: boolean }`）。
  - 使える条件を満たさなければ 404 を返す。
  - `gamerTag` は空でない 100 文字以下の文字列（Socket.IO の `join` と同じ制限）。満たさなければ 400。
  - セッションに `{ discordId, discordAuth: admin, gamerTag }` を保存する。`discordId` は、`gamerTag` から決まる 18 桁の数字の偽の ID にする（backend の ID の検証を通すため。`DISCORD_ENABLED=false` の backend では Discord に問い合わせない）。
- **画面**: ログイン画面（未ログイン時）に、使える条件を満たすときだけ「開発用ログイン」の欄を表示する。ゲーマータグの入力、管理者のチェック、ログインボタンを置く。`NUXT_PUBLIC_DEV_LOGIN_PRESETS`（カンマ区切りのゲーマータグ）があれば、ワンクリックでログインできるボタンも並べる。文言は短くする（ラベルは体言止め）。
- 開発用ログインの公開設定（表示するかどうかとプリセット）は、本番ビルドのクライアントに出さない。
- 1 台で複数ユーザーを試すときは、ブラウザのプロファイルや InPrivate ウィンドウを分ける（cookie が別になる）。手順書に書く。

### 3. 距離設定のデータフォルダー（D6）
- `runtimeConfig.dataDir`（環境変数 `NUXT_DATA_DIR`）を追加する。既定値は `data`。相対パスは frontend の起動時の cwd から解決する（pnpm のスクリプトでは cwd は `frontend/`。完全に cwd から独立させるのはフェーズ 4 の配布で行う）。起動時に、解決したパスを 1 回ログに出す。
- `getSetting` / `setSetting` は `<dataDir>/setting.json` を読み書きする。`getDefaultSetting` は今どおりソースの `settings/default.json` を読む。
- **初回の移行**: `<dataDir>/setting.json` がなければ、起動時（または最初の読み込み時）に作る。旧ファイル `settings/setting.json` があればそれを、なければ `settings/default.json` をコピーする。移行したことを 1 行ログに出す。
- `frontend/.gitignore` に `data/` を追加する。`frontend/settings/setting.json` は削除しない（git の管理から外す作業は設計担当が行う。移行元として使うため、ファイルはこのタスクでは残す）。

### 4. ポート（D7）
- frontend の開発サーバーのポートを `.env` で変えられるようにする（既定は 3000。開発の推奨は 3100）。
- `NUXT_PUBLIC_SERVER_SOCKET_URL` / `NUXT_PUBLIC_SERVER_API_URL` は今のまま設定で指定する（開発の推奨値は `http://localhost:3101` / `http://localhost:5100`）。

### 5. 一括起動（D8）
- ルートの `package.json` に `dev` スクリプトを追加する。`concurrently` で次の 3 つを同時に起動し、出力に名前を付けて色分けする:
  - backend の `dev`
  - frontend の `dev`
  - backend の `fake-game --scenario sweep`。プレイヤー名は `NUXT_PUBLIC_DEV_LOGIN_PRESETS` と同じ値を、ルートの環境変数 `DEV_PLAYERS`（カンマ区切り。既定は `Alice,Bob`）から渡す
- 1 つが異常終了しても、ほかは止めない。Ctrl+C で 3 つとも止まる。
- Windows の PowerShell でそのまま動くこと。

### 6. `.env.example` と手順書
- `frontend/.env.example` に、`NUXT_PUBLIC_SKYWAY_ROOM_NAME`、`NUXT_DEV_LOGIN_ENABLED`、`NUXT_PUBLIC_DEV_LOGIN_PRESETS`、`NUXT_DATA_DIR`、ポートの項目を追加し、本番と開発の推奨値を書く（開発のルーム名の例: `dev-<名前>`）。
- `docs/MANUAL_TEST.md` を書き直す:
  - **開発モード**（Discord なし）: `.env` の開発用の値 → ルートで `pnpm dev` → 2 つのブラウザで開発用ログイン → 確認項目
  - **実際の Discord を使うモード**: 今の手順（ポートと Redirect URL を開発用の値にする）
  - 確認項目は今のものを引き継ぎ、偽ゲームサーバーのコマンドを新しい形に直す

### テスト
- 開発用ログインが使えるかの判定（`dev` / 設定の組み合わせ 4 通り。本番ビルドでは常に不可）。
- 偽の `discordId` が、同じ `gamerTag` から同じ値になり、backend の検証（17〜20 桁の数字）を通ること。
- `gamerTag` の検証。
- 距離設定の移行（旧ファイルあり／なし／移行済み）。一時フォルダーで行う。

### 変更してよいファイル
- `frontend/` 配下（`frontend/.env` と、`frontend/settings/*.json` の中身は除く）
- ルートの `package.json`、`pnpm-lock.yaml`
- `docs/MANUAL_TEST.md`
- 生成物: `node_modules/`、`frontend/.nuxt/`、`frontend/.output/`

### 完了条件（RESULT に実行コマンドと結果を含める）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` が通る。
- 本番ビルド（`.output`）をダミーの環境変数で起動し、`POST /auth/dev` が 404 になること、トップページに開発用ログインの欄が出ないこと。
- 開発サーバーの起動スモーク（実際の `.env` は読まない。ダミーの環境変数か一時的な `.env` を使う）: `POST /auth/dev` でログインでき、そのセッションで `/api/getJoinRole?id=<偽の ID>` が backend（`DISCORD_ENABLED=false`）から `true` を返すこと。
- ルートの `pnpm dev` で 3 つが起動し、偽ゲームサーバーのデータが backend に届くこと（ブラウザでの通話は確認しなくてよい）。

## Discretion
- 開発用ログインの欄の配置と見た目（既存の Vuetify の部品を使う）。
- 偽の `discordId` の作り方（ハッシュの方式など。18 桁の数字で、先頭が 0 にならないこと）。
- 移行を行うタイミング（Nitro プラグインでの起動時か、最初の読み込み時か）。
- `concurrently` の設定の細部。
