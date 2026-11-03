# Windows 向け配布方式の試作

対象: D10 / Q13。**推奨は Node SEA＋WinSW**。既存の Node 24 の動作を保ち、アプリと静的ファイルを 1 個の exe の置換で更新できるため。本番方式は未決定。

## 実測結果

2026-11-03、Windows x64、Node 24.22.1、pnpm 10.14.0、Bun 1.3.11。既存の frontend / backend のビルド結果を esbuild 0.28.2 で統合。C も同じバンドルと Node を使い、実行形式による違いを比較した。
通常の `pnpm build` は別途約 25 秒。下表の時間は、その後のパッケージ生成のみ。SEA の postject 初回取得時間は含まない。

| 確認項目 | A: Node SEA | B: Bun compile | C: フォルダー＋Node |
|---|---|---|---|
| 生成 | 成功、12.53 秒 | 成功、2.59 秒 | 成功、0.66 秒 |
| 配布部分の容量 | 128,915,456 bytes（122.9 MiB） | 150,115,328 bytes（143.2 MiB） | 128,787,545 bytes（122.8 MiB） |
| アプリの配布ファイル数 | exe 1 個 | exe 1 個 | 31 個、Node 本体を含む |
| トップページ | 200 | 200 | 200 |
| 静的ファイル | 全 26 個の内容一致 | 全 26 個の内容一致 | 全 26 個の内容一致 |
| `/api/getSetting` | 200、初期化成功 | 同左 | 同左 |
| 未ログイン `/api/socketToken` | 401 | 401 | 401 |
| 本番ビルド `/auth/dev` | 404 | 404 | 404 |
| トークンなし Socket.IO | polling / WebSocket とも `unauthorized` | polling は拒否、WebSocket は timeout | polling / WebSocket とも拒否 |
| ゲーム受信 `POST /` | 配列 `[]` で 200 | 同左 | 同左 |
| discord.js / @discordjs/voice | 読み込み成功、ダミー Bot のログイン失敗ログ | 同左 | 同左 |
| TLS 初回起動 | frontend / Socket / 内部 API とも成功 | 同左 | 同左 |
| 証明書の置換後 | 3 箇所すべて新しい証明書 | 3 箇所とも古い証明書のまま | 3 箇所すべて更新 |
| 不正な証明書への置換 | 直前の証明書を維持 | 同左 | 同左 |
| exe 隣の `ENV_FILE`、相対 `DATA_DIR` | 成功、別の cwd から起動 | 同左 | 同左 |
| Windows サービス登録 | 未実施 | 未実施 | 未実施 |

開発用と同じポート（3100 / 3101 / 30100 / 5100 / 1334）、自作のダミー設定、自己署名証明書で確認した。本物の `.env*`、Bot トークン、証明書、運用データは参照・コピーしていない。通常のビルド・型チェックは既存スクリプトの設定読み込みをそのまま使う。起動の権限拒否は今回なし。試作プロセスは検証ごとに停止する。

## 実行ファイルにまとめるための処理

- frontend と backend を 1 プロセスに統合し、既存のポートとイベント名を維持。frontend の TLS は既存の `frontend/scripts/tls.mjs`、backend は既存のバンドル内の処理を使用した。製品コードの変更はない。
- SEA の公開ファイルは assets に埋め込み、Node の HTTP listener から直接返す。Nitro のファイルパスに依存する公開ファイル配信を、試作アダプターで置き換えた。Bun は file import で同じファイルを埋め込む。[Node SEA 公式](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/single-executable-applications.md)、[Bun 公式](https://bun.sh/docs/compiler/executables)
- `@discordjs/voice` が必須で読む DAVE addon を埋め込み、`<DATA_DIR>/native/<SHA-256>.node` に展開して `process.dlopen` で読む。exe 以外にランタイムのインストールは不要だが、実行時にデータファイルは作られる。SEA の native addon はこの展開方式が必要。[Node SEA の native addon](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/single-executable-applications.md#using-native-addons-in-the-injected-main-script)
- `settings/default.json` は exe から起動ごとに展開。管理者が変更する `data/frontend/setting.json` は上書きしない。設定、ログ、Bot トークン、証明書は exe の外に置く。
- Bun 1.3.11 の `process.loadEnvFile` 未対応を dotenv で補った。Bun の `.env` / bunfig 自動読み込みも無効化。WebSocket と TLS 更新の失敗が残るため、今回の推奨から外した。
- 画像変換の `sharp` と任意の Opus / FFmpeg / 暗号化ライブラリはバンドル対象外。現在の画面は通常の img を使用している。IPX の画像変換や Discord の実通話は未検証。

## 再現手順

リポジトリルート `E:\dev\SyakasabaVC` で実行する。Node 24、インストール済みの pnpm、Bun が必要。SEA は `postject@1.0.0-alpha.6` を pnpm dlx で取得するため初回は通信が発生する。package.json / lockfile の変更やシステムへの追加インストールはない。

```powershell
Set-Location E:\dev\SyakasabaVC
pnpm build
node tools/package/build-sea.mjs
node tools/package/build-bun.mjs
node tools/package/build-folder.mjs
```

生成先は `E:\dev\SyakasabaVC\release\{sea,bun,folder}`。`delivery-files.json` が配布対象一覧、`build-result.json` が計測結果。ビルド中間ファイルと検証用の app.env / tokens.json / 証明書 / データは配布しない。SEA / Bun の配布対象は `svoice.exe` のみ。

開発サーバーを停止してから検証する。スクリプトは使用ポートが空いていることを確認し、ダミー設定を生成して、起動したプロセスだけを finally で停止する。Bun は既知の失敗を検出して終了コード 1 になる。

```powershell
node --test tools/package/common.test.mjs
node tools/package/smoke.mjs sea
node tools/package/smoke.mjs bun
node tools/package/smoke.mjs folder
```

結果とログは各生成先の `smoke-result.json` / `smoke-*.log`。個別の起動確認は、smoke 生成後に次のように行える。終了は Ctrl+C。

```powershell
$env:ENV_FILE = 'E:\dev\SyakasabaVC\release\sea\app.env'
& E:\dev\SyakasabaVC\release\sea\svoice.exe
```

## 常駐方式の比較

WinSW は外部 exe の監視・自動起動・ログ出力を XML で指定でき、A / B / C に共通で使える。試作用 XML は `tools/package/svoice-service.xml`。**安定版の WinSW 2.x を使う案**とし、今回ダウンロードや登録は行っていない。[WinSW 公式](https://github.com/winsw/winsw)、[2.x 設定](https://github.com/winsw/winsw/blob/v2/doc/xmlConfigFile.md)

NSSM も各形式の実行ファイルを起動できるが、設定をファイルとして管理できる WinSW を推奨する。node-windows は Node スクリプトをサービス化する追加層になる。pm2 の Windows 自動起動は別対応が必要。`sc.exe create` だけでは通常の Node / SEA exe はサービス制御の入口を持たず、そのまま常駐サービスにはできない。[NSSM](https://nssm.cc/commands)、[node-windows](https://github.com/coreybutler/node-windows)、[pm2](https://pm2.keymetrics.io/docs/usage/startup/)、[Windows のサービス要件](https://learn.microsoft.com/en-us/windows/win32/services/service-entry-point)

## 推奨案の配布・更新手順案

以下は採用後の手順案で、今回の実施内容ではない。

1. ビルド機で SEA を生成し、配布対象の `svoice.exe` のハッシュを記録する。本番機にソース、node_modules、pnpm、Bun は置かない。
2. 配布先に `svoice.exe`、WinSW 2.x を改名した `svoice-service.exe`、同名の `svoice-service.xml` を置く。`tools/package/app.env.example` を基に `app.env` を用意する。API_SECRET と NUXT_API_SECRET は同じ値にする。Bot の tokens.json と certs/ は別途配置する。
3. `NODE_ENV=production`、既定の本番ポート 3000 / 3001 / 30000 / 5000 / 1234 を使用する。証明書パスは frontend / backend 共通。内部 API を外部に公開しないよう Windows Firewall と許可 IP を確認する。サービスアカウントには設定・トークン・証明書の読取権限、data/ と settings/ の書込権限を与える。
4. 管理者 PowerShell で配布先の `svoice-service.exe install`、`svoice-service.exe start` を実行する。XML で自動起動、失敗時再起動、ログの保存を指定する。
5. 更新時はサービスを停止し、現在の exe を退避、新しい **svoice.exe 1 個**に置換して再開する。設定・データ・証明書・WinSW は保持する。失敗時は停止して退避した exe に戻す。Windows は実行中の exe を置換できないため、停止時間は必要。

サービスの停止完了、異常時の再起動、PC 再起動後の起動、データ保持、ロールバックは、本番採用前にサービスとして確認する。統合すると片側の異常が両方に影響するため、終了処理と frontend / backend 両方の死活監視も確定させる。

## 証明書の取得・更新

win-acme で対象ドメインを登録し、検証方法を運用環境に合わせて指定、PemFiles store の出力先を certs/ にする。`TLS_KEY_PATH` に `{name}-key.pem`、`TLS_CERT_PATH` に `{name}-chain.pem` を指定する。[PemFiles 公式](https://www.win-acme.com/reference/plugins/store/pemfiles)

win-acme の更新タスクが同じパスのファイルを置換すると、Node SEA は約 1 秒後に frontend / Socket / 内部 API の証明書を読み直す。再起動や更新後スクリプトは不要な設計。鍵と証明書が一時的に不整合なら旧証明書を保持し、次の正常な組を待つ。今回の検証は自己署名証明書の rename 置換で、実際の ACME 発行・更新タスクは未実施。

## 採用前に残る確認

- Bun: WebSocket 接続と TLS の再読み込みに失敗。Node SEA では同じ検証が成功。
- 実際の Discord OAuth / Bot / ロール操作 / Voice 接続と SkyWay 音声は未実施。開発ログインを使えない本番ビルドのため E2E は実行していない。
- IPX / sharp と任意の音声 codec を使う場合の同梱方針。native addon は Windows x64 固定で、別アーキテクチャには再生成が必要。
- 実行ファイルの署名、ライセンス通知、Defender の判定、まっさらな本番機での確認。postject は Node 元署名の警告を出し、試作 exe は未署名。
- アダプターの製品化、配布ファイルの抽出と更新の自動化、Windows サービスの実動作。現状のスクリプトは方式選定用の試作であり、既存の起動経路は変更していない。

## 既存機能への影響の確認

- `pnpm test`: 327 件成功（shared 27 / frontend 132 / backend 168）。
- `pnpm typecheck`: 終了コード 0。既知の vue-router / Volar 解決警告あり。
- `pnpm build`: 終了コード 0。
- `node --test tools/package/common.test.mjs`: 2 件成功。公開パスの query / エンコードと、親ディレクトリ・バックスラッシュ等の拒否を確認。
- `node tools/package/smoke.mjs folder sea`: 終了コード 0。`node tools/package/smoke.mjs bun`: 終了コード 1（表の既知の失敗）。
- 検証後、使用した 5 ポートの待受なし。`release/` は git 管理外。変更はこの提案書、`tools/package/`、`.gitignore` のみ。
