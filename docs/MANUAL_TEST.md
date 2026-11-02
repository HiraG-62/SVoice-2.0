# ローカル手動確認手順

backend・frontend・偽ゲームサーバーを手元で動かし、ログインから通話まで確認する。

## 事前に知っておくこと

- **SkyWay のルーム名が `test` に固定されている。** 本番と同じ SkyWay アプリ ID を使うと、テスト参加者が本番のルームに入り、本番の参加者の「全てのプレイヤー」一覧に表示される。開発用の SkyWay アプリを使うか、本番を使っていない時間に確認する。
- **`DISCORD_ENABLED=true` のとき、Discord への操作は本物になる。** 参加ロールとスマホロールが実際に付与・解除される。`DISCORD_MEMBER_COUNT_ENABLED=false` で人数表示だけを止められる。
- 「インゲーム」設定の「変更確定」を押すと、`frontend/settings/setting.json`（git 管理下）が書き換わる。確認後に元へ戻す。
- 通話の確認には、**Discord アカウントが 2 つ**必要になる（2 人で行うか、1 台の PC で 2 つのブラウザを使う）。どちらのアカウントも、サーバーのニックネームに `[ゲーマータグ]` を含めておく。1 台で行うときはハウリングを防ぐためにヘッドホンを使う。
- 管理者機能（全体発言・キック・インゲーム設定）を確認するには、片方のアカウントに ADMIN ロールが必要。

## 1. 準備

### Discord Developer Portal
- OAuth2 → Redirects に `http://localhost:3000/auth/discord` を追加する。

### backend
- `backend/.env` に次のキーを設定する。既存の古い `.env` には `DISCORD_SERVER_ROLE_ID_JOIN`、`JOIN_PASSWORD`、`API_SECRET` がないので追加する（`DISCORD_BOT_TOKEN` は今のコードでは使われていない）。

| キー | 値 |
|---|---|
| `SERVER_URL` | `http://localhost:3000`（CORS の許可元） |
| `DISCORD_SERVER_ID` / `DISCORD_SERVER_ROOM_ID` | サーバー ID／人数表示用ボイスチャンネル ID |
| `DISCORD_SERVER_ROLE_ID_ADMIN` / `_PHONE` / `_JOIN` | 管理者／スマホ／参加のロール ID |
| `JOIN_PASSWORD` | 参加パスワード（必須） |
| `API_SECRET` | 任意の長い文字列（必須）。frontend の `NUXT_API_SECRET` と同じ値 |
| `GAME_API_SECRET` | 任意。設定すると偽ゲームサーバーも自動で同じ値を送る |
| `GAME_RECEIVER_PORT` / `SOCKET_PORT` | 同じ機械で本番も動く場合は `30100` / `3101` |
| `DISCORD_HTTP_PORT` / `DISCORD_TLS_PORT` | 同じ機械で本番も動く場合は `5100` / `1334` |
| `DATA_DIR` | 開発は `data/dev`。debug ログは `backend/data/dev/logs/` |
| `DISCORD_ENABLED` | 開発は `false`。Bot トークン不要。Discord OAuth には別途開発用ログインが必要 |
| `DISCORD_MEMBER_COUNT_ENABLED` | Bot のロール操作だけ確認するときは `false` |

- `.env` と相対パスは `backend/` 基準。既存の本番用 `.env` と分ける場合は、`backend/.env.example` を開発用ファイルにコピーし、起動前に `$env:ENV_FILE = 'E:\dev\SyakasabaVC\backend\.env.development'` を設定する。偽ゲームサーバーの PowerShell にも同じ `ENV_FILE` を設定する。
- `TLS_KEY_PATH` / `TLS_CERT_PATH` / `DISCORD_TOKENS_PATH` でファイルの場所を指定できる。`pnpm dev` では証明書を読まない。
- Discord の動作を確認する場合だけ `DISCORD_ENABLED=true` にし、`backend/env/tokens.json` を作る: `{ "tokens": ["Botトークン1", "Botトークン2", ...] }`
  - 人数表示では、参加人数と同じ番号の Bot がボイスチャンネルに入る（上限 20）。2 人で確認するなら 3 個以上あると表示を確認できる。最低 1 個は必要。

### frontend
- `frontend/.env` に次のキーを設定する。既存の `.env` には `NUXT_APP_SECRET`、`NUXT_SKYWAY_APP_ID`、`NUXT_SKYWAY_SECRET_KEY`、`NUXT_API_SECRET` がないので追加する（`NUXT_SESSION_PASSWORD` は使われなくなった）。

| キー | 値 |
|---|---|
| `NUXT_APP_SECRET` | セッション暗号化キー（必須。未設定だと全ページが 500）。下のコマンドで生成する |
| `NUXT_SKYWAY_APP_ID` / `NUXT_SKYWAY_SECRET_KEY` | SkyWay のアプリ ID／シークレットキー |
| `NUXT_API_SECRET` | backend の `API_SECRET` と同じ値 |
| `NUXT_PUBLIC_SERVER_SOCKET_URL` | `http://localhost:3001` |
| `NUXT_PUBLIC_SERVER_API_URL` | `http://localhost:5000` |
| `NUXT_OAUTH_DISCORD_CLIENT_ID` / `_CLIENT_SECRET` | Discord アプリの値 |
| `NUXT_OAUTH_DISCORD_REDIRECT_URL` | `http://localhost:3000/auth/discord` |

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

## 2. 起動（PowerShell を 3 つ開く）

```powershell
# 1: backend
cd E:\dev\SyakasabaVC\backend
pnpm dev
```
主要パスと設定したポートがログに出れば OK。開発の推奨値では `Express server running on port 30100`、`WebSocket server running on port 3101`、`Discord 機能は無効`、`Discord server running on port 5100` が出る。frontend の接続先も同じポートに合わせる。

```powershell
# 2: frontend
cd E:\dev\SyakasabaVC\frontend
pnpm dev
```
http://localhost:3000 を開く。

```powershell
# 3: 偽ゲームサーバー（引数はゲーマータグ。#0 = 自分、#1 以降 = 相手）
cd E:\dev\SyakasabaVC\backend
pnpm fake-game "自分のタグ" "相手のタグ"
```
コマンドは `help` で表示される（`d <距離>`、`sweep`、`set <番号|all> <項目> <値>`、`stop`／`start`、`show`）。

対話なしのシナリオと記録の再生:

```powershell
pnpm fake-game --scenario static "自分のタグ" "相手のタグ"
pnpm fake-game --scenario sweep "自分のタグ" "相手のタグ"
pnpm fake-game --scenario walk --seed 42 "自分のタグ" "相手のタグ"
pnpm fake-game --replay "E:\captures\capture.jsonl" --rename "記録のタグ1=自分のタグ" --rename "記録のタグ2=相手のタグ"
```

`static` は同じ地点、`sweep` は距離 0〜40 の往復、`walk` は seed で再現できるランダム移動。`--replay` は `tools/capture-player-data.mjs` の `.jsonl` を受信時刻の間隔で繰り返す。`--scenario` / `--replay` は標準入力を読まない。移動なしで送信だけ行う場合は `--no-interactive` を付ける。送信先は `GAME_RECEIVER_PORT`、個別に変える場合は `FAKE_GAME_ENDPOINT` を設定する。

## 3. 確認項目

### ログイン・参加認証
- [ ] 「ログイン」→ Discord の認可画面 → 戻ってくると、ヘッダーに `[...]` の中身がゲーマータグとして表示される
- [ ] ニックネームに `[...]` がないアカウントでは「Discordサーバーのニックネーム設定に不備があります。」が表示される
- [ ] 参加ロールがない状態では「参加認証」画面が出る。正しいパスワードを入れると Discord で参加ロールが付き、画面が切り替わる
- [ ] 間違ったパスワードでは画面が切り替わらない

### 参加・状態表示
- [ ] 「参加」→ ステータスが「待機中」になる（偽ゲームサーバーを止めている場合）
- [ ] 偽ゲームサーバーを起動すると「参加中」になる。`stop` から 5 秒ほどで「待機中」に戻り、`start` で再び「参加中」になる
- [ ] 2 人目が参加すると、両者の「全てのプレイヤー」に相手が表示される

### 距離による音量（2 人が参加し、偽ゲームサーバーに両方のタグを渡す）
既定の設定は一般で min 5、max 20、最小音量 0。
- [ ] `d 3`: 相手の声がはっきり聞こえ、「近くのプレイヤー」に表示される。話すとアイコンが緑になる
- [ ] `d 12`: 小さく聞こえる
- [ ] `d 25`: 聞こえなくなり、「近くのプレイヤー」から消える
- [ ] `sweep`: 距離に応じて音量が滑らかに変わり、一覧への出入りが繰り返される
- [ ] `set 1 useMegaphone 1` → `d 25`: 聞こえる（メガホンは max 30）。`set 1 useMegaphone 0` で戻す
- [ ] `set 1 dimension 1` → `d 3`: 聞こえない。`set 1 dimension 0` で戻す
- [ ] `set all telephone 1` → `d 100`: 通話中なので距離に関係なく聞こえる。`set all telephone 0` で戻す
- [ ] 「近くのプレイヤー」の音量スライダーで相手の音量が変わる。再読み込みしても値が残る

### 自分の操作
- [ ] マイクボタンでミュート／解除できる（効果音が鳴り、相手には聞こえなくなる）
- [ ] ノイズ抑制の ON／OFF ができる
- [ ] 設定 → サウンド: マイクテストでインジケーターが動き、自分の声が返ってくる。入力音量と出力音量が効く
- [ ] `set 0 mute 2`: ゲームからのミュート指示でミュートになる。`set 0 mute 3` で解除される
- [ ] `set 0 hasTelephone 1`: Discord でスマホロールが付く。`set 0 hasTelephone 0` で外れる
- [ ] 退出 → 再参加ができる。再参加後も一覧や音声がおかしくない

### 管理者（ADMIN ロールのアカウント）
- [ ] 全体発言を ON にすると、`d 100` でも相手に聞こえる。OFF に戻すと聞こえなくなる
- [ ] 相手のタグをクリック → キック → 相手が退出状態になる
- [ ] 設定 → インゲームで値を変えて「変更確定」→ 相手側にも反映され、距離の判定が変わる。「デフォルトに戻す」が効く
- [ ] 確認後に設定を戻す: `git checkout -- frontend/settings/setting.json`

### Discord の人数表示
- [ ] 偽ゲームサーバーの人数に応じて、10 秒以内にボイスチャンネル内の Bot が入れ替わる

### 既知の問題の再現（docs/DESIGN.md「既知の問題」）
- [ ] ミュート中に、設定 → サウンドで入力音量を動かすと、相手に声が聞こえてしまうか
- [ ] 退出 → 再参加を数回繰り返した後にキックされると、退出処理が重複して動くか（コンソールのエラー）
- [ ] backend 起動後、人数表示の Bot が一度もボイスチャンネルに入らないことがあるか

## 片付け
- `frontend/settings/setting.json` を元に戻す
- 必要なら Discord で、テストで付いたロールを外す
