# voice-subscription-sync: 購読状態を SkyWay の実際の状態と同期する

> 状態: **保留**（2026-11-03。現状整理を優先するため、実装は取り消した）

## 背景

- `frontend/composables/useSkyway.client.ts` は、相手ごとの購読状態をクロージャ内のフラグ（`isNearby` / `subscribing` / `sub`）だけで管理している（コミット `0f7a716` のリファクタリング）。
- 旧版（`E:\dev\_archive\SyakasabaVC\SVoice-2.0` の未コミット変更、2025-08）は、同じ「音声が聞こえなくなる」問題に対して、**SkyWay 側の subscription の実際の状態**を見て判定していた:
  ```ts
  const active = me.subscriptions.some(s => s.id === member.sub && s.state !== 'canceled');
  if (shouldSubscribe && !active && room.publications.includes(member.pub)) await subscribeAttach(member.pub);
  if (shouldUnsubscribe && active) { await me.unsubscribe(member.sub); unsubscribeCleanup(name); }
  ```
- 今のコードは、SkyWay 側で subscription が `canceled` になったり消えたりしても `isNearby === true` のまま残る。この場合、二度と購読し直さず、音声が聞こえないままになる。publication が unpublish された後に subscribe を試みる可能性もある。
- 今回は、今のクロージャ構造を保ったまま、旧版の考え方（実際の状態で active を判定し、生きている publication だけを購読する）を取り込む。

## Fixed

### 変更してよいファイル
- `frontend/composables/useSkyway.client.ts` のみ
- ビルドで生成される `frontend/.nuxt/`、`frontend/.output/`

### 振る舞い

1. **実際の購読状態との同期**: `handleCycle` の冒頭で、ローカルが購読済み（`isNearby && sub`）の場合に、`me.subscriptions` の中に `id === sub` かつ `state !== 'canceled'` のものがあるか確認する。なければ、`doCleanup()` でローカルの音声ノードと一覧の表示を破棄し（`me.unsubscribe` は呼ばない）、未購読の状態として後続の判定へ進む。その結果、`shouldSubscribe` が真ならそのサイクルで購読し直す。
2. **生きている publication だけを購読する**: `doSubscribe` の前に、`room.publications` に同じ `id` の publication があり、かつ `publication.state !== 'canceled'` であることを確認する。満たさない場合は購読しない（エラーにもしない）。
3. **同じ名前での再 publish**: `addJoinMember` で、同じ `pubName` の handler がすでに `memberHandlers` にある場合は、既存の handler の `remove()` を呼んでから新しく登録する。`userList` に同じゲーマータグが重複して残らないようにするため。
4. **watch の後始末**: 今は subscribe するたびに `watch(() => nearbyUserInfo.gain)` と `watch(changeGain)` が作られ、停止されない。これらの停止関数を保持し、`doCleanup()` で止める。`addJoinMember` の `watch(joinUserInfo)` は `remove()` で止める。
4a. **破棄済み handler の無効化**: `remove()` された handler（再 publish、退出、メンバー離脱）で、実行中の subscribe / unsubscribe が後から完了した場合は、結果を反映しない。subscribe が完了していれば、その subscription を unsubscribe して捨てる。クロージャ内の `disposed` フラグなどで判定する。
4b. **`exit` での後始末**: `exit` ハンドラーでは、各 handler に対して `cleanup()` ではなく `remove()` を呼ぶ（`watch(joinUserInfo)` も止めるため）。`userList` / `nearbyUserList` が空になり、`me.leave()` するという結果は変えない。
5. 次の点は変えない: `shouldSubscribe` の条件（全体発言者か、音量が 0 より大きい）、音量の計算、`isProcessingDataCycle` による重複実行の防止、`exit` と `leftMemberDettach` の流れ、Socket.IO のイベント、UI。

### 不変条件
- 1 人の相手について、`nearbyUserList` の要素は最大 1 つ、`userList` の要素も最大 1 つ。
- `doCleanup()` は何度呼んでも安全（冪等）であること。

### 完了条件（RESULT に実行コマンドと結果を含める）
- `cd frontend; npm run build` が成功する
- `node backend/test/express.test.js` が成功する（backend は変更しないが、回帰の確認として実行する）
- 型チェック: `cd frontend; npx -y -p typescript@5.9 -p vue-tsc@3 vue-tsc --noEmit -p .nuxt/tsconfig.app.json` のエラー数が、変更前の 15 件から増えないこと。`useSkyway.client.ts` のエラー数（変更前 8 件）を RESULT に書く
- このリポジトリに `pnpm test` / `pnpm typecheck` はない。上の 3 つで代える
- ブラウザでの通話確認は認証情報が必要なため不要。手動確認で見るべき点（`docs/MANUAL_TEST.md` の「距離による音量」に何を足すとよいか）を RESULT に箇条書きで書く

## Discretion
- 状態の判定をクロージャ内の小さな関数に切り出すか、その名前と構成。
- 1 の判定に、ポーリング（毎サイクルの確認）に加えて SkyWay のイベント（`me.onPublicationUnsubscribed` など）も使うかどうか。使う場合は `exit` で解除すること。
- `useSkyway.client.ts` に既にある型エラー（`stream.getTracks()[0]` が undefined の可能性、`doCleanup` 内の `info` が undefined の可能性）を、ついでに直すかどうか。直すなら振る舞いは変えない。
- 判定用のログ（`console.log`）を足すかどうか。足すなら、再購読したときだけの 1 行にする。
