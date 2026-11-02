# frontend-deps-audit: frontend の npm 脆弱性対応

## 背景

- ユーザーが `npm-check-updates` で frontend / backend の依存を最新メジャーへ更新し、`npm install` 済み（未コミット）。
  - frontend: nuxt 3→4、vuetify 3→4、@skyway-sdk/room 1→2、express 4→5 など
  - 更新前の lock は `frontend/package-lock.old.json`（ユーザーのバックアップ。触らない）
- この状態で `npm run build` は成功する。backend の `npm audit` は 0 件。
- frontend の `npm audit` は 49 件（critical 1 / high 19 / moderate 25 / low 4）。
- マルウェア混入は確認済みで問題なし（この作業の対象外）。

## 原因の内訳

大半は frontend のコードから一度も import されていない依存が引き込んでいる。

| 依存 | 引き込む脆弱性 | frontend での使用 |
|---|---|---|
| `@nuxtjs/auth-next`（Nuxt 2 用・放置） | `@nuxtjs/axios`, `axios@0.x`, `@nuxtjs/proxy`, `http-proxy-middleware`, `defu`, `cookie` | なし（認証は `nuxt-auth-utils`） |
| `bedrock-protocol` | `tar`(critical), `cmake-js`, `raknet-native`, `prismarine-auth`, `@azure/msal-node`, `uuid` | なし |
| `skyway`, `skyway-js`（旧 SDK） | `ajv`, `csv-parse`, `swagger-*`, `validator`, `query-string`, `decode-uri-component`, 旧 `socket.io-client` | なし（`@skyway-sdk/room` を使用） |
| `@skyway-sdk/room@2` | `@skyway-sdk/token` → `zod@3`, `zod-validation-error@3` | **使用中** |
| `nuxt@4` | `nitropack` → `archiver`, `glob`, `minimatch`, `deepmerge`, `@vercel/nft` など（ビルド時のみ） | **使用中** |

frontend のソース（`components/` `composables/` `pages/` `plugins/` `server/` `types/`）が実際に import しているのは
`@skyway-sdk/room`, `socket.io-client`, `@timephy/rnnoise-wasm`, `mitt`, `vuetify`, `@mdi/font`, `@nuxt/image`, `nuxt-auth-utils`, `h3`（nuxt 同梱）のみ。

## Fixed

### 変更してよいファイル

- `frontend/package.json`
- `frontend/package-lock.json`（`npm install` / `npm uninstall` による再生成）
- `frontend/node_modules/`（インストールによる変更）
- 依存削除・更新によってビルドや型が壊れた場合に限り、`frontend/` 配下のソース

### やること

1. frontend の `dependencies` / `devDependencies` から、ソースで使われていない次の依存を削除する。
   - `@nuxtjs/auth-next`, `@nuxt/types`, `bedrock-protocol`, `skyway`, `skyway-js`, `axios`,
     `discord.js`, `@discordjs/voice`, `express`, `express-session`, `@types/express`, `@types/express-session`,
     `socket.io`（サーバー側パッケージ。クライアントは `socket.io-client`）, `@types/socket.io-client`（stub 型）
   - 削除前に `grep` で frontend ソース（`node_modules` / `.nuxt` / `.output` を除く）に参照がないことを各パッケージで確認する。参照があれば削除せず QUESTION。
2. `vue` / `vue-router` の `"latest"` 指定は、インストール済みバージョンの `^x.y.z` に固定する（`latest` は再現性がないため）。
3. 残った脆弱性を `npm audit` で確認し、下の Discretion の方針で `overrides` を検討する。
4. パッケージマネージャは npm のまま（lock が npm のため。pnpm への移行はしない）。
5. backend は変更しない。

### 完了条件（RESULT に実行コマンドと結果を含める）

- `cd frontend && npm audit` の結果（件数と残った項目の一覧）
- `cd frontend && npm run build` が成功
- 残った脆弱性それぞれについて「なぜ残したか」を 1 行で説明
- このプロジェクトには `test` / `typecheck` スクリプトがない。`pnpm test` / `pnpm typecheck` は実行不要。代わりに上記 build を通す。

## Discretion

- `overrides` の採否と対象バージョン。方針:
  - 同じメジャー内で修正版がある推移的依存は `overrides` で上げてよい。
  - メジャーを跨ぐ override（例: `zod` 3→4、`glob` 10→14）は、使用元が動くことを確認できた場合のみ採用する。
    - `zod` を上げる場合は、`@skyway-sdk/room` の `SkyWayAuthToken` を `composables/useSkyway.client.ts` と同じ形のダミー値で生成し `encode(secretKey)` まで通る Node スクリプトで確認する（スクリプトはコミット対象外の一時ファイルでよい）。通らなければ override しない。
  - nuxt / nitropack 経由のビルド時専用依存で、安全な override が見つからないものは残してよい。
- `npm audit fix`（`--force` なし）を使うかどうか。`--force` は使わない（nuxt を 4.1.3 へ下げる等の不適切な変更が入るため）。
- `@skyway-sdk/room@2` の API が `composables/useSkyway.client.ts` の使い方と食い違う箇所を見つけた場合、型定義（`node_modules/@skyway-sdk/room` の `.d.ts`）に合わせて最小限修正してよい。修正したら RESULT に記載。
