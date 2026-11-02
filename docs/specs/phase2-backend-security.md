# phase2-backend-security: backend のセキュリティ強化と Discord 処理の分割

大改修フェーズ 2（`docs/OVERHAUL.md` §6）の 1 本目。対象は S3（サーバー側）・S4・S5・S6（サーバー側）・S7・C3・C4・C6（サーバー側）・C7・C8・C12・C13・R4。
不変条件 I1〜I6（`docs/OVERHAUL.md` §1）を守る。前提知識は `AGENTS.md` と `docs/DESIGN.md` にある。
ユーザーは不在のため、設計担当（claude）が計画書の決定事項に沿って判断した。判断の理由は各項目に書く。

## Fixed

### 1. Socket.IO の認証トークン（S3、frontend と共有する取り決め）
- `packages/shared/src/socketToken.ts` を追加し、`@svoice/shared/socket-token` として公開する（`package.json` の `exports` に追加。node:crypto を使うため、ブラウザからは import しない）。
- `createSocketToken(payload, secret): string` / `verifySocketToken(token, secret, now = Date.now()): SocketTokenPayload | null`
  - `SocketTokenPayload = { gamerTag: string; discordId: string; admin: boolean; exp: number }`（`exp` はミリ秒の UNIX 時刻）
  - 形式: `base64url(JSON) + '.' + base64url(HMAC-SHA256(secret, base64url(JSON)))`。署名の比較は `timingSafeEqual`。期限切れ・形式不正・署名不一致は `null`。
  - 秘密鍵は backend の `API_SECRET`（= frontend の `NUXT_API_SECRET`）。
- frontend（次のタスク）は、接続のたびに Nuxt サーバーから有効期限 60 秒のトークンを受け取り、`io(url, { auth: { token } })` で渡す。

### 2. Socket.IO サーバー（S3・S4・C3・C4・C12・C13）
- **接続時の認証**: `io.use` でトークンを検証し、失敗したら `new Error('unauthorized')` で接続を拒否する。検証した内容を `socket.data` に保存する。
- **ゲーマータグはトークンから決める**: `join` の引数は互換のために受け取るが使わない。
- **管理者専用**: `kick` / `onSpeaker` / `offSpeaker` / `changeSetting` は `socket.data.admin` のときだけ処理する。それ以外は無視し、1 行ログに出す。`offSpeaker` は、本人が全体発言中なら管理者でなくても外してよい（権限が外れた後に止められなくなるのを防ぐため）。
- **参加中の人にだけ配信（C3）**: `join` で Socket.IO の room `joined` に入れ、`exit` と切断で外す。配信のタイマーはサーバーに 1 つだけ持ち、100ms ごとに `io.to('joined').emit('playerData', data)` で送る。
- **ゲームデータが止まったとき（C12・C13）**: `getData()` が null のときは、空の配列 `[]` を送る。frontend は空の配列を「自分がゲーム内にいない」として扱う（今のコードのまま、待機中になり、全体発言者だけを受信する）。理由: 送信が止まると画面が最後の状態のまま固まり、全体発言の判定も動かないため。
- **exit（C4）**: 全体発言者から外し、room `joined` から外す。再度 `join` するまでキックの対象にしない。
- **kick**: 同じゲーマータグのソケットがすべて対象（今は最初の 1 つだけ）。
- **debug（S4）**: 認証済みなら誰でも送れる（I6）。1 回の内容は JSON にして 64KB まで、1 ソケットあたり 1 分に 5 回まで。超えたら捨てて 1 行ログに出す。書き込むとき、`<DATA_DIR>/logs/` の 30 日より古い `.jsonl` を削除し、合計が 100MB を超えていれば古い順に削除する。各ログ行に、受信時刻と `socket.data` のゲーマータグを付ける（`{ receivedAt, gamerTag, data }`）。

### 3. 受信の保護（S5・C8）
- **送信元の制限**: `GAME_ALLOWED_IPS`（カンマ区切り）。既定は `127.0.0.1,::1,::ffff:127.0.0.1`。一致しない送信元は 403 にし、送信元ごとに 1 分に 1 回までログに出す（`受信拒否: <IP>`）。`*` で制限なし。理由: 計画書の決定（既定は同じ機械のみ。緊急時は許可先を追加）。
- **形式の検証**: 今の必須フィールドの確認に加え、`name` は空でない文字列、それ以外のフィールドは「有限の数値・真偽値・数値として読める文字列」のどれかであることを確かめる。値の変換はしない（受け取った内容をそのまま配信する）。プレイヤー数は 500 人まで。理由: 実際の送信データのサンプル（Q14）がまだなく、厳しくしすぎると本番の受信を止める恐れがあるため。サンプルが届いたら厳しくする。
- 不正な形式は今どおり 400。最初の理由を 1 分に 1 回までログに出す。
- `GAME_API_SECRET` の扱いは今のまま。

### 4. 内部 API の保護（S7）
- `INTERNAL_API_ALLOWED_IPS`（既定は上と同じ。`*` で制限なし）。一致しなければ 403。
- CORS を外す（内部 API はブラウザから呼ばれない）。
- `x-api-secret` の確認は今のまま。ポートは変えない（I2）。

### 5. 参加パスワードのロック（S6 のサーバー側）
- 新しいエンドポイント `POST /joinAuth`（本文 `{ pass: string, id: string, gamerTag: string }`）:
  - ロック中なら `{ ok: false, locked: true, remaining: 0 }`。
  - パスワードが一致すれば、失敗回数を消し、参加ロールを付与して（`DISCORD_ENABLED=false` では付与しない）、`{ ok: true, locked: false, remaining: 5 }`。
  - 一致しなければ失敗回数を 1 増やす。連続 5 回でロックする。`{ ok: false, locked, remaining }`。
- `GET /joinLocks` → `[{ id, gamerTag, failures, lockedAt }]`（ロック中のみ）。`POST /unlockJoin`（本文 `{ id }`）→ ロックと失敗回数を消して `{ success: true }`。
- 失敗回数とロックは `<DATA_DIR>/join-locks.json` に保存し、再起動しても残す。
- 既存の `/checkJoinPass` と `/setJoinRole` は、frontend が移行するまで今のまま残す（次のタスクで削除する）。

### 6. Discord 処理の分割（R4・C6・C7）
- `discordBot.ts` を分ける: Bot のログインと管理（`discord/bots.ts`）、人数表示（`discord/memberCount.ts`）、内部 API（`internalApi.ts`）。外から見える動き（ポート、エンドポイント、応答）は、この設計書で変えるもの以外は変えない。
- **C7**: Bot ごとに `ready` を待ってから使う（ログイン後に `once('ready')` を登録しない）。ログインできた Bot が 0 体なら、人数表示とロール操作を止め、内部 API は `DISCORD_ENABLED=false` と同じ応答を返し、エラーを 1 行ログに出す（プロセスは落とさない）。`tokens.json` がない・読めないときも同じ。
- **C6**: `getUserName` の失敗を区別する: メンバーがいない → 404 `{ error: 'member_not_found' }`、ニックネームに `[...]` がない → 422 `{ error: 'nickname_missing' }`、Discord 機能が無効または Bot なし → 503 `{ error: 'discord_unavailable' }`、それ以外 → 500 `{ error: 'internal_error' }`。どれも理由を 1 行ログに出す（ID の末尾 4 桁だけを出す）。

### 7. 設定
- `config.ts` に `GAME_ALLOWED_IPS` と `INTERNAL_API_ALLOWED_IPS` を追加し、`backend/.env.example` に説明を書く（本番で BE サーバーが別の機械から送る場合は、その IP を足すこと）。

### テスト
- トークン: 正常／期限切れ／署名違い／形式不正／秘密鍵違い。
- Socket: トークンなし・不正で接続拒否／`join` の引数ではなくトークンのゲーマータグが使われる／管理者以外の `kick`・`onSpeaker`・`changeSetting` が無視される／`join` 前と `exit` 後は `playerData` が届かない／データが null のとき `[]` が届く／kick が同じタグのすべてに届く／debug の大きさと回数の制限とログの形式／古いログの削除。
- 受信: 許可外の IP が 403（テストでは許可リストを差し替える）／数値・真偽値・数値文字列を受け付け、オブジェクトや配列の値を拒否する。
- 内部 API: 許可外の IP が 403／`joinAuth` の成功・失敗・5 回でロック・ロック中・解除／再起動（ストアの作り直し）後もロックが残る／`getUserName` の各エラー。
- Bot: 0 体でも落ちない。
- 既存のテストは、仕様を変えた箇所以外はそのまま通ること。

### 変更してよいファイル
- `backend/` 配下（`.env`・`.env.development`・`env/`・`key/`・`logs/`・`data/` は除く）
- `packages/shared/` 配下
- `pnpm-lock.yaml`（依存を追加した場合）

### 完了条件（RESULT は箇条書き 10 行程度）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` が通る。
- frontend はこのタスクでは変えないため、ユーザーの `pnpm dev` 環境での通話は次のタスクまで動かなくなってよい（Socket の認証が必要になるため）。
- 起動の確認は、テスト（実際に listen させるもの）で行う。動いている `pnpm dev` を止めたり、別のポートで起動したりしない。

## Discretion
- ファイルの分け方の細部、関数名、ログの文言（短く）。
- レート制限と削除処理の実装方法。
- `join-locks.json` の書き込み方（同時書き込みを避ける工夫）。
