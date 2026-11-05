# ローカル手動確認手順

## 開発モード（Discord なし）

Node 24 と pnpm を使う。通話には SkyWay のアプリ ID とシークレットキーが必要。ルーム名は本番の `test` と分け、ヘッドホンを使う。

### 設定

`E:\dev\SyakasabaVC\backend\.env.example` と `E:\dev\SyakasabaVC\frontend\.env.example` を、それぞれ `.env.development` にコピーする。本番の `.env` は変更しない。

backend の開発用の値:

| キー | 値 |
|---|---|
| `JOIN_PASSWORD` | 開発用の参加パスワード |
| `API_SECRET` | frontend の `NUXT_API_SECRET` と同じ開発用の文字列 |
| `SERVER_URL` | `http://localhost:3100` |
| `GAME_RECEIVER_PORT` / `SOCKET_PORT` | `30100` / `3101` |
| `DISCORD_HTTP_PORT` / `DISCORD_TLS_PORT` | `5100` / `1334` |
| `DATA_DIR` | `data/dev` |
| `DISCORD_ENABLED` | `false` |

frontend の開発用の値:

| キー | 値 |
|---|---|
| `NUXT_APP_SECRET` | 32 文字以上のセッション暗号化キー |
| `NUXT_SKYWAY_APP_ID` / `NUXT_SKYWAY_SECRET_KEY` | SkyWay の値（本番と同じアプリも使用可） |
| `NUXT_API_SECRET` | backend の `API_SECRET` と同じ値 |
| `NUXT_PORT` | `3100` |
| `NUXT_PUBLIC_SERVER_SOCKET_URL` | `http://localhost:3101` |
| `NUXT_PUBLIC_SERVER_API_URL` | `http://localhost:5100` |
| `NUXT_PUBLIC_SKYWAY_ROOM_NAME` | `dev-自分の名前` |
| `NUXT_DEV_LOGIN_ENABLED` | `true` |
| `NUXT_PUBLIC_DEV_LOGIN_PRESETS` | `Alice,Bob` |
| `NUXT_DATA_DIR` | `data/dev` |

暗号化キーの生成:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Discord OAuth の値はこのモードでは不要。既存の必須設定チェックは未設定のキー名をログに出す。距離設定は初回に旧 `E:\dev\SyakasabaVC\frontend\settings\setting.json`（なければ `E:\dev\SyakasabaVC\frontend\settings\default.json`）から `E:\dev\SyakasabaVC\frontend\data\dev\setting.json` へコピーされる。以降の変更はデータフォルダーに保存される。

### 起動とログイン

```powershell
cd E:\dev\SyakasabaVC
pnpm dev
```

`backend\.env.development` と `frontend\.env.development` があれば自動で使う。ないほうは本番用の `.env` を読み、その旨を警告として表示する（ポートも本番の値になる）。別のファイルを使うときは `$env:ENV_FILE`（backend）と `$env:FRONTEND_ENV_FILE`（frontend）にフルパスを設定する。プレイヤー名を変えるときは `$env:DEV_PLAYERS = 'Alice,Bob,Carol'`。

backend・frontend・偽ゲームサーバーが名前と色付きのログで起動する。`DEV_PLAYERS` は偽ゲームサーバーのタグと開発用ログインのプリセットに共通で使われる（既定 `Alice,Bob`）。`sweep` で距離 0〜40 を往復する。1 つが異常終了しても残りは動き、Ctrl+C でまとめて止まる。

http://localhost:3100 を、別のブラウザプロファイルと InPrivate ウィンドウで開く。cookie を分けるため、同じプロファイルのタブだけでは 2 ユーザーにならない。「開発用ログイン」でそれぞれ Alice、Bob を選ぶ。管理者機能の確認時は、片方の「管理者」を ON にしてからログインする。開発用ログインは `nuxt dev` と `NUXT_DEV_LOGIN_ENABLED=true` の両方が必要で、本番ビルドでは使えない。

### 偽ゲームサーバーを対話操作する場合

一括起動を Ctrl+C で止め、別々の PowerShell で次を実行する。各ウィンドウに上と同じ `ENV_FILE`、frontend には `FRONTEND_ENV_FILE` を設定する。

```powershell
cd E:\dev\SyakasabaVC
pnpm --filter @svoice/backend dev
pnpm --filter @svoice/frontend dev
pnpm --filter @svoice/backend fake-game Alice Bob
```

最後のコマンドが対話モード。`d <距離>`、`sweep`、`set <番号|all> <項目> <値>`、`stop` / `start`、`show`、`help` が使える。#0 が Alice、#1 が Bob。対話モードと一括起動の偽ゲームサーバーを同時に動かさない。

`set` の入れ子はドット区切り（`location.server`、`location.dimension`、`location.coordinates.x`、`transceiver.type` / `.number`、`radio.type` / `.number`、`voiceOptions.rangeOutput` / `.volumeOutput` / `.rangeInput` / `.volumeInput`）。`music`、`mute`、`telephone`、`hasTelephone`、`useMegaphone`、`useMicrophone` は最上位のまま。旧形式の項目名は使えない。

シナリオ・記録の再生（各行を単独で実行）:

```powershell
pnpm --filter @svoice/backend fake-game --scenario static Alice Bob
pnpm --filter @svoice/backend fake-game --scenario sweep Alice Bob
pnpm --filter @svoice/backend fake-game --scenario walk --seed 42 Alice Bob
pnpm --filter @svoice/backend fake-game --replay 'E:\captures\capture.jsonl' --rename '記録のタグ1=Alice' --rename '記録のタグ2=Bob'
```

`static` は同じ地点、`walk` は seed で再現できるランダム移動。`--replay` は `E:\dev\SyakasabaVC\tools\capture-player-data.mjs` の `.jsonl` を受信時刻の間隔で繰り返す。記録は新形式のプレイヤー配列を含むものを使う。旧形式のプレイヤーは backend で除外される。`--scenario` / `--replay` は標準入力を読まない。

## voice-lab（Web 操作と読み上げボット）

通常の `pnpm dev` を停止した状態で起動する。偽ゲームサーバーと voice-lab は同時に使わない。

```powershell
cd E:\dev\SyakasabaVC
pnpm dev:lab
```

操作画面は http://127.0.0.1:3110/ 。アプリは http://localhost:3100/ で、開発用ログインから Alice または Bob で参加する。操作画面の「聞き手」に同じ名前を選ぶ。Bot1〜Bot3 はヘッドレス Chromium で参加し、名前の読み上げを繰り返す。読み上げを生成できない場合は合成音声に切り替わり、操作画面とコンソールに表示する。

「状態の編集」で `PlayerData` の名前以外の全項目を変更できる。選択項目の「数値」で任意の有限数に切り替えられる。「送信に含める」を外すとその人だけゲーム外。「送信 ON/OFF」を OFF にすると、アプリでは約 5 秒後に全員がゲーム外になる。判定の表は操作した送信対象から計算するため、OFF の直後からゲーム外の予想になる。

ボットのマイクは常時送信し、ゲームの `mute` 指示でもミュートを解除する。「全体発言」はサーバー・距離などの条件によらず聞こえる。ボットの切断時は「再起動」で参加し直す。行の追加・削除でボットと聞き手を増減できる。実際の音量は、アプリ側の相手ごとの音量と出力音量でも変わる。

既定の聞き手は `DEV_PLAYERS=Alice,Bob`、ボットは `LAB_BOTS=Bot1,Bot2,Bot3`。操作画面のポートは `VOICE_LAB_PORT`（既定 3110）。`pnpm dev` と同様に `.env.development` を使う。Ctrl+C でサーバーとボットを終了する。

backend と frontend だけが起動済みの場合の単体起動:

```powershell
cd E:\dev\SyakasabaVC
$env:ENV_FILE = 'E:\dev\SyakasabaVC\backend\.env.development'
pnpm --filter @svoice/backend voice-lab --bots Bot1,Bot2 --listeners Alice,Bob
```

実装は `E:\dev\SyakasabaVC\backend\scripts\voice-lab.ts` と `E:\dev\SyakasabaVC\backend\scripts\voiceLab\`。開発用ログインが無効の場合、ボットの状態は「開発用ログイン無効」になる。

## 実際の Discord を使うモード

上の開発用ポートとルーム名を使い、次の設定を追加する。Discord のロールの付与・解除は実際に行われる。

- backend: `DISCORD_ENABLED=true`、`DISCORD_SERVER_ID`、`DISCORD_SERVER_ROOM_ID`、`DISCORD_SERVER_ROLE_ID_ADMIN` / `_PHONE` / `_JOIN` を設定する。人数表示を止める場合は `DISCORD_MEMBER_COUNT_ENABLED=false`。
- `E:\dev\SyakasabaVC\backend\env\tokens.json` に `{ "tokens": ["Botトークン1", "Botトークン2"] }` を用意する。パスは `DISCORD_TOKENS_PATH` でも指定可能。人数表示を確認する場合、2 人なら 3 個以上の Bot が必要。
- frontend: `NUXT_DEV_LOGIN_ENABLED=false` にし、`NUXT_OAUTH_DISCORD_CLIENT_ID`、`NUXT_OAUTH_DISCORD_CLIENT_SECRET`、`NUXT_OAUTH_DISCORD_REDIRECT_URL=http://localhost:3100/auth/discord` を設定する。
- Discord Developer Portal の OAuth2 → Redirects に `http://localhost:3100/auth/discord` を登録する。
- Discord アカウントを 2 つ使い、両者のサーバーニックネームに `[Alice]` / `[Bob]` を含める。片方に ADMIN ロールを付ける。

開発用ログインを有効のままにした場合、開発用ログインの人は Discord のロール操作の対象外（参加ロールあり扱い、電話ロールは付け外ししない）。

同じ `pnpm dev` で起動し、通常の「ログイン」から Discord OAuth を通す。参加ロールがない場合は参加パスワードを入力する。証明書は development では不要。backend のパスは `E:\dev\SyakasabaVC\backend\` 基準、frontend の相対 `NUXT_DATA_DIR` は `E:\dev\SyakasabaVC\frontend\` 基準。

## E2E

開発用の設定を用意し、通常の `pnpm dev` を停止してから、偽ゲームサーバーを含まない開発サーバーを起動する。

```powershell
cd E:\dev\SyakasabaVC
pnpm dev:e2e
```

別の PowerShell で実行する。

```powershell
cd E:\dev\SyakasabaVC
pnpm e2e
```

`E:\dev\SyakasabaVC\e2e\voice.spec.ts` が、導入済み Chromium の疑似マイクと実際の開発用 SkyWay ルームを使う。疑似マイクには `E:\dev\SyakasabaVC\e2e\fixtures\microphone.wav` の合成音声を流す。ゲームデータはテスト自身が送信する。通常の偽ゲームサーバーを同時に動かさない。参加・音量・ミュート・設定権限・待機中の全体発言・キック・再参加の後始末・参加ロック・診断ログ保存・参加失敗の表示を確認する。変更した距離設定は終了時に元へ戻す。Discord OAuth と実際のロール変更は手動確認が必要。

結果は `E:\dev\SyakasabaVC\e2e\.report.json`、失敗時の情報は `E:\dev\SyakasabaVC\e2e\.results\` に保存する。終了後は `pnpm dev:e2e` を Ctrl+C で停止する。

## 診断ログの閲覧

設定の「一般」→「デバッグ用 送信」で、音声の状態・相手ごとの購読と gain・直近の警告とエラーを backend の `DATA_DIR/logs/` に保存する。

```powershell
cd E:\dev\SyakasabaVC
pnpm --filter @svoice/backend debug-log --tag Alice --date 2026-11-03
```

`--tag` と `--date` は省略可能。開発用ログを読む場合は、実行前に `$env:ENV_FILE = 'E:\dev\SyakasabaVC\backend\.env.development'` を指定する。

## 確認項目

### 接続

- [ ] 未ログイン時に、開発モードだけ「開発用ログイン」が表示される
- [ ] ログイン後にゲーマータグが表示され、Discord モードでは参加パスワードで参加認証できる
- [ ] 「参加」でマイク使用が許可され、通話に参加できる
- [ ] ゲームデータ受信中は「参加中」、対話モードの `stop` から 5 秒ほどで「待機中」、`start` で再び「参加中」になる
- [ ] 2 人目が参加すると、両者の「全てのプレイヤー」に相手が表示される

### 距離による音量

既定の一般設定は min 5、max 20、最小音量 0。以下は対話モードで確認する。

- [ ] `d 3`: はっきり聞こえ、「近くのプレイヤー」に表示され、発話中のアイコンが緑になる
- [ ] `d 12`: 小さく聞こえる
- [ ] `d 25`: 聞こえなくなり、「近くのプレイヤー」から消える
- [ ] `sweep`: 音量が滑らかに変わり、一覧への出入りが繰り返される
- [ ] `set 1 useMegaphone 1` → `d 25`: 聞こえる。`set 1 useMegaphone 0` で戻す
- [ ] `set 1 location.dimension 1` → `d 3`: 聞こえない。`set 1 location.dimension 0` で戻す
- [ ] `set all telephone 1` → `d 100`: 通話中なので聞こえる。`set all telephone 0` で戻す
- [ ] `set 1 location.server 2` → `d 0`: 聞こえない。同じ電話番号でも聞こえず、全体発言は聞こえる。`set all telephone 0` と `set 1 location.server 1` で戻す
- [ ] `set 0 music 2` と `set 1 music 1`: Alice には Bob の声が聞こえない。Bob の全体発言は聞こえる。`set all music 0` で戻す
- [ ] `set all radio.number 5`、`set 0 radio.type 0`、`set 1 radio.type 1` → `d 1000`: Alice にだけ Bob の声が聞こえる。両者を type 1 にすると聞こえない。`set all radio.type 2` で戻す
- [ ] `set all location.dimension -1` → `d 0`: 両者とも聞こえない。`set all location.dimension 0` で戻す
- [ ] 相手の音量スライダーが効き、再読み込み後も値が残る

### 自分の操作

- [ ] ミュート／解除で効果音が鳴り、相手に聞こえるかが切り替わる
- [ ] ノイズ抑制の ON／OFF ができる
- [ ] 設定 → サウンドのマイクテストでインジケーターと返り音声、入力音量・出力音量が動く
- [ ] `set 0 mute 2` でミュート、`set 0 mute 3` で解除される
- [ ] Discord モード: `set 0 hasTelephone 1` でスマホロールが付き、`set 0 hasTelephone 0` で外れる
- [ ] 退出 → 再参加後も一覧や音声が動く

### 管理者

- [ ] 全体発言 ON では `d 100` でも聞こえ、OFF では聞こえなくなる
- [ ] 相手のタグ → キックで相手が退出する
- [ ] インゲーム設定の「変更確定」が相手にも反映され、「デフォルトに戻す」が効く
- [ ] 開発データフォルダーの `setting.json` だけが更新され、ソースの設定ファイルは変わらない
- [ ] 参加パスワードを間違えると残り回数が表示され、5 回連続の失敗で「ロックされています。運営に連絡してください。」になる
- [ ] 管理者の設定 →「参加ロック」にゲーマータグとロック日時が表示され、「解除」で再び参加認証できる
- [ ] 一般ユーザーに「参加ロック」タブが表示されず、`/api/admin/joinLocks` と `/api/admin/unlockJoin` は 403 になる
- [ ] 退出 → 再参加後も Socket の各リスナーとデバッグ送信が重複しない

### Discord の人数表示

- [ ] Discord モードで人数表示を有効にした場合、10 秒以内に人数に応じて Bot が入れ替わる

### 音声・接続の回帰確認

- [ ] V1: ミュート中に入力音量を動かしても、相手に声が聞こえない
- [ ] V2: 距離内で受信が切れた場合に再購読し、同じタグの再配信後も一覧が重複しない
- [ ] C2: 退出 → 再参加を繰り返した後のキックで処理が重複しない
- [ ] C7: 人数表示 Bot が一度もボイスチャンネルに入らないことがあるか

## 片付け

Ctrl+C で終了する。距離設定は必要なら UI で初期値へ戻す。Discord モードで付いたテスト用のロールは必要に応じて外す。
