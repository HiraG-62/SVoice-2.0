# phase2-frontend-security: frontend のセキュリティ強化と Socket 処理の整理

大改修フェーズ 2（`docs/OVERHAUL.md` §6）の 2 本目。`phase2-backend-security` の完了後に行う。対象は S1・S2・S3（クライアント側）・S6（画面）・S8・S9・S10・C6（画面側）・R3。
不変条件 I1〜I6（`docs/OVERHAUL.md` §1）を守る。前提知識は `AGENTS.md`、`docs/DESIGN.md`、`docs/specs/phase2-backend-security.md`（backend との取り決め）にある。
ユーザーは不在のため、設計担当（claude）が計画書の決定事項に沿って判断した。

## Fixed

### 1. 管理者の判定（S9）
- `server/utils/` に `requireUser(event)`（未ログインは 401）と `isAdmin(event)` を作る。
- `isAdmin`: 開発用ログインのセッション（`devLogin: true`）ならセッションの `discordAuth` を使う。それ以外は backend の `/checkAdminRole?id=<セッションの discordId>` で確認し、結果を discordId ごとに 30 秒キャッシュする。理由: ロールを外したら短時間で権限が消えるようにしつつ、Discord への問い合わせを抑えるため。
- 開発用ログイン（`/auth/dev`）はセッションに `devLogin: true` を入れる。`#auth-utils` の `User` 型に `devLogin?: boolean` を足す。

### 2. SkyWay のトークンをサーバーで発行する（S1）
- `/api/getSkywayToken` を廃止し、`GET /api/skywayToken` を作る（要ログイン）。応答は `{ token, roomName, memberName }` だけで、秘密キーは返さない。
- トークンは `@skyway-sdk/token` で生成する（必要なら frontend の依存に追加）。権限は今の `useSkyway.client.ts` と同じ形にしたうえで、チャンネルを `roomName`（`runtimeConfig.public.skywayRoomName`）に、自分が書き込めるメンバーを `memberName` に限定する。有効期限は今と同じ 24 時間。
- `memberName` は、セッションのゲーマータグを下の 3 の方式で変換したもの。クライアントはこの名前で `room.join` する。
- 実際の SkyWay で、参加・配信・受信ができることを確認する（完了条件）。権限を絞りすぎて参加できない場合は、動く範囲まで緩め、何を緩めたかを RESULT に書く。

### 3. SkyWay のメンバー名の変換（V8 / Q12）
- 空白を `....__..__._..` に置き換える方式をやめる（`.` のエスケープ漏れがあり、元の名前と衝突しうるため）。
- 新しい方式: 英数字・`.`・`-` 以外の文字（`_` を含む）を、`_` と 6 桁の 16 進数（コードポイント）に置き換える。例: `Alice Bob` → `Alice_000020Bob`、`a_b` → `a_00005fb`。元へ戻すときは `_` に続く 6 桁を読む。完全に元へ戻せることを単体テストで確かめる。
- 変換関数は `packages/shared/src/memberName.ts` に置き、frontend のサーバーとクライアントの両方から使う（node 専用の API を使わない）。
- 理由: SkyWay のメンバー名は英数字と一部の記号しか使えず、ゲーマータグの空白を表せないため。英数字・`.`・`-`・`_` だけで表せる、可逆な方式にした。

### 4. ロール系の API をセッションに基づかせる（S2・S6）
- `getJoinRole` / `setPhoneRole` / `removePhoneRole` は、クエリの `id` を使わず、セッションの `discordId` を使う（クエリは無視する）。
- `checkJoinPass` と `setJoinRole` を廃止し、`POST /api/joinAuth`（本文 `{ pass }`）を作る。backend の `/joinAuth` に、セッションの `discordId` とゲーマータグを付けて渡し、`{ ok, locked, remaining }` を返す。
- backend の旧エンドポイント `/checkJoinPass` と `/setJoinRole` を削除してよい（`backend/src/` の該当部分とテスト）。
- 参加認証の画面: 失敗時に「パスワードが違います（残り N 回）」、ロック中は「ロック中。運営に連絡」を表示する。パスワード欄はテキスト表示のまま（I5）。
- **ロック解除の画面**: 設定ダイアログに、管理者だけに見えるタブ「参加ロック」を足す。ロック中の一覧（ゲーマータグ・ロックした日時）と「解除」ボタン。空のときは「ロック中のユーザーはいません」。サーバー側は `GET /api/admin/joinLocks` と `POST /api/admin/unlockJoin`（どちらも `isAdmin` が必要。違えば 403）。

### 5. Socket の認証と処理の整理（S3・R3・C2）
- `GET /api/socketToken`（要ログイン）: `createSocketToken({ gamerTag, discordId, admin: await isAdmin(event), exp: 今 + 60 秒 }, NUXT_API_SECRET)` を返す。
- プラグインは `autoConnect: false` でソケットを作り、`auth` に「`/api/socketToken` を取得してトークンを渡す関数」を設定する（再接続のたびに新しいトークンになる）。
- Socket の処理を 1 つの composable にまとめ、プラグインとモジュール変数の二重管理をやめる。参加時に `connect()`（未接続なら）、`join` を送り、`joined` を待つ。`joined` を 10 秒待っても来なければ失敗として扱い、参加画面にエラーを出す（C5 の一部）。
- **リスナーの重複をなくす（C2）**: 参加時に登録したリスナー（`joined` / `playerData` / `changeSetting` / `setAdminSpeaker` / `kicked`）と mitt の `debug` は、退出・キックのときにすべて解除する。何度参加しても 1 つずつしか登録されないこと。
- 接続が拒否された（`connect_error`）ときは、参加画面に「接続できませんでした」を表示する。

### 6. 設定の検証（S8）
- `setSetting` は `ingameSettingsSchema` で検証し、違えば 400。各値が `min`〜`max` の範囲にあることも確かめる。管理者の判定は `isAdmin`。

### 7. OAuth（S10・C6）
- Discord OAuth の要求スコープを `identify` だけにする（`emailRequired` をやめる）。
- backend の `getUserName` の応答に合わせて、ログイン画面のエラーを分ける: `nickname_missing` →「Discordサーバーのニックネーム設定に不備があります。」（今の文言）、`member_not_found` →「Discordサーバーに参加していません。」、それ以外 →「ログインできませんでした。時間を空けてもう一度お試しください。」

### テスト
- `isAdmin` のキャッシュと開発用ログインの扱い、メンバー名の変換（往復・空白・`_`・日本語・記号）、`setSetting` の検証、`joinAuth` の応答の扱い、Socket のリスナーが重複しないこと（参加 → 退出 → 参加で 1 つずつ）。
- Nuxt の server API は、純粋な関数に切り出せる部分を単体テストする。

### 変更してよいファイル
- `frontend/` 配下（`.env`・`.env.development`・`data/`・`settings/*.json` の中身は除く）
- `packages/shared/` 配下（`memberName.ts` の追加と export）
- `backend/src/` と `backend/test/`（旧エンドポイントの削除に限る）
- `docs/MANUAL_TEST.md`（ロック解除の確認項目の追加）
- `pnpm-lock.yaml`

### 完了条件（RESULT は箇条書き 10 行程度）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` が通る。
- 動作の確認は、動いている `pnpm dev`（http://localhost:3100、`.env.development` の値のまま）で行う。別のフォルダーやポートで起動しない。開発用ログインで 2 人が参加でき、通話（相手の発話の検知）ができること。管理者の全体発言・キック、一般ユーザーの管理者操作の拒否、参加ロックと解除を確認する。
- ブラウザの操作は Playwright（グローバルに導入済み）を使ってよい。スクリプトはリポジトリの外の一時フォルダーに置く。

## Discretion
- composable とサーバーユーティリティの分け方、名前。
- 参加ロックのタブの見た目（既存の Vuetify の部品を使う）。
- `@skyway-sdk/token` の使い方の細部。
