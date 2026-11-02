# phase0-frontend: frontend の型チェック・テスト基盤と型の整理

大改修フェーズ 0（`docs/OVERHAUL.md` §6）の 2 本目。`phase0-workspace-backend` の完了後に行う。**アプリの挙動は変えない。** 不変条件 I1〜I6（`docs/OVERHAUL.md` §1）を守る。
前提知識は `AGENTS.md` と `docs/DESIGN.md` にある。

## 背景
- frontend には `typecheck` / `test` スクリプトがない。vue-tsc で確認すると、既存の型エラーが app 15 件・server 6 件ある（内訳は `docs/OVERHAUL.md` §3.5）。
- セッションのユーザー型を、6 か所で `as { discordId: string; discordAuth: boolean; gamerTag: string }` とキャストしている。
- 型はグローバルな宣言ファイル（`frontend/types/*.d.ts`）にあり、ファイル名に誤字（`playreData.d.ts`）、型名が小文字（`playerData`、`ingameSettings`）のものがある。
- `phase0-workspace-backend` で、共有パッケージ `@svoice/shared`（`PlayerData`、`IngameSettings`、`VolumeSetting`、Socket.IO のイベント型、zod スキーマ）ができている。

## Fixed

### スクリプトと基盤
- `frontend/package.json` に次を追加する。ルートの `pnpm typecheck` / `pnpm test` から実行される。
  - `typecheck`: `nuxi typecheck`（`typescript` と `vue-tsc` を devDependencies に追加する）
  - `test`: `vitest run`
- vitest の設定は、Nuxt の実行環境を必要としない純粋な TypeScript のテストを動かせれば足りる（`@nuxt/test-utils` は必須ではない）。

### 既存の型エラーの解消（21 件 → 0 件）
- **挙動を変えずに**直す。実行時の分岐を足す必要がある場合は、今と同じ結果になる分岐にする（例: `undefined` なら今と同じく何もしない）。
- `server/routes/auth/discord.get.ts` の `RequestEvent` と `H3Event` の不一致は、nuxt-auth-utils 0.6 と h3 の型の組み合わせが原因。型の合わせ方で解決し、OAuth の処理内容は変えない。
- `useSkyway.client.ts` は、フェーズ 3 で大きく作り直す予定。型エラーの解消に必要な最小限の変更にとどめる。

### 型の整理（R5）
- **セッションのユーザー型**: nuxt-auth-utils の型拡張（`#auth-utils` の `User` インターフェース）で `{ discordId: string; discordAuth: boolean; gamerTag: string }` を宣言し、6 か所のキャストをなくす。
- **共有型への切り替え**: `frontend/types/playreData.d.ts` と `frontend/types/setting.d.ts` を削除し、`@svoice/shared` の `PlayerData` / `IngameSettings` / `VolumeSetting` を import して使う。`frontend/package.json` の dependencies に `@svoice/shared`（`workspace:*`）を追加する。
- `frontend/types/audio.d.ts` と `frontend/types/user.d.ts` は、今のまま残してよい（フェーズ 3 の状態管理の作り直しで整理する）。
- Socket.IO のクライアントに、`@svoice/shared` のイベント型を付ける（`Socket<ServerToClientEvents, ClientToServerEvents>`）。イベント名と内容は変えない。

### 設定の検証（D1 の frontend 側）
- Nitro のサーバープラグインで、起動時に必須の設定がそろっているかを確認する。足りないキーがあれば、その一覧をエラーとしてログに出す。**起動は止めない**（今の挙動を変えないため）。
- 必須のキー: `NUXT_APP_SECRET`（nuxt-auth-utils のセッション）、`NUXT_SKYWAY_APP_ID`、`NUXT_SKYWAY_SECRET_KEY`、`NUXT_API_SECRET`、`NUXT_PUBLIC_SERVER_SOCKET_URL`、`NUXT_PUBLIC_SERVER_API_URL`、`NUXT_OAUTH_DISCORD_CLIENT_ID`、`NUXT_OAUTH_DISCORD_CLIENT_SECRET`、`NUXT_OAUTH_DISCORD_REDIRECT_URL`
- 確認のロジックは純粋な関数に切り出し、単体テストを書く。
- `frontend/.env.example` を作る（キーの一覧と説明。値は空にする）。キーは `docs/MANUAL_TEST.md` の frontend の表と同じにする。`NUXT_SESSION_PASSWORD` は含めない。

### テスト
- 上の設定確認の関数のテスト（そろっている／足りないキーがある／空文字のキーがある）。
- 共有型への切り替えで、`server/api/getSetting.ts`・`getDefaultSetting.ts`・`setSetting.ts` の扱う型が `IngameSettings` になっていること（型チェックで担保されるので、テストは不要）。

### 変更してよいファイル
- `frontend/` 配下（`frontend/.env` と `frontend/settings/setting.json` は除く）
- `pnpm-lock.yaml`（依存の追加による更新）
- 生成物: `frontend/node_modules/`、`frontend/.nuxt/`、`frontend/.output/`
- `packages/shared/` は、frontend からの利用に必要な export の追加に限り変更してよい（既存の型の形は変えない）

### 完了条件（RESULT に実行コマンドと結果を含める）
- ルートの `pnpm build` / `pnpm test` / `pnpm typecheck` が通る（frontend の型エラーは 0 件）。
- 起動スモーク: `frontend/.output` をダミーの環境変数で起動し、次を確認する。
  - 未ログインでトップページが 200
  - `/api/getSkywayToken` と `/api/setJoinRole?id=1` が 401
  - `/auth/discord` が Discord へ 302
  - 必須キーを 1 つ外して起動すると、足りないキーがログに出て、起動は続く
- キャストを外した箇所と、型エラーを直すために実行時の分岐を足した箇所を、RESULT に一覧で書く。

## Discretion
- 型拡張のファイルの置き場所と名前。
- vitest の設定ファイルの構成。
- 設定確認の関数の名前と、ログの文言（短く、足りないキー名が分かること）。
- 型エラーの直し方（型の絞り込み、`??` での既定値、型注釈など。挙動が変わらない範囲）。
