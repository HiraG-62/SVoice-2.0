# event-logs: 参加・退出などの出来事をサーバーログに出す

## 背景
本番のサーバーログ（WinSW の `data/service-logs/`、各行の先頭に時刻。`ops-logging` で対応済み）には、Socket.IO の接続・切断が socket.id だけで残り、誰がいつ参加・退出したか、ゲームデータの受信が途絶えたかを追えない。障害の問い合わせ（「急に聞こえなくなった」「入れない」）の調査で、時刻とゲーマータグから出来事をたどれるようにする。

## Fixed

### 出すログ（文言はこのとおり。`<...>` は値）
すべて 1 行。既存のログと同じく `console.log` 相当（エラーではない）。

**Socket.IO（`backend/src/socketServer.ts`）**

| 出来事 | 文言 |
|---|---|
| 接続（既存を置き換え） | `接続: <ゲーマータグ> <socket.id>` |
| 参加（`join` を受け、その接続が未参加から参加中に変わったとき。参加中の `join` の重複では出さない。`exit` の後の再 `join` は出す） | `参加: <ゲーマータグ>（参加中 <n> 人）` |
| 退出（その接続が参加中から未参加に変わったとき（`exit` か切断）。参加していない接続では出さない） | `退出: <ゲーマータグ>（<理由>、参加中 <n> 人）` |
| 切断（既存を置き換え） | `切断: <ゲーマータグ> <socket.id> <Socket.IO の切断理由>` |
| キック | `キック: <管理者のゲーマータグ> → <対象のゲーマータグ>（<k> 接続）` |
| 全体発言の開始・終了（状態が変わったときだけ） | `全体発言開始: <ゲーマータグ>` / `全体発言終了: <ゲーマータグ>` |
| 設定変更の通知（`changeSetting` を全員に送ったとき） | `設定変更の通知: <ゲーマータグ>` |
| 操作拒否（既存を置き換え） | `操作拒否: <イベント名> <ゲーマータグ> <socket.id>` |
| デバッグ情報の保存 | 保存成功 `debug 保存: <ゲーマータグ>`。制限超過（既存を置き換え）`debug 制限超過: <ゲーマータグ> <socket.id>` |

- `<理由>` は、`exit` なら `退出操作`、切断なら Socket.IO の切断理由（`transport close`、`ping timeout` など、`disconnect` イベントの reason をそのまま）。
- `<n>` は、その出来事を反映した後の参加中の接続数（`users.size`）。
- 切断時は `退出` → `切断` の順に出す。

**ゲーム受信（`backend/src/gameReceiver.ts`）**

| 出来事 | 文言 |
|---|---|
| 受信開始（起動後の最初の受信、または受信停止の後の最初の受信。形式が正しく受け付けたとき） | `ゲームデータ受信開始: <人数> 人` |
| 受信停止（受信中に `PLAYER_IDLE_TIMEOUT_MS` 受信がなく、データを捨てたとき） | `ゲームデータ受信停止: <秒> 秒受信なし` |

- 起動直後から一度も受信していない状態でのタイムアウトでは `受信停止` を出さない。
- 毎回の受信や人数の変化では出さない（100ms ごとに届くため）。

**参加認証（`backend/src/internalApi.ts` の `/joinAuth`）**

| 出来事 | 文言 |
|---|---|
| 成功 | `参加認証成功: <ゲーマータグ>` |
| パスワード不一致（まだロックされない） | `参加パスワード不一致: <ゲーマータグ>（残り <r> 回）` |
| パスワード不一致でロックされた | `参加ロック: <ゲーマータグ>` |
| ロック中のため拒否 | `参加認証拒否: <ゲーマータグ>（ロック中）` |

- 既存の `参加認証失敗: <エラーの詳細>`（例外時の `console.error`）は変えない。
- 503 `discord_starting` の場合は出さなくてよい。

**frontend の server（Nitro）**

| 出来事 | 文言 |
|---|---|
| Discord ログイン成功（`frontend/server/routes/auth/discord.get.ts`） | `ログイン: <ゲーマータグ>`。管理者なら `ログイン: <ゲーマータグ>（管理者）` |
| 距離設定の保存（`frontend/server/api/setSetting.ts`。書き込みに成功したとき） | `距離設定の保存: <ゲーマータグ>` |
| 参加ロックの解除（`frontend/server/api/admin/unlockJoin.post.ts`。backend が成功を返したとき） | `参加ロック解除: <管理者のゲーマータグ> → ...<Discord ID の末尾 4 桁>` |

- 開発用ログイン（`/auth/dev`）では出さなくてよい。

### 不変条件・制約
- Discord ID は末尾 4 桁だけ出す（既存の `getUserName` のログと同じ `...1234`）。パスワード・トークン・シークレット・Cookie は出さない。
- Socket.IO のイベント名・ペイロード・ack、HTTP の応答（ステータス・本文）、ゲームサーバーとの契約は変えない。
- 上の表以外の既存のログの文言は変えない。
- ログを出すために処理の順序や結果を変えない（ログの失敗で処理を止めない）。
- 不変条件 I1〜I6（`docs/OVERHAUL.md`）に触れない。

### 編集してよいファイル
- `backend/src/socketServer.ts`・`backend/src/gameReceiver.ts`・`backend/src/internalApi.ts`
- `frontend/server/routes/auth/discord.get.ts`・`frontend/server/api/setSetting.ts`・`frontend/server/api/admin/unlockJoin.post.ts`、必要なら `frontend/server/utils/` に小さな関数を追加
- テスト: `backend/test/socketServer.test.ts`・`backend/test/gameReceiver.test.ts`・`backend/test/joinAuth.test.ts`、frontend は `frontend/test/` に追加または既存（`serverSecurity.test.ts`・`discordOAuth.test.ts`）に追記
- `docs/DESIGN.md` は claude が更新する

### テスト
- Socket.IO: 接続 → 参加 → 退出（`exit`）→ 切断の順と文言。参加せずに切断したとき `退出` が出ないこと。`exit` の後の切断で `退出` が 2 回出ないこと。2 回目の `join` で `参加` が出ないこと。キック・全体発言・操作拒否・debug の文言
- ゲーム受信: 起動直後のタイムアウトで `受信停止` が出ないこと。受信 → タイムアウト → 再受信で `受信開始`・`受信停止`・`受信開始` が 1 回ずつ出ること。連続した受信では `受信開始` が 1 回だけのこと（偽のタイマーを使う）
- 参加認証: 成功・不一致（残り回数）・ロック・ロック中の拒否の文言。ログに Discord ID の全桁とパスワードが含まれないこと
- frontend の server: 距離設定の保存とロック解除の文言（Discord ID は末尾 4 桁）。ログイン成功の文言はテストしやすい範囲でよい

## Discretion
- 既存の `logger` の注入をそのまま使うか、frontend の server でどう差し込むか
- ゲーマータグの改行などの制御文字の扱い（ゲーマータグは署名済みのトークンか Discord のニックネーム由来）。対策する場合は、制御文字を空白に置き換える程度でよい
- 退出・切断を出すための内部の持ち方（`users` に加えて状態を持つかなど）

## 完了の確認
- `pnpm test`、`pnpm typecheck`
- 音声・接続に関わる `backend/src/socketServer.ts` に触れるため、`pnpm dev:e2e` を起動して `pnpm e2e` も通す（起動直後は Nuxt のビルド待ちで失敗しやすいので、トップページが 200 を返してから 20 秒ほど待つ）。ユーザーの `pnpm dev` が動いていたら止めずに、E2E は実行せず RESULT にそう書く。自分で起動したサーバーは、終わったらプロセスの木ごと止めてポートの解放まで確認する
- E2E 中の backend の出力から、`接続`・`参加`・`退出`・`切断` の行の例を数行 RESULT に貼る（ゲーマータグはテスト用のもの）
