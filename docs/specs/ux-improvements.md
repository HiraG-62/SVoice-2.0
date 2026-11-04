# ux-improvements: 一覧・設定画面の使い勝手の改善（6 項目）

作成: 2026-11-04 / 担当: codex（実装）、claude（設計・レビュー・コミット）
出典: gemini の提案をユーザーが承認（2026-11-04）。6 項目すべて実装する。

## 前提
- 画面は Vuetify 4（`frontend/plugins/vuetify.ts`、テーマは常に `light`）。状態は Pinia（`frontend/stores/`）。
- UI の文言は日本語で、短く書く。ラベルと状態は体言止めにする（「送信完了」「ロック解除完了」）。「〜しました」「〜してください」は使わない。
- 不変条件: I5（参加パスワードの入力欄は `type="text"` のまま）、I6（デバッグ送信は全員が使えるまま）。Socket.IO のイベント名は変えない。

## Fixed

### U1: タブに人数を表示する（`frontend/components/userList.vue`）
- 「近くのプレイヤー」タブには `nearby` の人数、「全てのプレイヤー」タブには `users` の人数を、ラベルの右に `v-badge`（`inline`）で表示する。0 人のときも `0` を表示する。
- 人数はストアの配列の長さをそのまま使う（自分は `users` に含まれない。今の一覧と同じ数）。

### U2: 全てのプレイヤーの一覧でも音量を変えられるようにする（`frontend/components/userList.vue`）
- 「全てのプレイヤー」タブの表に「音量」列を追加し、「近くのプレイヤー」と同じスライダー（`call.setUserGain`、`0`〜`MAX_PEER_GAIN`、step `0.01`）を表示する。列の幅は、近くのプレイヤーの表と同じ割合にする。
- 値は `users` の `gain` を表示する。変更すると、今と同じく `localStorage` に保存され、近くにいれば `nearby` にもすぐ反映される（`setUserGain` の今の挙動）。
- 管理者の場合、名前をクリックするとキックの確認が出る挙動は、両方のタブで今のまま残す。

### U3: 操作の完了を通知する（トースト）
- 画面に 1 つだけ `v-snackbar` を置き、どのコンポーネントからでも呼べる通知の仕組みを作る（Pinia ストアか composable）。設定ダイアログを開いたままでも、通知がダイアログの上に表示されること。
- 成功と失敗で色を分ける（成功: `success`、失敗: `error`）。表示時間は定数にする（目安 3 秒）。
- 通知を出す操作と文言:

| 操作 | 成功 | 失敗 |
|---|---|---|
| インゲーム設定の「変更確定」（`ingameSetting.vue` の `setSettings`） | `設定保存完了` | `設定保存失敗` |
| 一般設定のデバッグ「送信」（`generalSetting.vue`） | `送信完了` | `送信失敗` |
| 参加ロックの「解除」（`JoinLocks.vue` の `unlock`） | `ロック解除完了` | 今の `error`（`ロック解除失敗`）の表示を残し、同じ文言で通知も出す |

- 「変更確定」は、今は `settings.save()` の失敗を拾っていない。失敗したら `useSetSettingSocket()` を呼ばず、失敗の通知を出す。
- **デバッグ送信の完了は、サーバーの受け取りで判断する。** Socket.IO の `debug` イベントに ack を付ける（イベント名と送る内容は変えない）。
  - `packages/shared` の `debug` イベントの型に、省略可能な ack `(result: { ok: boolean }) => void` を追加する。
  - backend（`backend/src/socketServer.ts`）は、書き込んだら `ack?.({ ok: true })`、制限超過で捨てたら `ack?.({ ok: false })` を返す。ack がない送信（古い画面）も今までどおり受け付ける。書き込みの例外の扱いは今のまま変えず、例外が出たら `ok: false` を返す。
  - frontend は ack を待つ（タイムアウトは定数。目安 5 秒）。`ok: true` なら成功、`ok: false`・タイムアウト・未接続なら失敗の通知を出す。送信中はボタンを `loading` にして、二重に押せないようにする。
  - デバッグ送信は、通話に参加していない状態でも押せる（I6）。そのときソケットが未接続なら、失敗の通知を出す（今と同じく、データは届かない）。

### U4: 設定ダイアログのレスポンシブ化（`frontend/components/settingWrap.vue`）
- 画面幅が `smAndDown`（Vuetify の `useDisplay`）のときは、今と同じ全画面にする。それより広いときは、中央のダイアログにする（幅 `800px`・`max-width: 90vw` を目安。高さは画面に収め、中身はダイアログの中でスクロールする）。
- 中央のダイアログのとき、外側をクリックしたり Esc を押したりして閉じた場合も、閉じるボタンと同じく、マイクテストを止めてから閉じる（`useVoice().mic.stopTest()`。今の `closeSetting` と同じ処理を通す）。
- 各タブ（`voiceSetting.vue`・`generalSetting.vue`・`ingameSetting.vue`・`JoinLocks.vue`）の列幅は、Vuetify のブレークポイントがダイアログではなく画面の幅で決まることに注意して、800px のダイアログの中で項目が窮屈にならないように調整する（例: ダイアログのときは 2 列まで）。全画面のときの見た目は、今と大きく変えない。

### U5: 設定項目に補足を付ける（`frontend/components/voiceSetting.vue`）
- 「上限拡張」の横に、情報アイコン（`mdi-information-outline`）と `v-tooltip` を付ける。文言: `` `入力音量の上限 ${NORMAL_LEVEL_MAX} → ${EXTENDED_LEVEL_MAX}。声が小さいとき用` ``（数値は定数から作る）。タップでも読めること（モバイル）。
- 「出力デバイス」の注記を `※変更不可` から `※OS の既定の出力を使用` に変える。

### U6: 参加パスワードを Enter で送れるようにする（`frontend/pages/index.vue`）
- パスワード欄で Enter を押すと、「送信」ボタンと同じ `joinAuthClick` を呼ぶ。ボタンが押せない状態（`authLocked` または `authPending`）のときは何もしない。
- **日本語入力の変換を確定する Enter では送信しない**（`KeyboardEvent.isComposing` が真のときは無視する）。
- 入力欄は `type="text"` のまま（I5）。

### 編集してよいファイル
- `frontend/components/userList.vue`、`settingWrap.vue`、`voiceSetting.vue`、`generalSetting.vue`、`ingameSetting.vue`、`JoinLocks.vue`
- `frontend/pages/index.vue`（通知の `v-snackbar` を置く場合は `frontend/app.vue` も可）
- `frontend/utils/socketSession.ts`、`frontend/composables/useVoice.ts`、`frontend/composables/useSocket.ts`
- 新規: 通知のストアか composable（`frontend/stores/` または `frontend/composables/`）、純粋な関数を切り出す場合は `frontend/utils/`
- `packages/shared/src/index.ts`（`debug` の ack の型だけ）
- `backend/src/socketServer.ts`（`debug` の ack だけ）
- テスト: `frontend/test/`、`backend/test/socketServer.test.ts`、`packages/shared` のテスト、`e2e/`（追加してよい）
- `docs/DESIGN.md`（画面の説明と `debug` の ack の記述）

## テスト方針（必須）
- 単体テスト
  - 通知のストア（または composable）: 成功と失敗の表示、表示時間の定数
  - デバッグ送信: ack `ok: true` → 成功、`ok: false`・タイムアウト・未接続 → 失敗（`socketSession` か、切り出した関数で確かめる）
  - backend: `debug` に ack があれば、書き込み時は `ok: true`、制限超過は `ok: false`。ack なしの送信も今までどおり書き込まれる
  - Enter での送信の判定（`isComposing` のとき送らない、押せない状態のとき送らない）。純粋な関数に切り出してテストしてよい
- E2E（`pnpm dev:e2e` を `.env.development` の値のまま起動して `pnpm e2e`。設定の上書きはしない）
  - 既存の 6 件が通ること
  - 追加: 参加中に「全てのプレイヤー」タブで音量のスライダーが表示されること、タブの人数の表示、デバッグ送信で「送信完了」の通知が出ること。可能なら、パスワード欄の Enter での送信も確かめる
- 画面幅 1280px と 390px のスクリーンショットを撮り、設定ダイアログ（サウンドのタブ）の表示を確かめる。保存先: `C:\Users\Horry\.clodex\artifacts\E--dev-SyakasabaVC-29b73fa9\`（ファイル名は `ux-settings-desktop.png`・`ux-settings-mobile.png`）。RESULT にパスを書く。
- 最後にルートで `pnpm test` と `pnpm typecheck` を通す。

## Discretion
- 通知の仕組みをストアにするか composable にするか、その名前と置き場所
- バッジの色と位置の細かい調整、ダイアログの高さ、各タブの列の割り当て
- ack のタイムアウトの実装方法（Socket.IO の `timeout()` を使うかどうか）
- `v-tooltip` をモバイルで開く方法（`open-on-click` など）
