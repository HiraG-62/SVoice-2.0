# しゃかさばボイス 設計資料

ゲームサーバー（Minecraft 統合版系の「しゃかさば」）向けの近接ボイスチャット Web アプリ。
ゲームサーバーから届くプレイヤー座標・状態をもとに、ブラウザ側で相手ごとの音量を距離で変える。

## 全体構成

```
ゲームサーバー ──POST / (30000)──▶ backend/express.js ─┐ getData()
                                                        ├─▶ backend/socket.js (3001) ──playerData 100ms──▶ ブラウザ
                                                        └─▶ backend/discordBot.js（参加人数 Bot 表示）
ブラウザ ──HTTP──▶ frontend (Nuxt server/api) ──x-api-secret──▶ backend/discordBot.js 内部API (5000 http / 1234 https)
ブラウザ ◀──SFU──▶ SkyWay（音声本体。ルーム名 `test`）
```

| ディレクトリ | 技術 | 役割 |
|---|---|---|
| `frontend/` | Nuxt 4, Vuetify 4, `@skyway-sdk/room@2`, `socket.io-client`, `@timephy/rnnoise-wasm`, `mitt`, `nuxt-auth-utils` | UI、音声処理、Discord OAuth、内部 API へのプロキシ |
| `backend/` | Node.js (CommonJS), express 5, socket.io 4, discord.js 14, `@discordjs/voice` | プレイヤーデータ中継、Socket.IO、Discord Bot・内部 API |

backend の起動は `backend/src/index.ts` が設定（`config.ts`）を読み込み、受信・Socket.IO・Discord Bot を順に起動するだけ。プレイヤーデータは `gameReceiver.ts` が作る受信側のクロージャに保持し、`getData()` を他モジュールに渡す（DB なし・プロセス内メモリのみ）。各モジュールは「作る関数」と「listen する関数」に分かれ、依存を引数で差し替えられる。

## backend

### `src/gameReceiver.ts`（ポート 30000）
- `POST /` でプレイヤー配列を受け取り `data` に保存する。`GAME_API_SECRET` が設定されていれば `x-api-secret` ヘッダーを照合する（未設定なら無認証）。
- `validatePlayerData`: 配列であること、各要素が `name`（空でない文字列）と下記の必須フィールドを持つこと。
- 最後のリクエストから 5 秒経つと `data = null`（ゲームサーバー停止の検知）。

プレイヤーデータ（`frontend/types/playreData.d.ts`）:

| フィールド | 意味 |
|---|---|
| `name` | ゲーマータグ（= Discord ニックネームの `[...]` 部分） |
| `dimension`, `x`, `y`, `z` | ディメンションと座標 |
| `telephone` | 通話中の番号（0 = 通話なし） |
| `hasTelephone` | スマホ所持（Discord の PHONE ロールに同期） |
| `useMegaphone`, `useMicrophone` | メガホン／マイク使用中 |
| `transceiverType`, `transceiverNumber` | トランシーバー（type 1 = 送信側、number 0 = 未使用） |
| `mute` | ゲーム側からのミュート指示（1 = トグル, 2 = ミュート, 3 = 解除） |
| `voiceRangeOutput`, `volumeOutput`, `voiceRangeInput`, `volumeInput` | 声の届く範囲・音量の倍率（%） |

### `src/socketServer.ts`（ポート 3001、development は http、それ以外は https で `./key/*.pem`）

| 方向 | イベント | 内容 |
|---|---|---|
| C→S | `join` (gamerTag) | userMap に登録し、`joined` で現在の全体発言者一覧を返す |
| S→C | `playerData` | 100ms ごとに全プレイヤーデータを送る（接続直後から送られる） |
| C→S→全員 | `changeSetting` | 全員に設定の再読み込みを通知する |
| C→S→全員 | `onSpeaker` / `offSpeaker` → `setAdminSpeaker` | 全体発言者（運営）一覧 |
| C→S | `exit` | 全体発言者から外す（userMap には残る） |
| C→S→対象 | `kick` (gamerTag) → `kicked` | 対象クライアントを退出させる |
| C→S | `debug` (object) | `backend/logs/YYYY-MM-DD.jsonl` に追記する |

Socket.IO 側に認証はない。管理者専用の操作は UI で隠しているだけ。

### `src/discordBot.ts`
- `env/tokens.json`（`{ "tokens": [...] }`）の Bot を順にログインする（1 体あたり最大 5 回リトライ）。
- **参加人数表示**: 10 秒ごとに、プレイヤー数と同じ番号の Bot（上限 20）だけを指定ボイスチャンネルに入れる。Bot の名前で人数を見せる仕組み。
- 内部 API（すべて `x-api-secret: API_SECRET` が必須、`id` は 17〜20 桁の数字）。リクエストのたびに使う Bot を順番に切り替える（`nextBot`）:

| エンドポイント | 内容 |
|---|---|
| `GET /getUserName?id=` | サーバーニックネームの `[...]` を返す。ない場合は 500 |
| `POST /checkJoinPass` `{pass}` | `JOIN_PASSWORD` と一致するかを bool で返す |
| `GET /getJoinRole` / `setJoinRole` | 参加ロールの確認／付与 |
| `GET /checkAdminRole` | 管理者ロールの有無 |
| `GET /setPhoneRole` / `removePhoneRole` | スマホロールの付与／解除 |

同じ express app を `app.listen(5000)`（http）と `server.listen(1234)`（dev は http、prod は https）の両方で公開している。

## frontend

### 画面の流れ（`pages/index.vue`）
1. 未ログイン → `/auth/discord`（`server/routes/auth/discord.get.ts`）。OAuth が成功したら backend の `getUserName` と `checkAdminRole` を呼び、セッションに `{ discordId, discordAuth(=管理者), gamerTag }` を保存する。
2. 参加ロールがなければパスワード入力 → `/api/checkJoinPass` → `/api/setJoinRole`。
3. 「参加」→ `useConnectSkyway(gamerTag)` → `useConnectSocket()`。
4. 参加中は `voiceHeader`（退出・全体発言・ミュート・ノイズ抑制・設定）と `userList`（近くのプレイヤー／全員、管理者はキック可）を表示する。

### 状態管理
- `composables/useComponents.ts`: `useState` によるグローバル状態の置き場。UI 状態、AudioNode、ユーザー一覧、ingameSettings、playerData、adminSpeaker をまとめて持つ。
- `composables/useCusEvent.ts`: `mitt` のイベントバス（`dataCycle` / `exit` / `mute` / `debug`）。

### 音声処理
- 送信（`composables/useAudio.ts`）: `getUserMedia` → `MediaStreamSource` →（ノイズ抑制 ON なら rnnoise の AudioWorklet）→ `GainNode`（`micLevel / 50`、ミュート時は 0）→ `MediaStreamDestination`（`micDest`）。`micDest` のトラックを SkyWay に publish する。
- 受信（`composables/useSkyway.client.ts`）:
  - SFU ルーム `test` に参加する。名前の空白は `'....__..__._..'` に置き換える（SkyWay の名前に空白を使えないため）。
  - publication ごとに `addJoinMember` がクロージャ（`memberHandlers`）を作る。`isNearby` / `subscribing` / `sub` をユーザー単位で持つ。
  - `playerData` を受信するたび（`dataCycle`）に自分のデータを探し、`calcPlayerVolume` で相手ごとの音量を計算する。音量が 0 より大きい相手と全体発言中の相手だけを subscribe し、それ以外は unsubscribe する。ゲーム内にいなければ全体発言者だけを subscribe する。
  - 受信音声: `MediaStreamSource` → `GainNode`（`2 × ユーザー別gain × 距離音量 × phoneLevel/100`、全体発言者の距離音量は 1）→ `MediaStreamDestination` → `Audio` 要素。`AnalyserNode` で発話中を判定する。
  - 自分の `hasTelephone` が変わったら PHONE ロールを付与・解除する。`mute` が 0 以外で変わったら `mute` イベントを出す。

### 距離音量の計算（`calcPlayerVolume`）
相手ごとに次の順で判定する。
1. 双方とも通話していない → 係数 1。同じ番号で通話中 → **1 で確定**。片方だけ通話中 → 係数 = `general.callingVolume`。
2. 双方がトランシーバーを持ち、相手が送信側で番号が一致し、自分の type が 0 か 1 → **1 で確定**。
3. ディメンションが違う → 0。
4. 相手がマイク使用中なら `microphone`、メガホンなら `megaphone` の設定（係数・min・max）を使う。それ以外は `general` の min・max を使う。マイクやメガホンの係数は手順 1 の通話係数を上書きする。
5. `range = 相手voiceRangeOutput% × 自分voiceRangeInput%`。min と max に range を掛ける。`volume = 相手volumeOutput% × 自分volumeInput%`。
6. 距離 ≤ min → 1、距離 ≥ max → `general.minVolume`、その間は線形に減衰する。最終値は `距離音量 × 係数 × volume`。

### 設定ファイル
- `frontend/settings/setting.json`: 現在の距離設定。管理者が `/api/setSetting` で上書きする（プロセスの cwd からの相対パス）。
- `frontend/settings/default.json`: 「デフォルトに戻す」で読み込む初期値。
- localStorage: `micLevel`、`phoneLevel`、相手のゲーマータグをキーにしたユーザー別 gain。

### server/api（Nuxt）
`getSkywayToken`、`checkJoinPass`、`get/setJoinRole`、`set/removePhoneRole` はセッションを確認したうえで backend 内部 API に `x-api-secret` を付けて中継する。`setSetting` は `discordAuth`（管理者）も確認する。`getSetting` と `getDefaultSetting` は無認証。

## 環境変数・秘密ファイル（すべて git 管理外）

backend（`backend/.env`、`backend/env/tokens.json`、`backend/key/{privkey,fullchain}.pem`）:
`NODE_ENV`(dev|prod), `SERVER_URL`(CORS 許可元), `DISCORD_SERVER_ID`, `DISCORD_SERVER_ROOM_ID`, `DISCORD_SERVER_ROLE_ID_ADMIN`, `DISCORD_SERVER_ROLE_ID_PHONE`, `DISCORD_SERVER_ROLE_ID_JOIN`, `JOIN_PASSWORD`（必須）, `API_SECRET`（必須）, `GAME_API_SECRET`（任意）

frontend（`frontend/.env`）:
`NUXT_APP_SECRET`（セッション暗号化。**nuxt-auth-utils 0.6 から必須**。旧 `NUXT_SESSION_PASSWORD` は使われない）, `NUXT_SKYWAY_APP_ID`, `NUXT_SKYWAY_SECRET_KEY`, `NUXT_API_SECRET`（backend の `API_SECRET` と同じ値）, `NUXT_PUBLIC_SERVER_SOCKET_URL`, `NUXT_PUBLIC_SERVER_API_URL`, `NUXT_PUBLIC_SERVER_API_SSLURL`（未使用）, `NUXT_OAUTH_DISCORD_CLIENT_ID`, `NUXT_OAUTH_DISCORD_CLIENT_SECRET`, `NUXT_OAUTH_DISCORD_REDIRECT_URL`

本番・開発とも Windows 機で動かす。backend は `pnpm dev`（tsx、NODE_ENV=development）/ `pnpm build` → `pnpm start`（`dist/index.cjs`、NODE_ENV=production）で、Windows でもそのまま動く。`.env`・`env/tokens.json`・`key/`・`logs/` は cwd からの相対パスで読む（pnpm のスクリプトでは cwd は `backend/`）。

## 検証方法

| 対象 | コマンド | 2026-11-03 時点の結果 |
|---|---|---|
| テスト | ルートで `pnpm test` | backend 81 件・shared 4 件すべて成功（2026-11-03、フェーズ 0 の 1 本目の後） |
| 型チェック | ルートで `pnpm typecheck` | backend・shared は成功。frontend は未追加 |
| ビルド | ルートで `pnpm build` | 成功（frontend の警告はチャンクサイズのみ） |
| frontend 型チェック | `cd frontend; npx -y -p typescript@5.9 -p vue-tsc@3 vue-tsc --noEmit -p .nuxt/tsconfig.app.json`（server 側は `tsconfig.server.json`） | **既存のエラー: app 15 件、server 6 件**。ビルドには影響しない |

- pnpm workspace（Node 24）。backend のテストは実際のモジュールを読み込み、HTTP と Socket.IO を実際に通す（Discord はギルドとメンバーを偽物に差し替える）。
- 起動スモーク（手動）: `express.js` と `socket.js` だけを起動し、POST → `join` → `playerData` / `setAdminSpeaker` / `changeSetting` / `kick` の受信、5 秒後のクリアを確認済み。Nuxt の `.output` をダミーの環境変数で起動し、未ログインの画面描画、API が 401 を返すこと、`/auth/discord` が Discord へリダイレクトすることも確認済み。
- ログイン後のフロー（OAuth、Bot、SkyWay、ゲームサーバー）は本物の認証情報が必要なため、ローカルでは検証していない。

既存の型エラーの内訳: `useApi.ts`（useFetch の戻り値が undefined を含む）、`useAudio.ts`（Uint8Array の型）、`useSkyway.client.ts`（track や info が undefined の可能性）、`index.vue`（session.value が null の可能性）、`discord.get.ts`（nuxt-auth-utils 0.6 の `RequestEvent` と h3 の `H3Event` の不一致）、`server/api/*Setting.ts`（server の tsconfig からグローバル型 `ingameSettings` が見えない）。

## 版の履歴と旧リポジトリ

- 旧リポジトリ `E:\dev\_archive\SyakasabaVC\SVoice-2.0`（remote: `HiraG-62/SVoice-2.0`、ブランチ `fix-voice`）は、このリポジトリの `be41321 feat: ログ追加`（2025-08-24）と同じコミットにある。違いは `frontend/composables/useSkyway.client.ts` の未コミット変更だけ。
- その未コミット変更は「音声が聞こえなくなる」問題への対策。`me.subscriptions` の中に `state !== 'canceled'` の subscription があるかで購読中を判定し、`room.publications` に残っている publication だけを再購読する。
- このリポジトリでは、`be41321` の後に次の変更が入っている: `b7764f0` セキュリティ修正、`f1c7998` 音声バグ修正、`0f7a716` 相手ごとのクロージャへのリファクタリング（いずれも 2026-03-25）、`168ffaf` / `c663619` 依存の整理と更新（2026-11）。
- 今のクロージャ版は、購読状態をローカルのフラグだけで持っている。SkyWay 側で subscription が切れても検知しない。旧版の考え方を取り込む設計は `docs/specs/voice-subscription-sync.md` にある（保留中）。

## 既知の問題（未修正）

不具合・リファクタリング対象・本番と開発の切り分けの一覧と進め方は `docs/OVERHAUL.md` にまとめている。
