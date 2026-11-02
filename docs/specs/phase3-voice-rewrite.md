# phase3-voice-rewrite: 音声・接続の作り直しと状態管理の整理

大改修フェーズ 3（`docs/OVERHAUL.md` §6）。`phase2-frontend-security` の完了後に行う。
対象は V1〜V7、C1、C5、C9、C10、C12・C13（frontend 側）、O1、R1、R2、R7、R8。保留中の `docs/specs/voice-subscription-sync.md` の内容（V2）もここに含める。
**最重要は不変条件 I1**（聞こえない条件の人の声は聞こえず、聞こえる条件の人の声は必ず聞こえる）。I4（`getUserMedia` の設定）も守る。前提知識は `AGENTS.md` と `docs/DESIGN.md`。
ユーザーは不在のため、設計担当（claude）が計画書の決定事項（R2: Pinia＋サービス）に沿って判断した。

## 進め方（Fixed）
1. **先に今の動作をテストで固定する。** 今の `calcPlayerVolume` / `getDistance` / 受信の判定（`shouldSubscribe`）を、ロジックを変えずに純粋な関数として切り出し、今の結果をそのまま期待値にした単体テストを書く（通話・トランシーバー・ディメンション・マイク・メガホン・距離の境界・`minVolume`・`voiceRange*`・`volume*`・全体発言・自分がゲーム外 の組み合わせ。最低 30 ケース）。
2. 次に E2E テスト（下の「E2E」）を、今のコードで通る状態にする（C12・C13 のように今は失敗する項目は、`test.fixme` にしておき、作り直し後に有効にする）。
3. そのうえで作り直す。1 と 2 のテストが、作り直しの前後で同じ結果になること。

## 構成（Fixed）
```
frontend/
  stores/        Pinia ストア（画面に関わる状態だけ。書き換えは action 経由）
    audio.ts     入出力デバイス、マイク音量・出力音量（localStorage 保存）、自分のミュート、ノイズ抑制
    call.ts      参加状態（idle / joining / joined）、ゲーム内かどうか、全プレイヤー、近くのプレイヤー（表示用の値だけ）、全体発言者、自分が全体発言中か
    settings.ts  距離設定（読み込み・保存・デフォルトに戻す。失敗時の再読み込み）
  services/      画面の状態から切り離した処理（Vue の reactive に AudioNode や SkyWay のオブジェクトを入れない）
    volume.ts    音量計算と受信判定の純粋な関数（R8。上の 1 で切り出したもの）
    mic.ts       マイク: getUserMedia（I4 の設定のまま）→（ノイズ抑制）→ GainNode → MediaStreamDestination
    voiceRoom.ts SkyWay: 参加・配信・相手ごとの受信と再生・退出
    diagnostics.ts 不具合調査用の情報の収集（O1）
  composables/   ストアとサービスをつなぐ薄い層（参加・退出の流れ、Socket の受信の振り分け）
```
- `@pinia/nuxt` を導入する。`useComponents.ts` と `useCusEvent.ts`（mitt）は廃止する。
- 画面の中だけの状態（マイクテスト中、上限拡張、ダイアログの開閉など）はコンポーネントのローカル状態にする。
- マジックナンバー（100ms、200ms、gain の `/50`、`2 ×`、上限 200 / 2000 など）は定数にする（R7）。

## 振る舞い（Fixed。今の動作を保つもの）
- 送信: マイク音量の gain は `micLevel / 50`。ミュート中は常に 0。localStorage のキー `micLevel` / `phoneLevel`（既定 100）、上限は通常 200、拡張時 2000。
- 受信: gain は `2 × 相手ごとの音量（0〜2、localStorage のキーはゲーマータグ、既定 1）× 距離音量 × phoneLevel / 100`。全体発言者の距離音量は 1。
- 受信の開始と停止の条件は今の `shouldSubscribe` のとおり。自分がゲームのデータにいない（空の配列を含む）ときは、全体発言者だけを受信する。
- 発話の検知は今と同じ（時間領域で `|v - 128| > 1`、200ms ごと）。リモートの音声を WebAudio に流すための「ミュートした Audio 要素」の回避策は残す（後始末はする）。
- ゲームからのミュート指示（1 = 切り替え、2 = ミュート、3 = 解除、効果音あり）、スマホ所持によるロールの付け外し、各画面の文言と配置は今のまま。

## 不具合の修正（Fixed）
- **V1**: ミュート中に入力音量を変えても gain は 0 のまま。
- **V2**: 相手ごとの受信状態を、SkyWay 側の subscription の実際の状態と同期する。`docs/specs/voice-subscription-sync.md` の Fixed（1〜4、4a、4b）をそのまま満たす。
- **V3**: 同じゲーマータグで配信し直されたら、古いものを片付けてから登録する。watch や監視のタイマーは、受信の停止・退出のときに必ず止める。
- **V4**: 受信ごとに作る Audio 要素・AudioNode・MediaStream のトラックを、受信の停止時にすべて解放する。
- **V5**: マイクの入力デバイスを変えても、配信中の MediaStreamDestination は作り直さない（入力の source だけを差し替える）。worklet の登録と watch は 1 回だけ。
- **V6**: マイクテストは、マイクの準備ができていないときに始めない。
- **V7**: 距離設定がないときは音量を計算せず、読み込み直す（現在の実装を新しい構成に移す）。
- **C1**: 未ログインでは、参加ロールの確認とマイクの取得をしない。
- **C5**: 参加に失敗した理由ごとに、参加画面にメッセージを出す（トークン取得の失敗、SkyWay への参加の失敗、Socket の接続失敗・タイムアウト、マイクを使えない）。
- **C9**: テーマ色の明暗の関数は、引数ごとに正しい色を返す。
- **C10**: キック確認のダイアログは一覧の外に 1 つだけ置く。
- **C12・C13（frontend 側）**: 空の配列を受け取ったら待機中にし、距離による受信を止める。全体発言者の一覧が変わったら、次のデータを待たずに受信の判定をやり直す。
- **O1**: 「デバッグ用 送信」で、次の情報を集めて送る（backend は受信時刻とゲーマータグを付けて保存する）: 自分の状態（参加状態・ゲーム内か・ミュート・ノイズ抑制・マイク音量・出力音量・マイクの準備状態・AudioContext の state）、相手ごとの状態（ゲーマータグ、ローカルの受信状態、SkyWay の subscription の state と接続状態、計算した距離音量と受信判定の理由、現在の gain、発話検知の状態）、直近 50 件のエラーと警告（時刻付き）、ブラウザの UserAgent、アプリのバージョン（`package.json`）。
- 保存されたデバッグ情報を運営が読むためのスクリプト `pnpm --filter @svoice/backend debug-log [--tag <ゲーマータグ>] [--date YYYY-MM-DD]` を追加する（`DATA_DIR/logs/` から絞り込んで見やすく表示する）。

## E2E テスト（Fixed）
- ルートに `e2e/`（Playwright。`@playwright/test` はグローバルの playwright と同じ `1.63.0` に固定し、導入済みのブラウザを使う）。ルートに `pnpm e2e` を追加する。単体テストの `pnpm test` には含めない。
- 前提: ユーザーの開発環境（`.env.development`、`DISCORD_ENABLED=false`、開発用ログインが有効）。ルートに `pnpm dev:e2e`（`pnpm dev` から偽ゲームサーバーだけを除いたもの）を追加し、E2E はこれが動いている前提で http://localhost:3100 に対して実行する。ゲームのデータは、テストが backend の `fakeGame` の関数と `loadEnvironment`（`backend/.env.development`）を使って、自分で送る（秘密の値を出力しない）。
- Chromium の疑似マイク（`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`）を使い、開発用ログインで 2 人（管理者 1 人）を参加させる。状態は Pinia のストアから読む。
- 項目: 参加と待機中／全プレイヤー一覧／距離 3・12・25 の gain と受信の有無／通話中／ディメンション違い／メガホン／発話の検知／ゲームのミュート指示／ミュートボタン／ミュート中に入力音量を変えても gain が 0（V1）／設定変更の反映と一般ユーザーの 403／距離設定が空からの回復／送信停止で待機中（C12）／ゲームデータがない間の全体発言（C13）／全体発言の解除／キックと再参加／退出と再参加の繰り返し（3 回。リスナーとリソースが増えない）／相手の退出で一覧から消える／参加ロックと解除／デバッグ送信がログに保存される。
- 同じ値の確認のために待つ時間は、固定の待ち時間ではなく `expect.poll` などで条件が満たされるまで待つ（最大 10 秒）。

## 変更してよいファイル
- `frontend/` 配下（`.env*`・`data/`・`settings/*.json` の中身は除く）
- ルートの `package.json`、`pnpm-lock.yaml`、`e2e/`（新規）、`frontend/scripts/dev.mjs`（`dev:e2e` のため）
- `backend/scripts/`（`debug-log` の追加）、`backend/package.json`
- `packages/shared/`（型の追加に限る）
- `docs/MANUAL_TEST.md`（E2E の実行方法の追記）

## 完了条件（RESULT は箇条書き 10 行程度）
- ルートで `pnpm test` / `pnpm typecheck` / `pnpm build` が通る。
- `pnpm dev:e2e` を起動したうえで `pnpm e2e` がすべて通る（`test.fixme` は残さない）。**ユーザーの環境の `pnpm dev` が動いていたら、止めてから `pnpm dev:e2e` を起動し、終わったら `pnpm dev` を起動し直して元の状態に戻す。** 別のフォルダーや別のポートで起動しない。
- 「進め方」の 1 の単体テストが、作り直しの前後で変わらずに通ったこと（作り直し後に期待値を変えていないこと）を RESULT に書く。

## Discretion
- ストアとサービスの細かい API、ファイル名。
- 発話検知・受信状態の同期の実装方法（ポーリングか SkyWay のイベントか。両方でもよい）。
- E2E のファイル分けと補助関数。
- デバッグ情報の JSON の細かい形。
