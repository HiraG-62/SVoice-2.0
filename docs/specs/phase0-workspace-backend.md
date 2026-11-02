# phase0-workspace-backend: pnpm workspace 化と backend の TypeScript 化

大改修フェーズ 0（`docs/OVERHAUL.md` §6）の 1 本目。**アプリの挙動は変えない。** 不変条件 I1〜I6（`docs/OVERHAUL.md` §1）を守る。
前提知識は `AGENTS.md` と `docs/DESIGN.md` にある。

## 背景
- 今は frontend / backend がそれぞれ独立した npm プロジェクト（`package-lock.json`）。`test` / `typecheck` スクリプトはなく、backend は CommonJS の JavaScript。
- backend のテスト `backend/test/express.test.js` は、ロジックのコピーとソースの文字列一致を確認するだけで、実際のモジュールを読み込んでいない。
- 決定事項（`docs/OVERHAUL.md` §7）: pnpm workspace への移行（Q3）、backend の TypeScript 化（Q2）、Node 24 LTS（Q11）。
- このタスクの後に `phase0-frontend`（frontend の型エラー解消など）を行う。frontend のソースはこのタスクでは原則として触らない。

## Fixed

### リポジトリ構成
```
/package.json            private。"packageManager": "pnpm@10.14.0"、"engines": { "node": ">=24 <25" }
/pnpm-workspace.yaml     packages: frontend, backend, packages/*。ビルドスクリプトを許可する依存（onlyBuiltDependencies）を列挙
/pnpm-lock.yaml          ルートに 1 つ
/.node-version           24
/packages/shared/        @svoice/shared（新規）
/backend/                @svoice/backend（TypeScript 化）
/frontend/               @svoice/frontend（package.json の調整のみ）
```
- ルートのスクリプト: `build` / `test` / `typecheck` は、各パッケージの同名スクリプトを再帰的に実行する（`pnpm -r --if-present`）。
- `frontend/package-lock.json` と `backend/package-lock.json` は削除する（git の操作はしない。ファイル操作で消す）。
- 依存の解決済みバージョンは、できるだけ今の `package-lock.json` と同じに保つ（`pnpm import` などを使う）。直接依存のバージョンが変わった場合は RESULT に一覧を書く。

### packages/shared（`@svoice/shared`）
- TypeScript のソースをそのまま公開する（`"exports": { ".": "./src/index.ts" }`）。ビルドの手順は持たない。
- 内容:
  - `PlayerData` 型: `frontend/types/playreData.d.ts` と同じフィールドを持つ
  - `PLAYER_DATA_FIELDS`: backend の `validatePlayerData` が使っている必須フィールドの配列
  - `IngameSettings` / `VolumeSetting` 型: `frontend/types/setting.d.ts` と同じ形
  - Socket.IO のイベントの型 `ServerToClientEvents` / `ClientToServerEvents`: 今あるイベント名と内容を**そのまま**型にする（`docs/DESIGN.md` の Socket.IO の表）
  - zod スキーマ `playerDataSchema` / `ingameSettingsSchema`: 型と同じ形。**このタスクでは実行時の検証には使わない**（フェーズ 2 で使う）。テストでだけ使う
- frontend からはまだ使わない（`phase0-frontend` で切り替える）。

### backend（`@svoice/backend`）
- ソースを `backend/src/` 配下の TypeScript に置き換える。`backend/backendServer.js` と `backend/external/*.js` は削除する。
- モジュールの分け方は今と 1 対 1 にする（`gameReceiver`（旧 express.js）、`socketServer`（旧 socket.js）、`discordBot`（旧 discordBot.js）、エントリ `index.ts`）。discordBot の分割（R4）はフェーズ 2 で行うので、ここではしない。
- **テストできる形にする**: 各モジュールは「app や server を作る関数」と「listen する関数」を分ける。外部への依存（プレイヤーデータの取得、Discord のギルドとメンバーの取得、ログの出力先フォルダー、現在時刻など）は引数で差し替えられるようにする。
- **設定モジュール `src/config.ts`**（D1）: 環境変数の読み込みと検証を 1 か所にまとめる（zod を使う）。
  - `JOIN_PASSWORD` / `API_SECRET` がないときは、今と同じメッセージで `process.exit(1)` する。
  - `NODE_ENV === 'development'` のときは http、それ以外は https（今の `'dev'` を `'development'` に読み替える。`'dev'` は受け付けない）。
  - `.env` を読み込む場所、証明書のパス（`./key/*.pem`）、`env/tokens.json`、`logs/` は、**今と同じく cwd からの相対パス**にする（パスの解決方法を変えるのはフェーズ 1 の D7）。
- 次の点は変えない: ポート（30000 / 3001 / 5000 / 1234）、エンドポイントとレスポンスの形、Socket.IO のイベント名と内容、CORS、プレイヤーデータを 5 秒で null に戻す処理、人数表示の Bot の動き、ログの出力内容と出力先。今の既知の不具合（C3・C4・C7・S3〜S7 など）も、このタスクでは直さない。
- `body-parser` を `express.json({ limit: '1mb' })` に置き換え、ダミーの `fs` パッケージを依存から外すのは可（挙動は同じ）。
- スクリプト（Windows の PowerShell でそのまま動くこと。D2）:
  - `dev`: NODE_ENV=development で `src/index.ts` を tsx（watch）で動かす
  - `build`: tsup で `dist/index.cjs` に出力する（自分のコードと `@svoice/shared` を同梱し、`node_modules` の依存は外部参照のままにする。フェーズ 4 で 1 つの実行ファイルにまとめるため、CommonJS で出力する）
  - `start`: NODE_ENV=production で `node dist/index.cjs`
  - `typecheck`: `tsc --noEmit`
  - `test`: `vitest run`
  - 環境変数の設定は `cross-env` で行う
- `backend/.env.example` を作る（キーの一覧と説明。値は空にする）。キーは `docs/MANUAL_TEST.md` の backend の表と同じ。

### 手動確認用スクリプト
- `backend/scripts/fake-game-server.js` は、TypeScript 化した後も同じコマンド引数と対話コマンドで動くようにする（tsx で動く `.ts` に変えてよい）。起動コマンドが変わる場合は、`docs/MANUAL_TEST.md` の該当箇所を直す。

### テスト（vitest、実際のモジュールを使う）
`backend/test/express.test.js` は削除し、次のテストに置き換える。**既知の不具合の挙動を、正しい仕様として固定するテストは書かない**（C3・C4・S3 など。フェーズ 2〜3 で変えるため）。
- **gameReceiver**（supertest）: 正しいデータで 200、形式違い（配列でない、フィールドが欠けている、`name` が空、要素が null）で 400。`GAME_API_SECRET` を設定した場合は、ヘッダーがないか値が違うと 401。最後のリクエストから 5 秒後に `getData()` が null になる（偽のタイマー）。
- **socketServer**（空いているポートで起動し、socket.io-client で接続）: `join` → `joined` で全体発言者の一覧が返る／`join` 後に `playerData` が届く／`onSpeaker` / `offSpeaker` → 全員に `setAdminSpeaker` が届く／`changeSetting` が全員に届く／`kick` が対象に届く／`exit` と切断で全体発言者から外れる／`debug` が差し替えたログフォルダーの `YYYY-MM-DD.jsonl` に 1 行追記される。
- **discordBot の内部 API**（supertest、ギルドとメンバーは偽物に差し替える）: `x-api-secret` がない／違うと 401。`id` が不正だと 400。`getUserName` はニックネームの `[...]` を返し、`[...]` がなければ 500。`checkJoinPass` は true / false を返し、`pass` が文字列でなければ 400。`getJoinRole` / `checkAdminRole` は真偽値を返す。`setJoinRole` / `setPhoneRole` はロールがなければ付与し、`removePhoneRole` はロールがあれば外す。
- **人数表示の Bot の番号計算**: 今の計算（人数が 20 以上なら 20、Bot の数を超えない）を、関数に切り出して確かめる。
- **@svoice/shared**: `frontend/settings/default.json` と `frontend/settings/setting.json` が `ingameSettingsSchema` を満たす。`PLAYER_DATA_FIELDS` と `PlayerData` 型の列挙が一致する。
- Discord への実際のログインとボイスチャンネルへの参加は、テストの対象外。

### frontend（このタスクでの扱い）
- `frontend/package.json` の `name` を `@svoice/frontend` にする。`frontend/` はソースを原則として変えない。
- pnpm の厳密な依存解決のせいでビルドが通らない場合（例: `frontend/server/api/*.ts` が直接依存にない `h3` を import している）に限り、依存の追加か、最小限のソースの修正を行ってよい。行った内容は RESULT に書く。

### 変更してよいファイル
- ルート: `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.node-version`、`.gitignore`、`.npmrc`（必要なら）
- `packages/shared/` 配下すべて
- `backend/` 配下すべて（`.env`、`env/`、`key/` は除く）
- `frontend/package.json`、`frontend/package-lock.json`（削除）、および上の「frontend の扱い」の範囲のソース
- `docs/MANUAL_TEST.md`（起動コマンドが変わる箇所のみ）
- 生成物: 各 `node_modules/`、`frontend/.nuxt/`、`frontend/.output/`、`backend/dist/`

### 完了条件（RESULT に実行コマンドと結果を含める）
- Node 24 で、ルートの `pnpm install` → `pnpm build` → `pnpm test` → `pnpm typecheck` がすべて通る（frontend の `typecheck` は次のタスクで追加するので、ここでは対象外でよい）。
- 起動スモーク: `backend` で `pnpm dev` を起動し、偽ゲームサーバーから送ったプレイヤーデータが、socket.io-client で接続して `join` したクライアントに届く（`.env` は一時的なテスト用の値で起動してよい。`JOIN_PASSWORD` / `API_SECRET` は環境変数で渡す。実際の `.env` は読まない・書かない）。Discord の Bot がなくてログインに失敗すること自体は問題にしない。
- `pnpm --filter @svoice/frontend build` が通る。
- 削除した旧テストの各項目が、新しいテストのどれで置き換わったか（または、なぜ落としたか）を RESULT に一覧で書く。
- Node 24 が使えない場合は、作業を止めずに Node 22 で確認し、そのことを RESULT に明記する。

## Discretion
- テストファイルの置き場所（`backend/src/**/*.test.ts` か `backend/test/`）と、テスト用ヘルパーの構成。
- backend の `tsconfig.json` の細かい設定（`strict: true` は必須）。
- 依存の差し替えに使う引数や型の名前と形。
- tsup / tsx / vitest / supertest / cross-env / zod / @types/* のバージョン（各最新の安定版。@types/node は 24 系）。
- `onlyBuiltDependencies` に列挙する依存（esbuild、sharp、@parcel/watcher など、ビルドに必要なもの）。
