# Windows 本番配布

Node SEA と WinSW 2.x を使う。配布先の例は `C:\svoice\`。Node・pnpm・ソースは本番機に不要。

## ビルド（開発機）

Windows x64・Node 24・pnpm で、リポジトリのルートから実行する。

```powershell
Set-Location E:\dev\SyakasabaVC
pnpm install --frozen-lockfile
pnpm package
pnpm package:smoke
```

`E:\dev\SyakasabaVC\release\svoice\` の `svoice.exe`・`svoice-service.xml`・`app.env.example`・`VERSION.txt` を配布する。中間ファイルと smoke のダミー設定・ログは別のフォルダーに保存する。smoke は開発用の 5 ポートを使うため、開発サーバーを停止して実行する。

## 初回配置

配布物を `C:\svoice\` にコピーする。

```powershell
Set-Location C:\svoice
Copy-Item .\app.env.example .\app.env
notepad .\app.env
```

`app.env` の空欄を埋める。既定値を使う項目は行を削除できる。相対パスの基準は常に exe のフォルダー。`ENV_FILE` で設定ファイルを変えた場合も同じ。

| 項目 | 本番の設定 |
|---|---|
| `NODE_ENV` | `production`（未指定時の既定） |
| `API_SECRET` / `NUXT_API_SECRET` | 同じ十分に長いランダム値。両方必須 |
| `JOIN_PASSWORD` | 参加パスワード。必須 |
| `NUXT_APP_SECRET` | 32 文字以上のランダム値。必須 |
| `SERVER_URL` | 公開する frontend の origin（例 `https://voice.example:3000`） |
| `NUXT_PUBLIC_SERVER_SOCKET_URL` | 公開する Socket.IO（例 `https://voice.example:3001`） |
| `NUXT_PUBLIC_SERVER_API_URL` | `http://127.0.0.1:5000` |
| `NUXT_SKYWAY_APP_ID` / `NUXT_SKYWAY_SECRET_KEY` | SkyWay の認証情報 |
| `NUXT_PUBLIC_SKYWAY_ROOM_NAME` | 本番のルーム名 |
| `NUXT_OAUTH_DISCORD_CLIENT_ID` / `NUXT_OAUTH_DISCORD_CLIENT_SECRET` | Discord OAuth の認証情報 |
| `NUXT_OAUTH_DISCORD_REDIRECT_URL` | `https://voice.example:3000/auth/discord`。Discord Developer Portal の Redirects に同じ URL を登録 |
| `DISCORD_ENABLED` / `DISCORD_MEMBER_COUNT_ENABLED` | `true` |
| `DISCORD_SERVER_ID` / `DISCORD_SERVER_ROOM_ID` | Discord サーバー・人数表示用ボイスチャンネルの ID |
| `DISCORD_SERVER_ROLE_ID_ADMIN` / `DISCORD_SERVER_ROLE_ID_PHONE` / `DISCORD_SERVER_ROLE_ID_JOIN` | 各ロールの ID |
| `GAME_ALLOWED_IPS` | ゲームサーバーの IP。ローカルなら `127.0.0.1,::1,::ffff:127.0.0.1` |
| `INTERNAL_API_ALLOWED_IPS` | 同じローカル IP の一覧。別マシンの frontend が必要なときだけ追加 |
| `DATA_DIR` / `NUXT_DATA_DIR` | `data/backend` / `data/frontend` |
| `DISCORD_TOKENS_PATH` | `tokens.json` |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | 下記の PEM ファイル |

本番の既定ポートは frontend 3000、Socket.IO 3001、ゲーム受信 30000、内部 API 5000 / 1234。変更しない場合は各ポートの行を削除する。`GAME_API_SECRET` は送信側が対応するときだけ設定する。

`C:\svoice\tokens.json` は `{ "tokens": ["Bot のトークン"] }` の形で用意する。Bot の権限・Privileged Gateway Intents は既存の運用とそろえる。設定・トークン・証明書は外部公開せず、サービスアカウントに読取権限を与える。`C:\svoice\data\` と `C:\svoice\settings\` には書込権限が必要。

`DATA_DIR` の読取・書込権限はサービスのアカウントと管理者に限定する。起動時に作られる `stop.token` は停止用の認証情報で、正常終了時に削除される。

WinSW は同梱しない。[公式 Releases の 2.x 最新版（確認時 v2.12.0）](https://github.com/winsw/winsw/releases/tag/v2.12.0) の **`WinSW-x64.exe`** を取得し、`C:\svoice\svoice-service.exe` に改名する。ランタイム同梱版のため .NET の別途導入は不要。`WinSW.NET461.exe` は既存の .NET Framework を使う配布で、ここでは使用しない。

管理者 PowerShell で登録・開始する。

```powershell
Set-Location C:\svoice
.\svoice-service.exe install
.\svoice-service.exe start
.\svoice-service.exe status
```

自動起動、異常終了の 10 秒後の再起動、停止コマンド `svoice.exe --stop` と 15 秒の待機を XML で指定している。停止は認証付きの名前付きパイプで伝え、exe の終了まで待つ。[WinSW 2.x 設定](https://github.com/winsw/winsw/blob/v2/doc/xmlConfigFile.md)

サービスを使わず起動した場合も、同じ Windows アカウントから `C:\svoice\svoice.exe --stop` で停止できる。別のアカウントや別フォルダーの exe は対象外。15 秒で終了しなければ停止コマンドは失敗する。Ctrl+C の処理も利用できるが、届くかどうかは実行環境による。

## 証明書

win-acme で公開ドメインの証明書を取得し、PemFiles store の出力先を `C:\svoice\certs\` にする。例: `--store pemfiles --pemfilespath C:\svoice\certs\`。[PemFiles 公式](https://www.win-acme.com/reference/plugins/store/pemfiles)

`app.env` に次を指定する。秘密鍵はパスワードなしの PEM を使う。

```dotenv
TLS_KEY_PATH=certs/voice.example-key.pem
TLS_CERT_PATH=certs/voice.example-chain.pem
```

win-acme の更新タスクが同じパスに出力すると、アプリは約 1 秒で読み直す。再起動不要。鍵・証明書が一時的に不整合なら直前の証明書を保持する。

## ファイアウォール

外部から許可する TCP ポートは **3000 / 3001**。HTTP-01 で証明書を取得する場合だけ **80** も許可する。**30000 / 5000 / 1234 はインターネットに公開しない**。ゲームサーバーが別マシンなら 30000 はその IP だけ許可し、`GAME_ALLOWED_IPS` も合わせる。

## 更新と復旧

新しい配布物を `C:\svoice-update\` に配置する。最初に `VERSION.txt` のハッシュを照合する。

```powershell
Set-Location C:\svoice-update
$expectedHash = ((Get-Content .\VERSION.txt | Where-Object { $_ -like 'SHA256=*' }) -replace '^SHA256=', '').Trim()
if ((Get-FileHash .\svoice.exe -Algorithm SHA256).Hash -ne $expectedHash) { throw 'SHA-256 不一致' }
Set-Location C:\svoice
.\svoice-service.exe stop
Copy-Item .\svoice.exe .\svoice.previous.exe -Force
Copy-Item .\VERSION.txt .\VERSION.previous.txt -Force
Copy-Item C:\svoice-update\svoice.exe .\svoice.exe -Force
Copy-Item C:\svoice-update\VERSION.txt .\VERSION.txt -Force
.\svoice-service.exe start
```

通常の更新では exe と `VERSION.txt` だけを差し替える。設定・データ・証明書・WinSW は保持する。問題があれば停止し、退避したファイルへ戻す。

```powershell
.\svoice-service.exe stop
Copy-Item .\svoice.previous.exe .\svoice.exe -Force
Copy-Item .\VERSION.previous.txt .\VERSION.txt -Force
.\svoice-service.exe start
```

## 旧本番からの移行

旧 Ubuntu 側の pm2 を停止し、最新の距離設定 `setting.json` を `C:\svoice\data\frontend\setting.json`、参加ロック `join-locks.json` を `C:\svoice\data\backend\join-locks.json` にコピーする。設定したデータフォルダーが異なる場合はその場所へ置く。サービスを初めて開始する前に配置する。ファイルがなければ距離設定は既定値から初期化される。

## 確認

```powershell
Set-Location C:\svoice
.\svoice-service.exe status
Get-Content .\data\service-logs\svoice-service.out.log -Tail 50
Get-Content .\data\service-logs\svoice-service.err.log -Tail 50
Invoke-WebRequest https://voice.example:3000/ -UseBasicParsing
Invoke-RestMethod https://voice.example:3000/api/getSetting
```

stdout / stderr は各 10 MB・8 世代でローテーションする。[WinSW ログ設定](https://github.com/winsw/winsw/blob/v2/doc/loggingAndErrorReporting.md)

初回は実際の Discord ログイン・ロール操作・人数表示、2 人の SkyWay 通話、サービス停止、異常時の再起動、PC 再起動後の起動を確認する。
