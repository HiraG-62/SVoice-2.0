# startup-failure-exit: 起動失敗時の終了処理が 15 秒止まる問題

## 背景
本番の exe（`tools/package/runtime.mjs`）は、ポートの listen 失敗などで `lifecycle.fail` を呼び、登録された close 処理をすべて待ってから終了する。close 処理が 15 秒（`STOP_TIMEOUT_MS`）で終わらないと `終了処理のタイムアウト` を出して終了コード 1 で終わる。WinSW は失敗から 10 秒後に再起動するため、この 15 秒の分だけ復旧が遅れる。

claude の実測（`release/smoke/svoice.exe`、`DISCORD_ENABLED=false`、ポートを 1 つずつふさいで起動）:

| ふさいだポート | 終了までの時間 |
|---|---|
| frontend 3100 | 0.4 秒 |
| Socket.IO 3101 | 15.4 秒（`終了処理のタイムアウト`） |
| ゲーム受信 30100 | 15.5 秒（`終了処理のタイムアウト`） |
| 内部 API 5100 / 1334 | 0.4 秒 |

### 原因
Node の `net.Server` は、`listen()` を呼んだ後、`listening` イベントが出る前に `close()` すると、`listening` イベントを出さない（listen のコールバックは呼ばれない）。claude が Node 24 で確認済み:

```js
const s = net.createServer();
s.listen(0, () => console.log('listen cb')); // 呼ばれない
s.close();                                   // close のコールバックと 'close' イベントは出る
```

- ゲーム受信や Socket.IO の listen が失敗すると、内部 API の 2 つのサーバーは listen を呼んだ直後で、まだ `listening` イベントが出ていない。そこへ backend の close 処理（`backend/src/index.ts` の `registerClose`）がサーバーを close する。
- `listenDiscordServers`（`backend/src/internalApi.ts`）が返す Promise はこのため決着しない。`createDiscordService` の `close`（`backend/src/discordBot.ts`）は `ready.catch(() => {}).then(...)` で `ready` を待つため、永久に終わらない。backend の close 処理全体も終わらず、15 秒の watchdog で終わる。
- 同じ形の `startSocket`（`backend/src/socketServer.ts`）も、listen 前に close されると決着しない。今は close 処理から待たれていないが、同じ直し方をする。

## Fixed

### 振る舞い
- listen を待つ Promise（`listenDiscordServers` の各サーバーと `startSocket`）は、`listening` の前にサーバーが close されたら reject する。成功したら、そのために付けたリスナーは外す（成功後の close で reject しない）。エラーメッセージは日本語の短い文（例 `listen 前に停止`）。
- これにより、`createDiscordService` の `close` は、listen 中に close されても終わる。
- 本番の exe で、どのポートがふさがっていても、`終了処理のタイムアウト` を出さずに 0 以外の終了コードで終わる。
- 正常起動・正常停止（`--stop`、SIGINT）、Bot のログイン中の内部 API（503 `discord_starting`）の振る舞いは変えない。
- ポート番号・イベント名・ログの既存のメッセージは変えない。
- `tools/package/lifecycle.mjs` の watchdog（15 秒）は残す（別の原因で止まったときの保険）。

### 編集してよいファイル
- `backend/src/internalApi.ts`（`listenDiscordServers`）
- `backend/src/socketServer.ts`（`startSocket`）
- `backend/src/discordBot.ts`: 上の変更だけでは close が終わらない場合だけ
- `backend/src/index.ts`: reject の扱いで必要な場合だけ（未処理の rejection を出さないため、など）
- `backend/test/discordLifecycle.test.ts`・`backend/test/socketServer.test.ts`
- `tools/package/smoke.mjs`: `startupFailures` で、各ポートの失敗時の出力に `終了処理のタイムアウト` が含まれないことを確かめる（回帰の確認）

### テスト
- `listenDiscordServers`・`startSocket`: listen を呼んだ直後に close すると reject すること。listen が成功した後に close しても reject や未処理の rejection が出ないこと
- `createDiscordService`（`DISCORD_ENABLED=false` で可）: 作った直後に、内部 API のサーバーを close してから `close()` を呼んでも、`close()` が終わること（テストに期限を付ける）
- 既存のテストは変えずに通す

## Discretion
- reject のさせ方（`once('close')` と `off` の組み合わせ、`AbortSignal` など）
- `backend/src/index.ts` で、起動失敗の後に出る 2 つめ以降の `アプリ異常終了` のログ（同じ原因が重複して出る）を減らすかどうか。減らす場合も、最初の原因のログは必ず出す

## 完了の確認
- `pnpm test`、`pnpm typecheck`
- `pnpm package` と `pnpm package:smoke`（smoke は開発用の 5 ポートを使う。開発サーバーが動いていたら止めずに、smoke は実行せず RESULT にそう書く）。`startupFailures` で各ポートの終了までの時間を RESULT に書く
