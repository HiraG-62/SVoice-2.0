# voice-lab: 偽ゲームデータを Web UI で操作し、声を出し続けるボットで聞こえ方を試す開発環境

## 目的
開発者が、すべてのプレイヤー状態（`PlayerData` の全項目）を Web UI で自由に変えながら、実際の SkyWay 通話で「聞こえるか・どのくらいの音量か」を耳で確かめられるようにする。

- 開発者は自分のブラウザで開発用ログイン（例 `Alice`）して参加し、聞き手になる。
- ボット（ヘッドレス Chromium）が開発用ログインで参加し、自分の名前を読み上げる音声を送り続ける。
- 操作画面で、全員の送信データを編集できる。聞き手から見た各プレイヤーの「聞こえるはずか・音量・決め手（`docs/VOICE_RULES.md` の手順番号）」を表示する。

開発専用。本番のアプリ（frontend / backend の `src`）と exe には何も入れない。

## 前提（現状）
- 偽ゲームサーバー: `backend/scripts/fake-game-server.ts`（CLI、`--scenario` / `--replay` / 対話コマンド）と `backend/scripts/fakeGame.ts`（`createPlayer`・`setPlayerField`・`NUMERIC_PLAYER_FIELDS`・`resolveFakeGameEndpoint`・`SEND_INTERVAL_MS` 200ms）。ゲーム受信（`POST /`）へ 200ms ごとにプレイヤー配列を送る。受信が 5 秒途絶えると全員ゲーム外。
- `pnpm dev`（`frontend/scripts/dev.mjs`）は backend・frontend・偽ゲームサーバー（`--scenario sweep`、`DEV_PLAYERS` 既定 `Alice,Bob`）を同時に起動する。`pnpm dev:e2e`（`--e2e`）は偽ゲームサーバーなし。
- 開発用ログイン: `POST <frontend>/auth/dev`（`{ gamerTag, admin }`）。`nuxt dev` かつ `NUXT_DEV_LOGIN_ENABLED=true` のときだけ。開発用ログインの人はロール操作の対象外（参加ロールは常に true）。
- 判定: `frontend/services/volume.ts` の `evaluatePlayerVolume(self, other, distance, settings, admin)` が `{ volume, reason }` を返す。`getDistance`、`shouldSubscribe(inGame, speaker, volume)` もある。依存は `@svoice/shared` と `./constants` だけ。
- 距離設定: `GET <frontend>/api/getSetting`（認証なし）。
- E2E の疑似マイク: Chromium の `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`（wav を繰り返し再生）。`e2e/fixtures/microphone.wav` は 48 kHz・16 bit・mono。
- ゲームの `mute`（0 = なし、1 = 切り替え、2 = ミュート、3 = 解除）は、アプリがそのプレイヤー自身のマイクをミュートする指示（`frontend/composables/useVoice.ts` の `mute`）。聞こえる条件には使わない。
- Windows の `System.Speech`（日本語音声 Microsoft Haruka）で wav を生成できることを claude が確認済み（`SpeechAudioFormatInfo(48000, Sixteen, Mono)` + `SetOutputToWaveFile`）。

## Fixed

### 起動
- ルートに `pnpm dev:lab` を追加する。`frontend/scripts/dev.mjs --lab` で、backend・frontend・voice-lab を同時に起動する（偽ゲームサーバーの sweep は起動しない。送信者が 2 つになるとデータが上書きし合うため）。`.env.development` の扱いは `pnpm dev` と同じ（ポートや設定を上書きしない）。
- voice-lab 単体: `pnpm --filter @svoice/backend voice-lab [--bots Bot1,Bot2] [--listeners Alice,Bob]`。`pnpm dev:lab` は `--listeners` に `DEV_PLAYERS`（既定 `Alice,Bob`）、`--bots` に `LAB_BOTS`（既定 `Bot1,Bot2,Bot3`）を渡す。
- 操作画面は `http://127.0.0.1:<VOICE_LAB_PORT>/`（既定 3110）。**127.0.0.1 だけで listen する**。起動時にコンソールへ URL を出す。
- 送信先はゲーム受信（`resolveFakeGameEndpoint`、`GAME_API_SECRET` があればヘッダーに付ける）。frontend の URL は backend の設定の `SERVER_URL`。
- 起動後、frontend のトップページが 200 を返し `/api/getSetting` が成功するまで待ってからボットを起動する（待機中は画面に「frontend 待ち」）。
- 既存の `pnpm dev`・`pnpm dev:e2e`・`fake-game` の CLI の振る舞いは変えない。

### プレイヤー（行）
- 行の種類は 2 つ:
  - **聞き手**（`--listeners`）: データだけ。開発者が自分のブラウザで同じゲーマータグで開発用ログインして使う。
  - **ボット**（`--bots`）: データ ＋ ヘッドレス Chromium。
- 画面から、ボットと聞き手の行を追加・削除できる（ゲーマータグを入力。重複は不可。1〜100 文字）。ボットを削除したらブラウザも閉じる。
- 各行の初期値は `createPlayer(name)`。すべての行を同じ位置に置くと全員に聞こえるので、ボットは初期位置を x 方向に 5 ずつずらす（1 体目 x=5、2 体目 x=10…）。
- 各行に「送信に含める」のチェック（外すとその人はゲーム外。手順 2 の確認用）。全体の「送信 ON/OFF」（OFF にすると 5 秒後に全員ゲーム外）。
- 編集できる項目は `PlayerData` の `name` 以外の全項目。入力は:
  - 選択: `location.dimension`（0 オーバーワールド / 1 ネザー / 2 エンド / -1 それ以外）、`music`（0 オフ / 1 オン / 2 ミュート）、`transceiver.type`・`radio.type`（0 受信 / 1 送信・発信 / 2 持っていない）、`mute`（0 / 1 切り替え / 2 ミュート / 3 解除）、`useMegaphone`・`useMicrophone`・`hasTelephone`（0 / 1）
  - 数値: `location.server`、`location.coordinates.{x,y,z}`、`telephone`、`transceiver.number`、`radio.number`、`voiceOptions.{rangeOutput,volumeOutput,rangeInput,volumeInput}`
  - 選択の項目も、選択肢にない有限数を入力できるようにする（「全ての状態」を試すため。例: 数値入力に切り替えられる）
- 変更は次の送信（200ms 以内）から反映する。不正な値（有限数でない）はサーバー側で拒否し、画面にエラーを出す。

### ボット
- ボットごとに Chromium を 1 プロセス起動する（疑似マイクの wav は起動オプションで決まるため）。ヘッドレス。オプションは E2E と同じ 3 つ（wav はボットごとのもの）。
- 声: 起動時に Windows の `System.Speech`（ja-JP の音声。なければ既定の音声）で「<ゲーマータグ>」を読み上げ、後ろに約 1 秒の無音を付けた wav（48 kHz・16 bit・mono）を作る。置き場所は OS の一時フォルダーの下（リポジトリには作らない）。生成に失敗したら `e2e/fixtures/microphone.wav` を使い、画面とコンソールに出す。
- 参加: 開発用ログイン（`admin: true`。全体発言を使うため）→ トップページ → 「参加」ボタン。参加できたかを画面に出す（状態: 起動中 / 参加中 / エラー（メッセージ））。
- **マイクは常に送信**: ゲームの `mute` やほかの理由でボットのアプリがミュートになったら、すぐ解除する（`audio` ストアの `setMuted(false)`。E2E の `action` と同じ方法でよい）。
- 全体発言: ボットの行ごとに「全体発言」の ON/OFF。ボットのページで全体発言を開始・停止する（UI のボタンを押すか、アプリの関数を呼ぶ）。
- ボットのページが落ちた・切断したら状態をエラーにし、行に「再起動」ボタンを出す。
- voice-lab の終了（Ctrl+C、`pnpm dev:lab` の停止）で、すべてのブラウザを閉じる。Chromium のプロセスを残さない。

### 判定の表示
- 画面で聞き手を 1 人選ぶ（既定: 最初の聞き手の行。ボットも選べる）。
- 選んだ聞き手から見た、ほかの全行について表示する: 距離、予想音量（`evaluatePlayerVolume` の `volume`。0〜1 を % でも）、受信するか（`shouldSubscribe`）、決め手。
  - 入力: 実際に送っているデータ（送信 OFF・「送信に含める」なしの人はデータにいない）、最新の距離設定（`/api/getSetting` を 5 秒ごとに取り直す）、全体発言中のボット（`admin` 引数）。
  - 聞き手がデータにいなければ `inGame = false`。
- 決め手の表示（`reason` → 手順）: `admin` 手順 1 全体発言 / `offGame` 手順 2 ゲーム外 / `server` 手順 3 サーバー違い / `music` 手順 4 音楽ミュート / `phone` 手順 5 同じ番号で通話 / `transceiver` 手順 8 トランシーバー / `radio` 手順 9 ラジオ / `dimension` 手順 10 ディメンション違い / `distance` 手順 11 距離 / `settingsMissing` 距離設定なし。
- 判定は `frontend/services/volume.ts` の関数をそのまま import して使う（判定を複製しない）。`frontend/services/volume.ts` は変更しない（I1）。
- 表示されるのは「アプリが決める結果」。実際の gain は聞き手の画面の相手ごとの音量と出力音量でさらに変わる、と画面に 1 行で書く。

### 操作画面
- voice-lab のプロセスが静的な HTML（1 ファイル。ビルド不要。外部 CDN を使わない）と JSON API を返す。フレームワークは使わない（素の HTML / JS）。
- 画面の文言は日本語。短く（体言止め）。
- 状態は 500ms〜1 秒ごとのポーリングで更新してよい。
- 表示: ボットの状態、送信 ON/OFF と最後の送信結果（成功 / HTTP エラー）、frontend 待ちの状態、プレイヤーの表、判定の表。

### 秘密情報・安全
- API シークレットや Cookie を画面・ログに出さない。
- 開発用ログインが無効（404）なら、ボットはエラー状態にして「開発用ログイン無効」と出す。

### 編集してよいファイル
- 新規: `backend/scripts/voice-lab.ts`（エントリ）、`backend/scripts/voiceLab/` 以下（状態・判定・ボット・音声生成・HTTP サーバー・HTML）
- `backend/scripts/fake-game-server.ts`・`backend/scripts/fakeGame.ts`: 送信処理などを共有するための切り出しだけ（CLI の振る舞いは変えない）
- `backend/package.json`（`voice-lab` スクリプト、`@playwright/test` をルートと同じ版 `1.63.0` で devDependencies に追加）、`pnpm-lock.yaml`（pnpm install が更新する分）
- `frontend/scripts/dev.mjs`（`--lab`）、ルートの `package.json`（`dev:lab`）
- テスト: `backend/test/voiceLab*.test.ts`（新規）、`e2e/voiceLab.spec.ts`（新規）、必要なら `e2e/playwright.config.ts`
- `docs/MANUAL_TEST.md`（voice-lab の使い方の節を追加）
- `docs/DESIGN.md`・`AGENTS.md` は claude が更新する

### 変えないもの
- `frontend/` のアプリのコード（`components`・`composables`・`services`・`stores`・`server` など）、`backend/src/`、`packages/shared/`、`tools/package/`。ボットの操作はページの外から行う。
- ゲームサーバーとの契約、Socket.IO のイベント名。

## テスト
### 単体（vitest、`backend/test/`）
- 状態: 行の追加・削除・重複拒否、項目の更新（全項目、選択肢にない有限数も可、非有限数は拒否、`name` は変更不可）、送信データの組み立て（「送信に含める」なしと送信 OFF の扱い）、ボットの初期位置
- 判定: 聞き手ごとの表の組み立て（ゲーム外、全体発言中のボット、各 `reason` と手順の対応、距離設定なし）
- ボットの管理: ブラウザを起動する部分を差し替えて、起動・参加・ミュートの解除・全体発言・再起動・削除・終了時にすべて閉じること
- 音声生成: PowerShell に渡すスクリプトの組み立て（ゲーマータグのエスケープ。引用符などを含むタグで壊れないこと）と、失敗時に既定の wav へ切り替えること
- HTTP API: 127.0.0.1 で listen すること、各 API の正常系と不正な入力

### E2E（`e2e/voiceLab.spec.ts`。`pnpm dev:e2e` の起動中に `pnpm e2e` で動く）
- voice-lab を同じプロセスから起動する（ポートは空いている番号。ボット 1 体、聞き手 1 人）。
- 聞き手を Playwright のページで開発用ログイン・参加させる。
- 予想が「受信する」のとき、聞き手の診断情報（`$voice.debugSnapshot()`）でボットを購読し、ボットの発話を検知すること。
- 操作画面の API でボットの `location.server` を 2 にすると、予想が手順 3 で 0 になり、聞き手がボットの購読をやめること。1 に戻すと再び購読すること。
- ボットに `mute` 2 を送っても、ボットのミュートが解除されて発話が続くこと。
- テストの終わりにボットのブラウザが残らないこと。

## Discretion
- `backend/scripts/voiceLab/` 内のファイルの分け方、API のパスと形
- 画面のレイアウトと見た目（表の列の並び、入力部品）
- 便利機能（よく使う状態のプリセット、距離のスライダー、全員に同じ値を入れるボタンなど）は、上の Fixed を満たしたうえで入れてよい
- ボットの全体発言の操作方法（UI のボタンを押すか、アプリの関数を呼ぶか）
- 読み上げの文（「<タグ>」の前後に言葉を足すか）と無音の長さ（0.5〜2 秒）

## 完了の確認
- `pnpm test`、`pnpm typecheck`
- `pnpm dev:e2e` を起動して `pnpm e2e`（既存 10 件 ＋ 追加分）。起動直後は Nuxt のビルド待ちで失敗しやすいので、トップページが 200 を返してから 20 秒ほど待つ。ユーザーの `pnpm dev` が動いていたら止めずに、E2E は実行せず RESULT にそう書く
- `pnpm dev:lab` を起動し、操作画面を Playwright で開いてスクリーンショットを撮る（`C:\Users\Horry\.clodex\artifacts\E--dev-SyakasabaVC-29b73fa9\voice-lab.png`）。ボットが参加中になること、項目の編集が判定の表に反映されることを確かめる
- 自分で起動したサーバー・ブラウザは、終わったらプロセスの木ごと止め、ポート（3100 / 3101 / 30100 / 5100 / 1334 / 3110）の解放と Chromium が残っていないことを確かめる
