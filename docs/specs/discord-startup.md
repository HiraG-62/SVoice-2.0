# discord-startup: Bot のログイン中も内部 API を受け付ける

作成: 2026-11-04 / 担当: codex（実装）、claude（設計・レビュー・コミット）

## 背景
実際の Discord を使うモードで `pnpm dev` を起動したとき、次の問題が見つかった。

1. backend は `tokens.json` の Bot（現在 22 体）を 1 体ずつログインさせ、**全員のログインが終わってから** 内部 API（開発 :5100 / :1334、本番 :5000 / :1234）を listen する（`backend/src/discordBot.ts` の `createDiscordService`）。その間に開いたページの `/api/getJoinRole` は `ECONNREFUSED` で 500 になる。Bot のログインが失敗すると、再試行で 1 体あたり最大 5 分待つため、内部 API が長い時間起動しないこともある。
2. `frontend/pages/index.vue` の `onMounted` では、`getJoinRole` が失敗すると `useVoice().initialize()`（マイクと距離設定の初期化）まで止まり、画面には原因と違う「マイク・距離設定の初期化失敗」が表示される。
3. 開発用ログイン（`devLogin: true`）の人が参加パスワードを正しく入力すると、backend の `/joinAuth` が偽の discordId に参加ロールを付けようとして、Discord から `10013 Unknown User` が返り、500 になる（コミット `05394ff` では `getJoinRole` と電話ロールだけを Discord から切り離した）。

## Fixed（変えてはいけないこと・決まっていること）

### 振る舞い
- **B1: 内部 API はすぐ listen する。** `createDiscordService` は、Bot のログインを待たずに Express アプリを作って listen する。Bot のログインはその後ろで続ける。
- **B2: ログイン中の応答。** `DISCORD_ENABLED=true` で Bot の読み込み（`loadBots`）が終わっていない間、Discord を使う処理は Discord にアクセスせず、`503 { error: 'discord_starting' }` を返す。対象は次のとおり。
  - `/getUserName`、`/getJoinRole`、`/checkAdminRole`、`/setPhoneRole`、`/removePhoneRole`
  - `/joinAuth` のうち、パスワードが正しく参加ロールを付ける段階。パスワードの照合、失敗回数の記録、ロックはログイン中でも今までどおり行う。正しいパスワードでもログイン中なら 503 を返し、失敗回数は消さない（`locks.clear` を呼ばない）
- **B3: 読み込みが終わった後は今の挙動と同じ。** Bot が 1 体以上ならその Bot を使う。0 体なら、今の `activeConfig`（`DISCORD_ENABLED` を偽として扱う）と同じ結果にする。`console.error('Discord 利用不可: Bot なし')` も今のまま出す。
- **B4:** `DISCORD_ENABLED=false` の挙動は変えない（最初から「読み込み済み・Bot 0 体・無効」として扱う。503 は返さない）。
- **B5:** `/joinLocks` と `/unlockJoin` は Bot のログイン中でも使える。
- **B6: 人数表示**（`startMemberCount`）は Bot の読み込みが終わってから始める（今と同じ）。
- **B7: 停止。** `close()` は、Bot のログイン中に呼ばれても、ログインを中断し（今の `AbortController`）、listen 中のサーバーを閉じて完了する。Bot のログインが終わった後の `close()` も今と同じく、すべての Bot を `destroy` する。サーバーが閉じられたときに Bot を後始末する、今の `close` イベントの処理は残す。
- **B8: `ready` の意味。** `createDiscordService(...).ready` は「内部 API の 2 つのサーバーが listen を始めた」時点で解決する（Bot のログインは待たない）。`backend/src/index.ts` の `startEmbeddedBackend`（SEA）と `startDiscordServer` はこの `ready` を使う。Bot の読み込みの完了を待つ別の Promise（名前は任意）を返してよい（テスト用）。
- **B9: 開発用ログインの参加認証。** frontend の `/api/joinAuth` は、セッションが開発用ログイン（`skipsDiscordRole(user)` が真）のとき、backend への body に `skipRole: true` を加える。backend の `/joinAuth` は、`skipRole === true` のときは参加ロールの付与（`updateRole`）をせず、ログイン中でも 503 にしない。パスワードの照合、ロック、`locks.clear` は通常と同じに行う。`skipRole` が `true` 以外（省略を含む）なら今の挙動のまま。
- **B10: 画面（`frontend/pages/index.vue`）。** `getJoinRole` の失敗と `useVoice().initialize()` の失敗を分ける。`getJoinRole` が失敗しても `initialize()` は実行する。
  - `getJoinRole` が `503` かつ `data.error === 'discord_starting'`: `call.setError('Discord 接続待ち。少し待って再読み込み')`
  - それ以外の `getJoinRole` の失敗: `call.setError('参加ロールの確認失敗')`
  - `initialize()` の失敗: 今のまま `call.setError('マイク・距離設定の初期化失敗')`（両方失敗したら、後に起きたほうが表示されてよい）
  - `getJoinRole` が失敗したときの `joinAuth` は `false` のまま（パスワード入力欄が出る。今と同じ）
- **B11: ログイン（`frontend/server/routes/auth/discord.get.ts`）。** backend から `discord_starting` が返ったら `/?error=discord_starting` にリダイレクトする。`frontend/utils/authMessages.ts` の `loginErrorMessage('discord_starting')` は `'Discord 接続待ち。少し待って再ログイン'` を返す。ほかのエラーの扱いと文言は変えない。

### 不変条件・契約
- ポートは変えない（I2）。ゲームサーバーとの契約・Socket.IO のイベント名は触らない（I3）。
- 内部 API の既存のパス・成功時の応答の形・`x-api-secret` の確認・送信元 IP の制限は変えない。追加するのは 503 の応答と `/joinAuth` の任意の `skipRole` だけ。
- 例外のログ（`describeError`、コミット `9586552`）は残す。
- 秘密の値（トークン・API の秘密キー・パスワード）をログに出さない。

### 編集してよいファイル
- `backend/src/discordBot.ts`、`backend/src/internalApi.ts`、`backend/src/discord/bots.ts`（必要な場合のみ）、`backend/src/index.ts`（`ready` の扱いが変わる場合のみ）
- `backend/test/discordLifecycle.test.ts`、`backend/test/discordBot.test.ts`、`backend/test/joinAuth.test.ts`（新しいテストファイルの追加も可）
- `frontend/pages/index.vue`、`frontend/server/api/joinAuth.post.ts`、`frontend/server/routes/auth/discord.get.ts`、`frontend/utils/authMessages.ts`
- `frontend/test/serverSecurity.test.ts`、`frontend/test/securityPolicy.test.ts`（新しいテストファイルの追加も可）
- `docs/DESIGN.md`（内部 API の起動順の記述がある場合、その箇所だけ）

## テスト方針（必須）
- backend
  - `loadBots` が終わる前に内部 API が listen し、`/getJoinRole` などの B2 の対象が 503 `discord_starting` を返す。Discord（`fetchGuild`）は呼ばれない
  - ログイン中の `/joinAuth`: 間違ったパスワードは失敗回数が増える。正しいパスワードは 503 で、失敗回数は消えない。`skipRole: true` なら正しいパスワードで `ok: true`、ロールの付与は呼ばれない
  - 読み込みが終わった後: Bot 1 体以上なら Discord を使う。0 体なら B3 のとおり
  - `DISCORD_ENABLED=false` は 503 を返さない（B4）
  - ログイン中の `close()` が完了し、ポートが解放される（B7）
- frontend
  - `/api/joinAuth` は開発用ログインのとき `skipRole: true` を送り、それ以外では送らない
  - `loginErrorMessage('discord_starting')` の文言
  - `index.vue` の分岐（B10）は、純粋な関数に切り出してテストしてもよい
- 最後にルートで `pnpm test` と `pnpm typecheck` を通す。`index.vue` と参加の流れに触れるので、`pnpm dev:e2e` を起動して `pnpm e2e` も通す（`pnpm dev` が動いていたら止めてから。E2E は `DISCORD_ENABLED=false`）。実際の Discord での確認はユーザーが行う。

## Discretion（実装者が決めてよいこと）
- 「読み込み中・読み込み済み」の状態の持ち方（`createBotPool` を後から差し替える、状態オブジェクトを渡すなど）
- 503 を返す共通処理の形、定数名（`'discord_starting'` などの文字列は定数にする）
- テストでの `loadBots` の止め方（モック、遅延する Promise など）
- B8 の「Bot の読み込みの完了を待つ Promise」を作るかどうかと、その名前
