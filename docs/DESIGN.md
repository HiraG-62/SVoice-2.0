# しゃかさばボイス 設計資料

ゲームサーバー（Minecraft 統合版系の「しゃかさば」）向けの近接ボイスチャット Web アプリ。
ゲームサーバーから届くプレイヤー座標・状態をもとに、ブラウザ側で相手ごとの音量を距離で変える。

## 全体構成

```
ゲームサーバー ──POST / (30000)──▶ backend gameReceiver ─┐ getData()
                                                          ├─▶ backend socketServer (3001) ──playerData 100ms──▶ 参加中のブラウザ
                                                          └─▶ backend discord/memberCount（参加人数 Bot 表示）
ブラウザ ──HTTP──▶ frontend (Nuxt server/api) ──x-api-secret──▶ backend internalApi (5000 http / 1234 https)
ブラウザ ──Socket.IO（トークン認証）──▶ backend socketServer
ブラウザ ◀──SFU──▶ SkyWay（音声本体。ルーム名は `NUXT_PUBLIC_SKYWAY_ROOM_NAME`、既定 `test`。トークンは Nuxt サーバーが発行）
```

| ディレクトリ | 技術 | 役割 |
|---|---|---|
| `frontend/` | Nuxt 4, Vuetify 4, Pinia, `@skyway-sdk/room@2`, `socket.io-client`, `@timephy/rnnoise-wasm`, `nuxt-auth-utils` | UI、音声処理、Discord OAuth、SkyWay・Socket のトークン発行、内部 API へのプロキシ |
| `backend/` | Node.js + TypeScript（tsup で CJS にビルド）, express 5, socket.io 4, discord.js 14, `@discordjs/voice` | プレイヤーデータ中継、Socket.IO、Discord Bot・内部 API、参加ロック |
| `packages/shared/` | TypeScript, zod | 共有の型（`PlayerData`・`IngameSettings`・Socket.IO のイベント）、スキーマ、Socket のトークン（`@svoice/shared/socket-token`、node 専用）、SkyWay のメンバー名の変換 |
| `e2e/` | Playwright | 実際の SkyWay と合成音声で 2 人の通話を確かめる E2E |

backend の起動は `backend/src/index.ts` が設定（`config.ts`）を読み込み、受信・Socket.IO・Discord Bot と内部 API を順に起動するだけ。プレイヤーデータは `gameReceiver.ts` が作る受信側のクロージャに保持し、`getData()` を他モジュールに渡す（DB なし・プロセス内メモリのみ）。各モジュールは「作る関数」と「listen する関数」に分かれ、依存を引数で差し替えられる。

## backend

### `src/gameReceiver.ts`（ポート 30000）
- `POST /` でプレイヤー配列を受け取り、`data` に保存する。
- 送信元 IP を `GAME_ALLOWED_IPS`（既定は同じ機械のみ）で制限する。許可外は 403 で、1 分に 1 回 `受信拒否: <IP>` をログに出す。
- `GAME_API_SECRET` が設定されていれば `x-api-secret` を照合する（BE 側は送れないため、本番では未設定の想定）。
- 形式の検証: 配列、500 人まで、`name` は空でない文字列、ほかのフィールドは有限の数値・真偽値・数値として読める文字列のどれか。値は変換しない（実データのサンプル待ち。Q14）。
- 正しいデータを最後に受け取ってから 5 秒で `data = null`（ゲームサーバー停止の検知）。

プレイヤーデータ（`@svoice/shared` の `PlayerData`）:

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

### `src/socketServer.ts`（ポート 3001、development は http、それ以外は https）
- **接続時の認証**: `handshake.auth.token` を `verifySocketToken`（HMAC-SHA256、秘密鍵は `API_SECRET`、有効期限 60 秒）で検証する。失敗は `unauthorized` で拒否。トークンの `{ gamerTag, discordId, admin }` を `socket.data` に入れる。

| 方向 | イベント | 内容 |
|---|---|---|
| C→S | `join` | room `joined` に入れ、`joined` で全体発言者一覧を返す。ゲーマータグはトークンのもの（引数は使わない） |
| S→C | `playerData` | サーバーの 1 つのタイマーで、100ms ごとに参加中のソケットだけに送る。ゲームデータがないときは `[]` |
| C→S→全員 | `changeSetting` | 管理者のみ。全員に設定の再読み込みを通知する |
| C→S→全員 | `onSpeaker` / `offSpeaker` → `setAdminSpeaker` | 全体発言。開始は管理者のみ、停止は本人も可。接続ごとに管理する |
| C→S | `exit` | 全体発言者と room `joined` から外す |
| C→S→対象 | `kick` → `kicked` | 管理者のみ。同じゲーマータグのすべての接続に送る |
| C→S | `debug` | 誰でも可（I6）。64KB・1 分 5 回まで。`<DATA_DIR>/logs/YYYY-MM-DD.jsonl` に `{ receivedAt, gamerTag, data }` を追記。30 日・合計 100MB を超えた古いログは削除する |

- 管理者以外の管理操作は無視して 1 行ログに出す。
- 保存したデバッグ情報は `pnpm --filter @svoice/backend debug-log [--tag <ゲーマータグ>] [--date YYYY-MM-DD]` で読む。

### `src/internalApi.ts` と `src/discord/`
- `discord/bots.ts`: `tokens.json`（`{ "tokens": [...] }`）の Bot を順にログインする（1 体あたり最大 5 回リトライ）。`clientReady` をログイン前に登録する。Bot が 0 体やファイル不正でもプロセスは落ちず、Discord 機能が無効のときと同じ応答になる。
- `discord/memberCount.ts`: **参加人数表示**。10 秒ごとに、プレイヤー数と同じ番号の Bot（上限 20）だけを指定ボイスチャンネルに入れる。`DISCORD_MEMBER_COUNT_ENABLED=false` で止まる。
- 内部 API（送信元 IP を `INTERNAL_API_ALLOWED_IPS` で制限し、すべて `x-api-secret: API_SECRET` が必須。CORS なし。`id` は 17〜20 桁の数字）:

| エンドポイント | 内容 |
|---|---|
| `GET /getUserName?id=` | サーバーニックネームの `[...]` を返す。404 `member_not_found` / 422 `nickname_missing` / 503 `discord_unavailable` / 500 `internal_error` |
| `POST /joinAuth` `{ pass, id, gamerTag }` | パスワードを照合し、一致すれば参加ロールを付与して `{ ok, locked, remaining }`。連続 5 回の失敗でロック（`<DATA_DIR>/join-locks.json` に保存） |
| `GET /joinLocks` / `POST /unlockJoin` `{ id }` | ロック中の一覧／解除 |
| `GET /getJoinRole` / `checkAdminRole` | 参加ロール・管理者ロールの有無 |
| `GET /setPhoneRole` / `removePhoneRole` | スマホロールの付与／解除 |

- 同じ express app を 5000（http）と 1234（development は http、それ以外は https）で公開する。
- `DISCORD_ENABLED=false` のときは Discord に問い合わせない: `getJoinRole` → true、`checkAdminRole` → false、ロールの付け外し → 成功（何もしない）、`getUserName` → 503。

## frontend

### 画面の流れ（`pages/index.vue`）
1. 未ログイン → `/auth/discord`（`server/routes/auth/discord.get.ts`、スコープは `identify` のみ）。backend の `getUserName` と `checkAdminRole` を呼び、セッションに `{ discordId, discordAuth, gamerTag }` を保存する。失敗理由ごとにログイン画面のメッセージを分ける。開発では開発用ログイン（下記）も使える。
2. 参加ロールがなければパスワード入力 → `/api/joinAuth`（残り回数とロックを表示。入力欄はテキスト表示のまま。I5）。
3. 「参加」→ `composables/useVoice.ts` がマイク・SkyWay・Socket の順に準備する。失敗したら理由ごとのメッセージを出す（マイク／トークン／SkyWay への参加／Socket の接続・タイムアウト）。
4. 参加中は `voiceHeader`（退出・全体発言・ミュート・ノイズ抑制・設定）と `userList`（近くのプレイヤー／全員、管理者はキック可）を表示する。設定ダイアログのタブは「一般」「サウンド」、管理者には「インゲーム」「参加ロック」も出る。

### 状態管理（Pinia）
- `stores/audio.ts`: 入出力デバイス、マイク音量・出力音量（localStorage の `micLevel` / `phoneLevel`、既定 100、上限 200・拡張時 2000）、自分のミュート、ノイズ抑制。
- `stores/call.ts`: 参加状態（idle / joining / joined）、ゲーム内かどうか、全プレイヤー（相手ごとの音量。localStorage のキーはゲーマータグ、0〜2、既定 1）、近くのプレイヤー（表示用の値）、全体発言者、自分が全体発言中か。
- `stores/settings.ts`: 距離設定（読み込み・保存・デフォルトに戻す。失敗時は読み込み直す）。
- 画面の中だけの状態（マイクテスト中、上限拡張、ダイアログの開閉など）は各コンポーネントが持つ。AudioNode や SkyWay のオブジェクトはストアに入れない。

### 音声処理（`services/`）
- `mic.ts`（送信）: `getUserMedia`（`echoCancellation: false`, `noiseSuppression: true`。I4）→ `MediaStreamSource` →（ノイズ抑制 ON なら rnnoise の AudioWorklet）→ `GainNode`（`micLevel / 50`、ミュート中は常に 0）→ `MediaStreamDestination`。入力デバイスを変えても destination は作り直さない（配信中のトラックを保つ）。
- `voiceRoom.ts`（受信）: SkyWay のルームに参加し、マイクのトラックを publish する。相手ごとに受信を管理し、受信の判定に応じて subscribe / unsubscribe する。受信音声は `MediaStreamSource` → `GainNode`（`2 × 相手ごとの音量 × 距離音量 × phoneLevel / 100`、全体発言者の距離音量は 1）→ `MediaStreamDestination` → `Audio` 要素。`AnalyserNode` で発話中を判定する（200ms ごとに `|v - 128| > 1`）。停止時に Audio 要素・AudioNode・トラックを解放する。
- `subscription.ts`: 相手ごとの購読状態を、SkyWay 側の subscription の実際の状態と 100ms ごとに同期する。取り消し・配信し直し・遅れて完了した subscribe を正しく扱う（V2・V3）。
- `volume.ts`: 距離音量（`calcPlayerVolume`）と受信判定（`shouldSubscribe`）の純粋な関数。作り直し前の結果を固定した 41 ケースの単体テストがある（I1）。
- `diagnostics.ts`: 「デバッグ用 送信」で送る情報を集める（自分の状態、相手ごとの購読・接続状態・距離音量と判定理由・gain・発話、直近 50 件のエラーと警告、UserAgent、アプリのバージョン）。
- `composables/useVoice.ts`: 参加・退出の流れ、Socket の受信の振り分け、ゲームからのミュート指示（効果音あり）、スマホ所持によるロールの付け外し。全体発言・設定・音量の変更は次のデータを待たずに反映する。空の配列を受け取ったら待機中にし、全体発言者だけを受信する。
- SkyWay のメンバー名: `@svoice/shared` の `encodeMemberName`（英数字・`.`・`-` 以外を `_` ＋ 6 桁の 16 進数に置き換える可逆な変換）。

### 距離音量の計算（`services/volume.ts` の `calcPlayerVolume`）
相手ごとに次の順で判定する（今の動作で意図どおり。Q6）。
1. 双方とも通話していない → 係数 1。同じ番号で通話中 → **1 で確定**。片方だけ通話中 → 係数 = `general.callingVolume`。
2. 双方がトランシーバーを持ち、相手が送信側で番号が一致し、自分の type が 0 か 1 → **1 で確定**。
3. ディメンションが違う → 0。
4. 相手がマイク使用中なら `microphone`、メガホンなら `megaphone` の設定（係数・min・max）を使う。それ以外は `general` の min・max を使う。マイクやメガホンの係数は手順 1 の通話係数を上書きする。
5. `range = 相手voiceRangeOutput% × 自分voiceRangeInput%`。min と max に range を掛ける。`volume = 相手volumeOutput% × 自分volumeInput%`。
6. 距離 ≤ min → 1、距離 ≥ max → `general.minVolume`、その間は線形に減衰する。最終値は `距離音量 × 係数 × volume`。

受信の判定: 全体発言者、または「自分がゲーム内にいて距離音量が 0 より大きい」相手だけを受信する。

### 設定ファイル
- `<NUXT_DATA_DIR>/setting.json`（既定 `frontend/data/setting.json`、git 管理外）: 現在の距離設定。管理者が `/api/setSetting` で上書きする（スキーマと値の範囲で検証）。相対パスは frontend の起動時の cwd から解決する。ファイルがなければ起動時に旧 `settings/setting.json`（なければ `default.json`）からコピーする。
- `frontend/settings/default.json`: 「デフォルトに戻す」で読み込む初期値。

### server/api（Nuxt）
- `server/utils/user.ts`: `requireUser`（未ログインは 401）、`isAdmin`（backend の `checkAdminRole` に毎回確認し、30 秒キャッシュ。開発用ログインはセッションの値）、`requireAdmin`（403）。
- `skywayToken`: SkyWay のトークンをサーバーで発行する（ルーム名と本人のメンバー名に限定。秘密キーは返さない）。
- `socketToken`: Socket.IO 用の 60 秒のトークン。
- `joinAuth`、`getJoinRole`、`setPhoneRole` / `removePhoneRole`: セッションの `discordId` だけを使って backend に中継する（クエリの id は使わない）。
- `admin/joinLocks`、`admin/unlockJoin`、`setSetting`: 管理者のみ。
- `getSetting`、`getDefaultSetting`: 無認証。

開発用ログイン: `POST /auth/dev`（`{ gamerTag, admin }`）。`import.meta.dev` かつ `NUXT_DEV_LOGIN_ENABLED=true` のときだけ動き、それ以外は 404。セッションに `devLogin: true` を入れる。`discordId` は `gamerTag` から作る 18 桁の偽の ID。backend を `DISCORD_ENABLED=false` で動かすと、参加ロールは常に true になる。

## 環境変数・秘密ファイル（すべて git 管理外）

backend（`backend/.env`・`.env.development`、`backend/env/tokens.json`、`backend/key/{privkey,fullchain}.pem`。すべて `backend/` 基準。キーの一覧と説明は `backend/.env.example`）:
`NODE_ENV`(development|production。スクリプトが設定), `SERVER_URL`(Socket.IO の CORS 許可元), `DISCORD_SERVER_ID`, `DISCORD_SERVER_ROOM_ID`, `DISCORD_SERVER_ROLE_ID_ADMIN`, `DISCORD_SERVER_ROLE_ID_PHONE`, `DISCORD_SERVER_ROLE_ID_JOIN`, `JOIN_PASSWORD`（必須）, `API_SECRET`（必須。frontend の `NUXT_API_SECRET` と同じ値で、Socket のトークンの署名にも使う）, `GAME_API_SECRET`（任意）, `GAME_ALLOWED_IPS` / `INTERNAL_API_ALLOWED_IPS`（既定は同じ機械のみ。`*` で制限なし）, ポート（`GAME_RECEIVER_PORT` / `SOCKET_PORT` / `DISCORD_HTTP_PORT` / `DISCORD_TLS_PORT`。既定は本番の値、開発は +100）, パス（`TLS_KEY_PATH` / `TLS_CERT_PATH` / `DISCORD_TOKENS_PATH` / `DATA_DIR`）, `DISCORD_ENABLED`, `DISCORD_MEMBER_COUNT_ENABLED`。`ENV_FILE` で `.env` の場所を差し替えられる。本番の設定例は `backend/.env.production.example`。Socket.IO と HTTPS 内部 API は証明書ファイルを 1 秒ごとに確認し、win-acme による置換も読み直す。更新に失敗した組では 1 行ログを出し、現在の証明書を保持する。

frontend（開発は `frontend/.env`・`.env.development`。キーの一覧と説明は `frontend/.env.example`、本番の設定例は `frontend/.env.production.example`）:
`NUXT_APP_SECRET`（セッション暗号化。必須）, `NUXT_SKYWAY_APP_ID`, `NUXT_SKYWAY_SECRET_KEY`, `NUXT_API_SECRET`, `NUXT_PUBLIC_SERVER_SOCKET_URL`, `NUXT_PUBLIC_SERVER_API_URL`, `NUXT_OAUTH_DISCORD_CLIENT_ID`, `NUXT_OAUTH_DISCORD_CLIENT_SECRET`, `NUXT_OAUTH_DISCORD_REDIRECT_URL`, `NUXT_PUBLIC_SKYWAY_ROOM_NAME`（既定 `test`）, `NUXT_DATA_DIR`（既定 `data`）, `NUXT_PORT`（開発サーバー。既定 3000）, `NUXT_DEV_LOGIN_ENABLED` / `NUXT_PUBLIC_DEV_LOGIN_PRESETS`（開発用ログイン）。`FRONTEND_ENV_FILE` で読み込む `.env` を差し替えられる（`frontend/scripts/nuxt.mjs`）。

本番 frontend: ルートの `pnpm start`（`frontend/scripts/start.mjs`）が `ENV_FILE`、未指定なら `frontend/.env.production` を読み、既存の環境変数を優先する。相対パスは frontend/ 基準。`PORT` は既定 3000、`TLS_KEY_PATH` と `TLS_CERT_PATH` が両方あれば HTTPS、両方なければ HTTP。証明書は backend と同じく 1 秒ごとに確認し、失敗時は現在の証明書を保持する。Nitro の `node-listener` と静的ファイル配信を利用する。秘密情報の既定値は空とし、実行時の `NUXT_*` で渡す。`pnpm check:secrets` は一時設定とダミー値でビルドし、`.output/` 全体への埋め込みを検査する。

開発: ルートの `pnpm dev` が `backend/.env.development`・`frontend/.env.development` を自動で使い、backend・frontend・偽ゲームサーバー（Alice と Bob の距離を往復）を一括起動する。本番・開発とも Windows 機で動かす。

## 検証方法

| 対象 | コマンド | 2026-11-03 時点の結果（フェーズ 3 の後） |
|---|---|---|
| 単体テスト | ルートで `pnpm test` | 320 件成功（shared 27・frontend 127・backend 166） |
| 型チェック | ルートで `pnpm typecheck` | エラー 0 件（E2E を含む） |
| ビルド | ルートで `pnpm build` | 成功 |
| E2E | `pnpm dev:e2e` を起動し、別のターミナルで `pnpm e2e` | 6 件成功（実際の SkyWay と合成音声。距離・通話・ディメンション・メガホン・ミュート・設定・待機中・全体発言・キック・再参加 3 回・参加ロック・デバッグ送信・参加失敗の表示） |

- 実際の Discord OAuth・Bot・ロールの付け外しは、ローカルでは検証していない（開発用ログインと `DISCORD_ENABLED=false` で代替）。
- 手動確認の手順は `docs/MANUAL_TEST.md`。

## 版の履歴と旧リポジトリ

- 旧リポジトリ `E:\dev\_archive\SyakasabaVC\SVoice-2.0`（remote: `HiraG-62/SVoice-2.0`、ブランチ `fix-voice`）は、このリポジトリの `be41321 feat: ログ追加`（2025-08-24）と同じコミットにある。違いは `frontend/composables/useSkyway.client.ts` の未コミット変更（SkyWay の subscription の状態で購読中を判定する、音声が聞こえなくなる問題への対策）だけ。
- このリポジトリでは `be41321` の後に、セキュリティ修正・音声の修正・クロージャへのリファクタリング（2026-03）、依存の更新、大改修のフェーズ 0〜3（2026-11-03）が入っている。旧版の購読状態の同期の考え方は、フェーズ 3 の `services/subscription.ts` に取り込んだ。

## 既知の問題・残りの作業

不具合・リファクタリング対象・本番と開発の切り分けの一覧と進め方は `docs/OVERHAUL.md` にまとめている。
