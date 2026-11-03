import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicAssetKey } from './common.mjs';

test('公開 asset の URL は query を除き、埋め込みキーに変換する', () => {
  assert.equal(publicAssetKey('/_nuxt/app.js?v=1'), 'public/_nuxt/app.js');
  assert.equal(publicAssetKey('/fonts/a%20b.woff2'), 'public/fonts/a b.woff2');
});

test('公開先の外へ出る URL と不正なエンコードを拒否する', () => {
  for (const path of ['/../private', '/%2e%2e/private', '/a%5cb', '/%00', '/%ZZ']) {
    assert.equal(publicAssetKey(path), undefined);
  }
});
