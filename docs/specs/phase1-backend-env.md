# phase1-backend-env: backend の設定化・パス解決・Discord 機能の切り替え・偽ゲームサーバー

大改修フェーズ 1（`docs/OVERHAUL.md` §6）の 1 本目。対象は D4・D6・D7・D9（backend 側）。不変条件 I1〜I6（`docs/OVERHAUL.md` §1）を守る。
前提知識は `AGENTS.md` と `docs/DESIGN.md` にある。

## 背景
- フェーズ 0 で、backend は `backend/src/*.ts`（設定は `config.ts`）になった。ポートはコードに直書きされ、`.env`・`env/tokens.json`・`key/`・`logs/` は cwd からの相対パスで読んでいる。
- 本番と開発を同じ Windows 機で同時に動かしたい（Mark 5）。本番のポートは今のまま（I2）。
- 開発では Discord（Bot のログイン・人数表示・ロール操作）なしで動かしたい（D4。開発用ログインは frontend 側の `phase1-frontend-dev` で作る）。
- 偽ゲームサーバー `backend/scripts/fake-game-server.js` は対話専用で、一括起動（D8）に組み込めない。ユーザーが、実際の送信データを `tools/capture-player-data.mjs` で取得する予定（Q14）。

## Fixed

### 1. パスの解決（D7）
- **基準フォルダー**: backend パッケージのルート（`backend/`）。`src/` からでも `dist/` からでも、モジュールの場所から 1 つ上として求める。cwd には依存しない。
- `.env` は基準フォルダーから読み込む。環境変数 `ENV_FILE` が設定されていれば、そのファイルを代わりに読む（検証時に実際の `.env` を避けるため、およびフェーズ 4 の配布で使うため）。
- 設定項目のパスは、絶対パスならそのまま、相対パスなら基準フォルダーからの相対として解決する。
- 起動時に、解決した主要なパス（データフォルダー・証明書・tokens.json）を 1 回ずつログに出す。

### 2. 設定項目の追加（`config.ts`）
既定値はすべて**今の本番と同じ**にする（`.env` を変えなければ、本番の挙動は変わらない）。

| 環境変数 | 既定値 | 内容 |
|---|---|---|
| `GAME_RECEIVER_PORT` | 30000 | プレイヤーデータの受信 |
| `SOCKET_PORT` | 3001 | Socket.IO |
| `DISCORD_HTTP_PORT` | 5000 | 内部 API（http） |
| `DISCORD_TLS_PORT` | 1234 | 内部 API（development は http、それ以外は https） |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | `key/privkey.pem` / `key/fullchain.pem` | 証明書 |
| `DISCORD_TOKENS_PATH` | `env/tokens.json` | Bot のトークン |
| `DATA_DIR` | `.`（基準フォルダー） | 実行時データの置き場所。debug ログは `<DATA_DIR>/logs/` に書く（既定では今と同じ `backend/logs/`） |
| `DISCORD_ENABLED` | `true` | `false` で Discord 機能をすべて止める（下の 3） |
| `DISCORD_MEMBER_COUNT_ENABLED` | `true` | `false` で人数表示だけを止める（Bot のログインとロール操作は行う） |

- 真偽値は `true` / `false` の文字列だけを受け付け、それ以外は起動時のエラーにする。ポートは 1〜65535 の整数。
- 既存の `JOIN_PASSWORD` / `API_SECRET` の扱い（未設定なら今のメッセージで終了）は変えない。

### 3. Discord 機能の切り替え（D4）
- `DISCORD_ENABLED=false` のとき:
  - `tokens.json` を読まず、Bot のログインも人数表示もしない。
  - 内部 API（5000 / 1234）は今と同じように起動する。秘密キーと `id` の検証も今と同じ。
  - 各エンドポイントは Discord に問い合わせずに次を返す: `getJoinRole` → `true`、`checkAdminRole` → `false`、`setJoinRole` / `setPhoneRole` / `removePhoneRole` → `{ success: true }`（何もしない）、`getUserName` → 500（今の「ニックネーム不整合」と同じ応答）、`checkJoinPass` → 今と同じ（パスワードを照合する）。
  - 起動時に「Discord 機能は無効」と 1 行ログに出す。
- `DISCORD_MEMBER_COUNT_ENABLED=false` のとき: Bot はログインするが、ボイスチャンネルへの参加（人数表示）を一切行わない。
- 既定（どちらも `true`）の挙動は今と同じ。

### 4. `.env.example`
- `backend/.env.example` に上の項目を追加する。各項目に、本番では今の既定値のままにすることと、開発で同じ機械に本番が動いている場合の推奨値を書く。開発の推奨ポートは次のとおり（本番 + 100）:
  `GAME_RECEIVER_PORT=30100`、`SOCKET_PORT=3101`、`DISCORD_HTTP_PORT=5100`、`DISCORD_TLS_PORT=1334`、`DISCORD_ENABLED=false`

### 5. 偽ゲームサーバー（D9）
- `backend/scripts/fake-game-server.ts` に書き直す（tsx で実行する）。`backend/package.json` に `fake-game` スクリプトを追加する。
- 送信先は `GAME_RECEIVER_PORT` と同じ設定（`.env`）から決める（`FAKE_GAME_ENDPOINT` での上書きも今どおり可能）。`GAME_API_SECRET` を設定していれば今どおり送る。
- 今の対話コマンド（`d` / `sweep` / `set` / `stop` / `start` / `show` / `help` / `exit`）と挙動を保つ。
- 新しい起動オプション:
  - `--scenario <名前>`: 対話なしで動く。一括起動（D8）で使う。最低限、次を用意する:
    - `static`: 全員を同じ地点に置く
    - `sweep`: 2 人目以降と 1 人目の距離を 0〜40 で往復させる（今の `sweep` コマンドと同じ）
    - `walk`: 各プレイヤーが範囲内をランダムに歩く（乱数のシードを指定できる）
  - `--replay <ファイル>`: `tools/capture-player-data.mjs` が出力した `.jsonl` を読み、各行の `json`（なければ `rawBody`）を、記録された受信時刻の間隔で順に送る。最後まで送ったら先頭に戻る。ゲーマータグを差し替える `--rename 元の名前=新しい名前`（複数指定可）を付けられる。
  - `--no-interactive`: 標準入力を読まない（`--scenario` と `--replay` のときは自動で有効にする）。
- 純粋な部分（シナリオでの位置の計算、replay の行の読み取り、名前の差し替え、引数の解釈）は関数に分け、単体テストを書く。
- 旧ファイル `backend/scripts/fake-game-server.js` は削除する。

### 6. テスト
- 設定: 既定値が今の本番と同じ／ポートと真偽値の検証／相対パスが基準フォルダーから解決される（cwd を変えても同じ結果）。
- `DISCORD_ENABLED=false` の内部 API の応答（上の 3 の一覧）と、秘密キー・`id` の検証が引き続き行われること。
- `DISCORD_MEMBER_COUNT_ENABLED=false` で、ボイスチャンネルへの参加の関数が呼ばれないこと（Discord の部分は差し替える）。
- debug ログが `DATA_DIR/logs/` に書かれること。
- 偽ゲームサーバーの純粋な関数。

### 変更してよいファイル
- `backend/` 配下（`.env`、`env/`、`key/`、`logs/` は除く）
- `docs/MANUAL_TEST.md`（偽ゲームサーバーのコマンドと、開発用の設定の説明）
- `pnpm-lock.yaml`（依存の追加による更新）

### 完了条件（RESULT に実行コマンドと結果を含める）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` が通る。
- 起動スモーク（リポジトリ外の一時フォルダーで、ダミーの値を使う）:
  - **cwd を一時フォルダーにしたまま**、`DISCORD_ENABLED=false` と開発の推奨ポートで `backend/dist/index.cjs` を起動し、`tokens.json` がなくても起動すること
  - 30100 への POST → 3101 で `join` したクライアントに `playerData` が届くこと
  - 5100 の内部 API が上の 3 の応答を返すこと
  - 基準フォルダーの `.env` を読ませないため、このスモークでは `ENV_FILE` を一時フォルダーのダミーの `.env` に向ける
- `fake-game` の `--scenario sweep` と `--replay`（小さな偽の `.jsonl` を作って使う）で、受信側にデータが届くこと。

## Discretion
- 基準フォルダーの求め方の実装（`import.meta.url` / `__dirname` / tsup の設定など）。
- 設定のスキーマの書き方と、エラーメッセージの文言（短く、どのキーが悪いか分かること）。
- `walk` シナリオの細かい動き（速さ、範囲）。
- 偽ゲームサーバーのファイル分割。
- テスト内で `.env` の読み込みを差し替える方法。
