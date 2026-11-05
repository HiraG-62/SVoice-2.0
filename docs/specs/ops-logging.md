# ops-logging: 本番のサーバーログに時刻を付ける

## 背景
本番（`svoice.exe` を WinSW 2.x でサービス化）では、stdout / stderr を WinSW が `data/service-logs/` に保存する（`docs/DEPLOY.md`「確認」）。アプリは `console.*` で書いているだけで、WinSW 2.x の `roll-by-size` も時刻を付けないため、障害の時刻とログの行を突き合わせられない。

本番は 1 プロセスで backend と frontend（Nitro）を動かす。exe のエントリは `tools/package/common.mjs` が生成し、`tools/package/runtime.mjs` の `launch()` から始まる。backend（`backend/dist/index.cjs`）と frontend（`frontend/.output/server/index.mjs`）はその後に読み込まれる。

## Fixed

### 振る舞い
- 本番の exe のプロセスでは、`console.log` / `console.info` / `console.warn` / `console.error` / `console.debug` の出力の各行の先頭に時刻を付ける。backend・frontend・`runtime.mjs` 自身のログのすべてが対象。
- 書式: `<時刻> <元のメッセージ>`。時刻はローカル時刻のミリ秒までの ISO 8601 で、UTC との時差を付ける（例 `2026-11-06T01:27:31.123+09:00`）。
- 元のメッセージは、引数を `util.format(...args)` でまとめた文字列にする（`%s` などの書式指定を壊さないため）。複数行のメッセージ（スタックトレースなど）は、先頭の行だけに時刻を付ける。
- `launch()` の最初（`--stop` の判定や最初の `console.log` より前）で有効にする。`--stop`（WinSW の停止用）の出力にも付ける。
- 2 回有効にしても、時刻は 2 重に付かない。
- 出力先は変えない（`log` / `info` / `debug` は stdout、`warn` / `error` は stderr のまま）。

### 変えないもの
- 開発時の `pnpm dev`、backend 単体の `pnpm start` / `pnpm dev`、`nuxt dev` の出力は変えない（この変更は本番の exe だけが対象）。
- ログのメッセージ本文、ポート、イベント名、`debug` イベントの jsonl（`<DATA_DIR>/logs/`）の形式は変えない。
- `backend/`・`frontend/`・`packages/shared/` のコードは変えない。

### 編集してよいファイル
- `tools/package/logTime.mjs`（新規）: 時刻の整形と `console` の差し替え
- `tools/package/logTime.test.mjs`（新規）: `node --test` のテスト（ルートの `pnpm test` が `tools/package/*.test.mjs` を実行する）
- `tools/package/runtime.mjs`: `launch()` の最初で有効にする
- `tools/package/smoke.mjs`・`tools/package/smoke-process.mjs`: smoke がログの内容を照合していて、時刻が付くと失敗する場合。加えて、`startupFailures` の後処理の競合（起動失敗で exe が終わった後に停止要求を送り、`停止用トークンの読み込み失敗` になる）の修正。smoke 側だけを直し、`stop.mjs`・`runtime.mjs`・`lifecycle.mjs` の停止の振る舞いは変えない。起動失敗で終了コードが 0 以外になることの確認は弱めない
- `tools/package/smoke-process.test.mjs`: 上の競合の修正の回帰テスト
- `docs/PACKAGING.md`: 必要なら 1 行
- （`docs/DEPLOY.md` は claude が更新する）

### テスト
- 時刻の書式（時差が正・負・0 のとき。時差はテストで固定できるように、関数の引数で渡せるようにする）
- `util.format` の書式指定（`console.log('%s 人', 3)` → `<時刻> 3 人`）とオブジェクトの引数
- 複数行のメッセージで先頭だけに付くこと
- 2 回有効にしても 2 重に付かないこと
- stdout / stderr の振り分けが元と同じこと（差し替え前の関数をテスト用に差し込めるようにする）

## Discretion
- `logTime.mjs` の関数の名前と分け方、時刻を得る関数の差し込み方
- 2 重適用の防ぎ方（`Symbol` の印など）
- Nitro（consola）など、`console.*` を通らずに `process.stdout` へ直接書く出力は対象外でよい。見つけたら RESULT に書く
- Node が直接 stderr に書く未捕捉の例外の出力も対象外でよい

## 完了の確認
- `pnpm test`、`pnpm typecheck`
- `pnpm package` と `pnpm package:smoke` が通ること（smoke は開発用の 5 ポートを使う。開発サーバーが動いていたら止めずに、smoke は実行せず RESULT にそう書く）。smoke のログ（`smoke-*.log`）で、行の先頭に時刻が付いていることを確かめ、例を数行 RESULT に貼る（秘密情報が含まれる行は貼らない）
